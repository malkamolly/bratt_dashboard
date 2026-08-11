// ============================================================================
// POST /api/video-notes/tts  (video-notes trio)
// ============================================================================
// Natural text-to-speech so Coach Mode and the Playbook refine chat can speak
// in a human voice instead of the robotic browser default. Returns audio bytes;
// the client plays them and falls back to the browser voice if this errors.
//
// The provider is CONFIGURATION, not code. Every field below is an env var, so
// switching voice companies is a Vercel change rather than a deploy. This works
// because the OpenAI /audio/speech request shape is shared across providers —
// it's why Groq's own endpoint is /openai/v1/... To move back to Groq, set
// TTS_BASE_URL=https://api.groq.com/openai/v1 with a Groq key and model.
//
// Speech-to-text still runs on Groq (see ../transcribe) — its Whisper limits are
// generous. Only the outbound voice moved.
// ============================================================================

import { NextResponse } from 'next/server';
import { getAllowedUser, canUseVideoNotes } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BASE_URL = (process.env.TTS_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const API_KEY = process.env.TTS_API_KEY || process.env.OPENAI_API_KEY || '';
const MODEL = process.env.TTS_MODEL || 'gpt-4o-mini-tts';
const DEFAULT_VOICE = process.env.TTS_DEFAULT_VOICE || 'sage';

// gpt-4o-mini-tts takes a plain-English delivery note, which matters more for
// coaching than the voice choice does. Checked against undefined rather than
// falsiness so setting the var empty genuinely disables it — needed for models
// (and providers) that reject an unknown field.
const DEFAULT_INSTRUCTIONS =
  'Warm and patient, like a senior arborist mentoring a colleague in the field. ' +
  'Unhurried and genuinely curious, never salesy.';
const INSTRUCTIONS =
  process.env.TTS_INSTRUCTIONS !== undefined
    ? process.env.TTS_INSTRUCTIONS.trim()
    : DEFAULT_INSTRUCTIONS;

// tts-1 renders audio markedly faster than gpt-4o-mini-tts, which generates
// speech the way a model generates text. It rejects `instructions` though, so
// dropping it here keeps TTS_MODEL a one-variable switch: set tts-1 to trade
// delivery steering for speed, with nothing else to remember. (tts-1 also has a
// smaller voice list — sage and ash are on it, cedar and marin are not.)
const SUPPORTS_INSTRUCTIONS = !/^tts-1(-hd)?$/.test(MODEL);

// Comfortably inside both limits we care about (tts-1 caps at 4096 characters,
// gpt-4o-mini-tts at 2000 tokens). The old 1000 cut long coaching replies off
// mid-sentence.
const MAX_CHARS = 4000;

// WAV is uncompressed: a 40-second coaching reply runs 1-2 MB, which is a real
// wait on truck cell service before a single word plays. MP3 is roughly a tenth
// of that for the same speech.
const FORMAT = process.env.TTS_FORMAT || 'mp3';
const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  pcm: 'audio/pcm',
};

// "2h51m12s" -> "3 hours"; "14m2s" -> "15 minutes". Rounded up, so we never tell
// someone the voice is back before the quota has actually reset.
function humanizeRetry(raw: string): string {
  const hours = Number(/(\d+)h/.exec(raw)?.[1] ?? 0);
  const minutes = Number(/(\d+)m/.exec(raw)?.[1] ?? 0);
  const total = hours * 60 + minutes + (/\d+(?:\.\d+)?s/.test(raw) ? 1 : 0);
  if (total >= 60) return `${Math.ceil(total / 60)} hours`;
  return `${Math.max(1, total)} minutes`;
}

// Translate the provider's error into something an arborist can act on, rather
// than printing a nested JSON blob on screen mid-coaching.
function describeFailure(status: number, raw: string): string {
  let code = '';
  let message = '';
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: string; message?: string } };
    code = parsed.error?.code ?? '';
    message = parsed.error?.message ?? '';
  } catch {
    // Not JSON — fall through to the status-based message.
  }

  if (code === 'insufficient_quota') {
    return 'The voice account is out of credit — top it up to bring the natural voice back.';
  }
  if (code === 'rate_limit_exceeded' || status === 429) {
    const retry = /try again in ([\dhms.]+)/i.exec(message)?.[1];
    return retry
      ? `Natural voice is rate limited — back in about ${humanizeRetry(retry)}.`
      : 'Natural voice is rate limited. Try again in a moment.';
  }
  if (status === 401 || status === 403) return 'The natural-voice key was rejected.';
  if (status === 404) return `The natural-voice model is unavailable (${MODEL}).`;
  if (status === 400 && message) return `The natural voice rejected the request: ${message}`;
  return `The natural voice service failed (${status}).`;
}

export async function POST(request: Request) {
  const user = await getAllowedUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!canUseVideoNotes(user.email)) {
    return NextResponse.json({ error: 'No access.' }, { status: 403 });
  }
  if (!API_KEY) {
    return NextResponse.json(
      { error: 'No natural-voice key is set (TTS_API_KEY).' },
      { status: 500 },
    );
  }

  let body: { text?: string; voice?: string };
  try {
    body = (await request.json()) as { text?: string; voice?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const text = (body.text ?? '').toString().slice(0, MAX_CHARS).trim();
  if (!text) return NextResponse.json({ error: 'No text.' }, { status: 400 });
  const voice = (body.voice ?? DEFAULT_VOICE).toString();

  try {
    const res = await fetch(`${BASE_URL}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        input: text,
        voice,
        response_format: FORMAT,
        ...(INSTRUCTIONS && SUPPORTS_INSTRUCTIONS ? { instructions: INSTRUCTIONS } : {}),
      }),
    });
    if (!res.ok) {
      const raw = await res.text();
      // Keep the upstream body for diagnosis, but in the server logs only.
      console.error(`TTS failed (${res.status}) via ${BASE_URL}: ${raw}`);
      return NextResponse.json({ error: describeFailure(res.status, raw) }, { status: 502 });
    }
    const audio = await res.arrayBuffer();
    return new NextResponse(audio, {
      headers: {
        'Content-Type': AUDIO_MIME[FORMAT] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TTS failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
