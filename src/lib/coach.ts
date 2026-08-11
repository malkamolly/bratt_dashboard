// ============================================================================
// Coach Mode — the mentoring conversation brain
// ============================================================================
// After an analysis, Claude plays an eager up-and-coming sales arborist and
// interviews a senior mentor about the property to learn how to assess it
// better. Two operations:
//   runCoachChat      — the next conversational turn (asks/reacts)
//   runCoachSummarize — at wrap-up, distills the chat into proposed playbook
//                       lessons the mentor can approve
//
// Stateless like the analyzer: the client sends the whole conversation each
// turn. Replies are kept short because they're read aloud in the browser.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { VIDEO_NOTES_MODEL, type Findings } from './video-notes';

export type CoachMessage = { role: 'assistant' | 'user'; text: string };
export type ProposedLesson = { category: string; title: string; content: string };

const KICKOFF =
  "I've just finished analyzing this property from the walkthrough video. Ask me your questions so you can learn to assess it the way I would.";

function coachSystem(findings: Findings): string {
  return `You are an eager, sharp, up-and-coming sales arborist at Bratt Tree, reviewing an estimate walkthrough with a senior mentor (the person you're talking to). You produced the analysis below from the video. Your goal is to LEARN how the mentor assesses this property so that future analyses get better.

Ask specific, curious, genuinely insightful questions — about tree species and health, hazards and structure, what work to recommend and how to scope/price it, access, and especially anything you might have missed or gotten wrong. Ground your questions in specifics from the analysis. React to the mentor's answers and dig deeper where it's interesting.

Style:
- Ask 2-4 questions at a time, not a wall of them.
- Keep every message short and conversational — it will be read aloud.
- Be humble and curious, not a know-it-all.
- Use a first name + last initial for any person; never a full last name.
- Do not use any internal or system XML tags.

Here is the analysis you produced:
${JSON.stringify(findings, null, 2)}`;
}

function toMessages(history: CoachMessage[]): Anthropic.MessageParam[] {
  // The API needs the first message to be from the user, so we always lead with
  // a kickoff user turn, then replay the real Q&A.
  const msgs: Anthropic.MessageParam[] = [{ role: 'user', content: KICKOFF }];
  for (const m of history) {
    msgs.push({ role: m.role, content: m.text });
  }
  return msgs;
}

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set.');
  }
  return new Anthropic();
}

/**
 * Stream the coach's next message as plain text.
 *
 * The chat used to be requested whole: the arborist waited for the entire reply
 * to be written, and only then did audio generation start. Streaming lets the
 * caller speak the first sentence while the rest is still being written, so the
 * two slow stages overlap instead of running end to end.
 */
export function streamCoachChat(
  findings: Findings,
  history: CoachMessage[],
): ReadableStream<Uint8Array> {
  const stream = client().messages.stream({
    model: VIDEO_NOTES_MODEL,
    max_tokens: 1000,
    thinking: { type: 'disabled' },
    system: coachSystem(findings),
    messages: toMessages(history),
  });

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        // The client shows whatever text already arrived, so a mid-stream failure
        // degrades to a short reply rather than an error screen.
        controller.error(err);
      }
    },
    cancel() {
      stream.abort();
    },
  });
}

/** Produce the coach's next message given the conversation so far. */
export async function runCoachChat(
  findings: Findings,
  history: CoachMessage[],
): Promise<string> {
  const response = await client().messages.create({
    model: VIDEO_NOTES_MODEL,
    max_tokens: 1000,
    thinking: { type: 'disabled' },
    system: coachSystem(findings),
    messages: toMessages(history),
  });
  if (response.stop_reason === 'refusal') {
    throw new Error('The coach declined to respond.');
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock && textBlock.type === 'text' ? textBlock.text : '';
}

function extractJsonArray(text: string): string {
  const start = text.indexOf('[');
  if (start === -1) throw new Error('No JSON array found in the response.');
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
  throw new Error('Unbalanced JSON array in the response.');
}

/** At wrap-up, distill the conversation into reusable playbook lessons. */
export async function runCoachSummarize(
  findings: Findings,
  history: CoachMessage[],
): Promise<ProposedLesson[]> {
  const messages = toMessages(history);
  messages.push({
    role: 'user',
    content:
      "That's the end of our conversation. Distill what you learned from me into concise, REUSABLE playbook lessons that should apply to future video analyses — not facts specific to this one property, and not things that were already obvious. Each lesson needs a category, a short title, and 1-3 sentences of visually-checkable guidance. Respond with ONLY a JSON array (no prose, no markdown fences): [{ \"category\": \"string\", \"title\": \"string\", \"content\": \"string\" }]. If you genuinely learned nothing reusable, return [].",
  });

  const response = await client().messages.create({
    model: VIDEO_NOTES_MODEL,
    max_tokens: 3000,
    thinking: { type: 'disabled' },
    system: coachSystem(findings),
    messages,
  });
  if (response.stop_reason === 'refusal') {
    throw new Error('The coach declined to summarize.');
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return [];
  return JSON.parse(extractJsonArray(textBlock.text)) as ProposedLesson[];
}
