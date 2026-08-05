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

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
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

// ============================================================================
// Reference-PDF → Playbook ingestion
// ============================================================================
// Reads every PDF in content/references/ and asks Claude to distill each into
// playbook entries tagged source='reference'. These feed the video analyzer but
// are kept separate from the Training Library: they never show up in the Sales
// Arborist Library, and re-running the Library import can't delete them (it only
// touches source='library'). See docs/video-notes.md and content/references.
//
// We send each PDF to Claude as a `document` block (base64) rather than parsing
// the text ourselves — no extra dependency, and it handles the diagrams, photos,
// and ID charts these arborist references are full of.
// ============================================================================

const REFERENCES_ROOT = path.join(process.cwd(), 'content', 'references');

// Claude's per-request document limits are 32 MB / 600 pages. base64 inflates
// size by ~33%, so cap the raw PDF a bit under 32 MB to stay safe once encoded.
const MAX_PDF_BYTES = 24 * 1024 * 1024;

const REFERENCE_INGEST_SYSTEM = `You are distilling an OUTSIDE arborist reference document (a PDF such as a study guide, field manual, climbing/rigging guide, pest guide, or spec sheet) into a concise playbook. An AI applies this playbook when reviewing property-walkthrough videos to help a Bratt Tree arborist scope and estimate tree work.

Capture any knowledge that would help an experienced arborist estimator on a property walkthrough. Depending on the document, that includes:
- identifying trees from bark, leaf, or form cues,
- recognizing signs of diseases, pests, defects, and disorders,
- judging structural hazards and risk (dead limbs, cracks, decay, lean, included bark, poor unions),
- deciding and scoping the work: removal method, rigging complexity, felling vs. climbing vs. crane, pruning, cabling/bracing,
- crew and site safety (power lines, drop zones, hazards to plan around),
- plant-health-care and other sales opportunities,
- access, soil, and site conditions.

Take what the document actually covers. A climbing/rigging manual should yield rigging, removal-method, knot/gear, and safety guidance; a pest guide should yield diagnostic cues; and so on. Do NOT force it into only one of the categories above.

Rules:
- Be compact. Each entry is 1-4 sentences of actionable guidance. Skip history, exam-prep trivia, pricing tables, and pure administrivia.
- Prefer concrete, usable guidance over general prose.
- Produce roughly 12-30 entries from this document, grouped into sensible categories. This is a substantial arborist reference — it will always contain plenty worth capturing, so do not return an empty list.
- Use only first name + last initial if any person is named.

Respond with ONLY a JSON array (no prose, no markdown fences) of objects:
[{ "category": "string", "title": "string (short)", "content": "string (1-4 sentences)" }]`;

/**
 * Distill one PDF into playbook entries. Throws on an API refusal or unparseable
 * response so the caller can record which file failed and keep going.
 */
async function distillReferencePdf(
  client: Anthropic,
  fileName: string,
  base64: string,
): Promise<IngestEntry[]> {
  const content: Anthropic.ContentBlockParam[] = [
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    },
    {
      type: 'text',
      text: `This is an outside arborist reference titled "${fileName}". Distill it into the playbook as specified.`,
    },
  ];

  const response = await client.messages.create({
    model: VIDEO_NOTES_MODEL,
    max_tokens: 8000,
    thinking: { type: 'disabled' },
    system: REFERENCE_INGEST_SYSTEM,
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to distill this document.');
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('The model returned no text to parse.');
  }
  const entries = JSON.parse(extractJsonArray(textBlock.text)) as IngestEntry[];
  if (!Array.isArray(entries)) {
    throw new Error('The distillation did not produce a list.');
  }
  return entries;
}

/**
 * Read every PDF in content/references, distill each into playbook entries, and
 * replace the existing source='reference' rows. `supabase` should be a
 * service-role client (the caller must already have checked owner access).
 *
 * Best-effort per file: a PDF that's too big or that Claude can't read is
 * skipped and named in the result rather than sinking the whole batch. Nothing
 * is written to the database until every PDF has been processed, so a mid-run
 * timeout leaves the existing entries untouched — just re-run it.
 */
export async function ingestReferences(
  supabase: SupabaseClient,
  createdBy: string,
): Promise<{ count: number; sources: number; skipped: string[] }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set.');
  }

  // 1. Find the PDFs.
  let fileNames: string[];
  try {
    const all = await readdir(REFERENCES_ROOT);
    fileNames = all.filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  } catch {
    throw new Error(
      'No content/references folder was found. Add PDFs there first.',
    );
  }
  if (fileNames.length === 0) {
    throw new Error('No PDF files were found in content/references.');
  }

  // 2. Distill each PDF. Collect entries; note any we had to skip.
  const client = new Anthropic();
  const rows: {
    category: string;
    title: string;
    content: string;
    source: 'reference';
    source_ref: string;
    created_by: string;
    active: boolean;
  }[] = [];
  const skipped: string[] = [];
  const empty: string[] = []; // processed fine, but the model returned no entries

  for (const fileName of fileNames) {
    try {
      const buf = await readFile(path.join(REFERENCES_ROOT, fileName));
      if (buf.length > MAX_PDF_BYTES) {
        skipped.push(`${fileName} (too large — over 24 MB)`);
        continue;
      }
      const entries = await distillReferencePdf(
        client,
        fileName,
        buf.toString('base64'),
      );
      if (entries.length === 0) {
        empty.push(fileName);
        continue;
      }
      for (const e of entries) {
        rows.push({
          category: e.category,
          title: e.title,
          content: e.content,
          source: 'reference',
          source_ref: fileName,
          created_by: createdBy,
          active: true,
        });
      }
    } catch (err) {
      const why = err instanceof Error ? err.message : 'unknown error';
      skipped.push(`${fileName} (${why})`);
    }
  }

  if (rows.length === 0) {
    const detail: string[] = [];
    if (empty.length > 0) {
      detail.push(`the model found nothing applicable in: ${empty.join(', ')}`);
    }
    if (skipped.length > 0) detail.push(`skipped: ${skipped.join('; ')}`);
    throw new Error(
      `No entries were produced${detail.length ? ` (${detail.join('; ')})` : ''}.`,
    );
  }

  // 3. Replace the previous reference batch with the fresh one.
  await supabase.from('arborist_playbook').delete().eq('source', 'reference');
  const { error } = await supabase.from('arborist_playbook').insert(rows);
  if (error) throw new Error(error.message);

  return {
    count: rows.length,
    sources: fileNames.length - skipped.length,
    skipped,
  };
}
