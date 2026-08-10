// ============================================================================
// POST /api/video-notes/tts  (video-notes trio)
// ============================================================================
// Natural text-to-speech via Groq's Orpheus model, so Coach Mode and the
// Playbook refine chat can speak in a human voice instead of the robotic
// browser default. Reuses the existing GROQ_API_KEY. Returns audio bytes; the
// client plays them, and falls back to the browser voice if this errors.
// ============================================================================

import { NextResponse } from 'next/server';
import { getAllowedUser, canUseVideoNotes } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MODEL = process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';
const DEFAULT_VOICE = 'hannah';

// "2h51m12s" -> "3 hours"; "14m2s" -> "15 minutes". Rounded up, so we never tell
// someone the voice is back before the quota has actually reset.
function humanizeRetry(raw: string): string {
  const hours = Number(/(\d+)h/.exec(raw)?.[1] ?? 0);
  const minutes = Number(/(\d+)m/.exec(raw)?.[1] ?? 0);
  const total = hours * 60 + minutes + (/\d+(?:\.\d+)?s/.test(raw) ? 1 : 0);
  if (total >= 60) return `${Math.ceil(total / 60)} hours`;
  return `${Math.max(1, total)} minutes`;
}

// Translate Groq's error into something an arborist can act on. The daily quota
// is the case we actually hit, so name it and say when the voice comes back.
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

  if (code === 'rate_limit_exceeded') {
    const retry = /try again in ([\dhms.]+)/i.exec(message)?.[1];
    return retry
      ? `Natural voice is out of quota for today — back in about ${humanizeRetry(retry)}.`
      : 'Natural voice is out of quota for today.';
  }
  if (status === 401 || status === 403) return 'The natural-voice key was rejected.';
  if (status === 404) return `The natural-voice model is unavailable (${MODEL}).`;
  return `The natural voice service failed (${status}).`;
}

export async function POST(request: Request) {
  const user = await getAllowedUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!canUseVideoNotes(user.email)) {
    return NextResponse.json({ error: 'No access.' }, { status: 403 });
  }
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'GROQ_API_KEY is not set.' }, { status: 500 });
  }

  let body: { text?: string; voice?: string };
  try {
    body = (await request.json()) as { text?: string; voice?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const text = (body.text ?? '').toString().slice(0, 1000).trim();
  if (!text) return NextResponse.json({ error: 'No text.' }, { status: 400 });
  const voice = (body.voice ?? DEFAULT_VOICE).toString();

  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, input: text, voice, response_format: 'wav' }),
    });
    if (!res.ok) {
      const raw = await res.text();
      // Keep the upstream body for diagnosis, but in the server logs only — it's
      // a nested JSON blob carrying our Groq org ID, and it used to get printed
      // verbatim on screen mid-coaching.
      console.error(`Groq TTS failed (${res.status}): ${raw}`);
      return NextResponse.json({ error: describeFailure(res.status, raw) }, { status: 502 });
    }
    const audio = await res.arrayBuffer();
    return new NextResponse(audio, {
      headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TTS failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
