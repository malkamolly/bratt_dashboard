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

// The entry plus instructions are identical across every turn of a refine
// session, so cache them rather than re-processing before each reply.
function cachedSystem(entry: RefinedEntry): Anthropic.TextBlockParam[] {
  return [{ type: 'text', text: system(entry), cache_control: { type: 'ephemeral' } }];
}

function toMessages(history: RefineMessage[]): Anthropic.MessageParam[] {
  return history.map((m) => ({ role: m.role, content: m.text }));
}

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
  return new Anthropic();
}

/**
 * Stream the refine reply as server-sent events.
 *
 * Mirrors streamCoachChat: the client speaks each sentence as it arrives instead
 * of waiting for the whole reply to be written and then rendered to audio. The
 * leading comment lets the client distinguish a blocked transport from a model
 * that is simply still thinking.
 */
export function streamRefineChat(
  entry: RefinedEntry,
  history: RefineMessage[],
): ReadableStream<Uint8Array> {
  const stream = client().messages.stream({
    model: VIDEO_NOTES_MODEL,
    max_tokens: 800,
    thinking: { type: 'disabled' },
    system: cachedSystem(entry),
    messages: toMessages(history),
  });

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(': open\n\n'));
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event.delta.text)}\n\n`));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      stream.abort();
    },
  });
}

export async function runRefineChat(
  entry: RefinedEntry,
  history: RefineMessage[],
): Promise<string> {
  const response = await client().messages.create({
    model: VIDEO_NOTES_MODEL,
    max_tokens: 800,
    thinking: { type: 'disabled' },
    system: cachedSystem(entry),
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
    system: cachedSystem(entry),
    messages,
  });
  if (response.stop_reason === 'refusal') throw new Error('The assistant declined to respond.');
  const t = response.content.find((b) => b.type === 'text');
  if (!t || t.type !== 'text') throw new Error('No text returned.');
  return JSON.parse(extractJson(t.text)) as RefinedEntry;
}
