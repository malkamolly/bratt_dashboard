// ============================================================================
// streamReply — one streaming chat flow, shared by both voice screens
// ============================================================================
// Coach Mode and the Playbook refine chat each had their own copy of "ask the
// model, then speak the answer". Only Coach Mode got the streaming work, so the
// Playbook chat stayed on the old blocking path and none of the speed fixes
// reached it — which is exactly the bug this file exists to prevent recurring.
//
// The flow: request the reply as server-sent events, show text as it lands, and
// hand each completed sentence to the voice immediately so speaking overlaps
// writing. If the stream doesn't carry bytes, fall back to the plain single
// request, which has always worked. The caller can never be left hanging.
// ============================================================================

import type { CoachVoice } from './useCoachVoice';

// Guards the transport, not the model's thinking time: the routes emit an SSE
// comment before touching the model, so a live connection proves itself quickly
// regardless of how long the first token takes.
const FIRST_BYTE_TIMEOUT_MS = 4000;

export type StreamedReply = {
  reply: string;
  /** Which model answered, for the timing readout. Empty if unreported. */
  model: string;
  /** True when streaming didn't engage and the plain request was used. */
  fellBack: boolean;
  /** Milliseconds until the first words were available. */
  replyMs: number;
};

export async function streamReply(opts: {
  url: string;
  /** Request body; `stream: true` is added for the streaming attempt. */
  payload: Record<string, unknown>;
  voice: CoachVoice;
  /** Called with the reply so far, so the screen can render it as it arrives. */
  onPartial: (text: string) => void;
  /** Called once, when the first words land. */
  onFirstText?: (ms: number) => void;
}): Promise<StreamedReply> {
  const { url, payload, voice, onPartial, onFirstText } = opts;
  const startedAt = Date.now();
  const controller = new AbortController();
  const watchdog = setTimeout(() => controller.abort(), FIRST_BYTE_TIMEOUT_MS);
  let reply = '';
  let model = '';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, stream: true }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`stream request failed (${res.status})`);

    if (res.body) {
      model = res.headers.get('x-coach-model') || '';
      const token = voice.beginUtterance();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let frameBuffer = '';
      let spokenUpTo = 0;

      // Hand every completed sentence to the voice. `spokenUpTo` indexes into
      // `reply`; matches are found in the unspoken remainder and the offset added
      // back, so the two never get confused.
      const flushSentences = (final: boolean) => {
        for (;;) {
          const rest = reply.slice(spokenUpTo);
          if (!rest.trim()) return;
          const match = rest.match(/[.!?]["')\]]?\s/);
          if (match?.index !== undefined) {
            const end = match.index + match[0].length;
            voice.enqueueSpeech(rest.slice(0, end));
            spokenUpTo += end;
            continue;
          }
          if (final) {
            voice.enqueueSpeech(rest);
            spokenUpTo = reply.length;
          }
          return;
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(watchdog);
        frameBuffer += decoder.decode(value, { stream: true });

        // Frames are separated by a blank line; keep any partial tail for later.
        const frames = frameBuffer.split('\n\n');
        frameBuffer = frames.pop() ?? '';
        for (const frame of frames) {
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const encoded = line.slice(5).trim();
            if (!encoded) continue;
            let text = '';
            try {
              text = JSON.parse(encoded) as string;
            } catch {
              continue;
            }
            if (!text) continue;
            if (!reply) onFirstText?.(Date.now() - startedAt);
            reply += text;
          }
        }
        if (reply) {
          onPartial(reply);
          flushSentences(false);
        }
      }
      flushSentences(true);

      if (reply.trim()) {
        await voice.waitForSpeech(token);
        return { reply, model, fellBack: false, replyMs: Date.now() - startedAt };
      }
    }
  } catch {
    // Keep a partial answer rather than discarding it; otherwise fall through to
    // the plain request, which will surface any real error properly.
    if (reply.trim()) {
      onPartial(reply);
      return { reply, model, fellBack: false, replyMs: Date.now() - startedAt };
    }
  } finally {
    clearTimeout(watchdog);
  }

  // Streaming produced nothing usable — use the path that has always worked.
  voice.stopSpeaking();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
  if (!res.ok) throw new Error(json.error || 'The assistant hit an error.');
  reply = json.reply || '';
  onFirstText?.(Date.now() - startedAt);
  onPartial(reply);
  await voice.speak(reply);
  return { reply, model, fellBack: true, replyMs: Date.now() - startedAt };
}
