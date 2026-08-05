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
      const detail = await res.text();
      return NextResponse.json(
        { error: `TTS service error (${res.status}).`, detail },
        { status: 502 },
      );
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
