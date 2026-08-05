// ============================================================================
// Library → Playbook ingestion
// ============================================================================
// Reads the whole Sales Arborist Training Library — the topic decks in
// content/topics plus the educational content from weekly meetings — and asks
// Claude to distill it into a concise set of playbook entries the video
// analyzer can apply. Run as a batch by an admin (see the ingest-library route);
// it replaces the previous source='library' entries so re-running just refreshes.
//
// The distillation is deliberately compressed: the playbook rides on every
// analysis, so we want high-signal guidance for *visually reviewing a property
// walkthrough*, not the full decks verbatim.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listTopicDecks, loadTopicSource } from './topic-deck';
import { listMeetings } from './meeting-data';
import { VIDEO_NOTES_MODEL } from './video-notes';

type IngestEntry = { category: string; title: string; content: string };

const INGEST_SYSTEM = `You are distilling Bratt Tree's internal Sales Arborist training material into a concise playbook that an AI will apply when reviewing property-walkthrough videos to prepare tree-work estimates.

Extract ONLY knowledge that helps when visually reviewing frames of a property, to:
- identify tree species from bark/leaf/form cues,
- recognize the visible signs of the diseases, pests, and disorders covered,
- judge hazards and structure (remove vs. cable/brace vs. prune vs. leave),
- surface plant-health-care and other sales opportunities,
- spot soil / site / access issues.

Rules:
- Be compact. Each entry is 1-4 sentences of actionable, visually-checkable guidance. Skip history, pricing tables, and anything not useful from images.
- Prefer concrete visual cues ("flagging red-brown leaves from the top down on a red oak in summer → suspect oak wilt") over general prose.
- Produce roughly 15-35 entries total, grouped into sensible categories.
- Use only first name + last initial if any person is named.

Respond with ONLY a JSON array (no prose, no markdown fences) of objects:
[{ "category": "string", "title": "string (short)", "content": "string (1-4 sentences)" }]`;

function extractJsonArray(text: string): string {
  const start = text.indexOf('[');
  if (start === -1) throw new Error('No JSON array found in the model response.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('Unbalanced JSON array in the model response.');
}

/**
 * Gather the whole Training Library, distill it into playbook entries, and
 * replace the existing source='library' rows. `supabase` should be a
 * service-role client (the caller must already have checked admin access).
 */
export async function ingestLibrary(
  supabase: SupabaseClient,
  createdBy: string,
): Promise<{ count: number; sources: number }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set.');
  }

  // 1. Topic decks (repo files).
  const decks = listTopicDecks();
  const deckTexts = await Promise.all(
    decks.map(async (d) => {
      const src = await loadTopicSource(d.slug);
      return src ? `# ${d.title} (tags: ${d.tags.join(', ')})\n${src}` : null;
    }),
  );

  // 2. Meeting educational bodies (database) — best-effort.
  let meetingTexts: string[] = [];
  try {
    const meetings = await listMeetings();
    meetingTexts = meetings
      .filter((m) => m.educational_title && m.educational_body)
      .map((m) => `# ${m.educational_title}\n${m.educational_body}`);
  } catch {
    // If meetings can't be read, still ingest the decks.
  }

  const parts = [...deckTexts.filter((t): t is string => !!t), ...meetingTexts];
  if (parts.length === 0) {
    throw new Error('No library content was found to ingest.');
  }
  const corpus = parts.join('\n\n---\n\n');

  // 3. Distill with Claude.
  const client = new Anthropic();
  const response = await client.messages.create({
    model: VIDEO_NOTES_MODEL,
    max_tokens: 8000,
    thinking: { type: 'disabled' },
    system: INGEST_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Here is the full Bratt Tree Sales Arborist training library. Distill it into the playbook.\n\n${corpus}`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to distill the library.');
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('The model returned no text to parse.');
  }
  const entries = JSON.parse(extractJsonArray(textBlock.text)) as IngestEntry[];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('The distillation produced no entries.');
  }

  // 4. Replace the previous library entries with the fresh batch.
  await supabase.from('arborist_playbook').delete().eq('source', 'library');
  const rows = entries.map((e) => ({
    category: e.category,
    title: e.title,
    content: e.content,
    source: 'library' as const,
    created_by: createdBy,
    active: true,
  }));
  const { error } = await supabase.from('arborist_playbook').insert(rows);
  if (error) throw new Error(error.message);

  return { count: rows.length, sources: parts.length };
}
