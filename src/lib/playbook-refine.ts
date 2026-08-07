// ============================================================================
// Playbook entry refinement — a short conversation to sharpen ONE entry
// ============================================================================
// Lets an admin "keep talking" about a single playbook entry from the manager:
// discuss it with Claude, then apply Claude's refined version back into the
// edit fields (the human still reviews and Saves). Stateless — the client
// sends the current entry + the conversation each turn.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { VIDEO_NOTES_MODEL } from './video-notes';

export type RefineMessage = { role: 'assistant' | 'user'; text: string };
export type RefinedEntry = { category: string; title: string; content: string };

function system(entry: RefinedEntry): string {
  return `You are helping a Bratt Tree arborist refine ONE entry in the "playbook" that the video analyzer applies to property-walkthrough videos. Keep the entry concise, concrete, and visually-checkable — guidance someone can act on from video frames. Discuss and sharpen it with the arborist, asking a brief clarifying question when it helps. Keep replies short and conversational. Use a first name + last initial for any person; no internal/system XML tags.

Current entry:
- category: ${entry.category}
- title: ${entry.title}
- guidance: ${entry.content}`;
}

function toMessages(history: RefineMessage[]): Anthropic.MessageParam[] {
  return history.map((m) => ({ role: m.role, content: m.text }));
}

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
  return new Anthropic();
}

export async function runRefineChat(
  entry: RefinedEntry,
  history: RefineMessage[],
): Promise<string> {
  const response = await client().messages.create({
    model: VIDEO_NOTES_MODEL,
    max_tokens: 800,
    thinking: { type: 'disabled' },
    system: system(entry),
    messages: toMessages(history),
  });
  if (response.stop_reason === 'refusal') throw new Error('The assistant declined to respond.');
  const t = response.content.find((b) => b.type === 'text');
  return t && t.type === 'text' ? t.text : '';
}

function extractJson(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON found in the response.');
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
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('Unbalanced JSON in the response.');
}

export async function runRefineApply(
  entry: RefinedEntry,
  history: RefineMessage[],
): Promise<RefinedEntry> {
  const messages = toMessages(history);
  messages.push({
    role: 'user',
    content:
      'Produce the final refined entry reflecting our conversation. Respond with ONLY a JSON object (no prose, no markdown fences): {"category":"string","title":"string","content":"string"}.',
  });
  const response = await client().messages.create({
    model: VIDEO_NOTES_MODEL,
    max_tokens: 1000,
    thinking: { type: 'disabled' },
    system: system(entry),
    messages,
  });
  if (response.stop_reason === 'refusal') throw new Error('The assistant declined to respond.');
  const t = response.content.find((b) => b.type === 'text');
  if (!t || t.type !== 'text') throw new Error('No text returned.');
  return JSON.parse(extractJson(t.text)) as RefinedEntry;
}
