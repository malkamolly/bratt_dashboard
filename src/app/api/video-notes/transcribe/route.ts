// ============================================================================
// POST /api/video-notes/transcribe  (hub roles)
// ============================================================================
// Turns a recorded audio clip into text using Groq's Whisper API, so Coach Mode
// can be a voice conversation. Expects multipart/form-data with an "audio" file.
// Needs GROQ_API_KEY (free tier at console.groq.com).
// ============================================================================

import { NextResponse } from 'next/server';
import { getAllowedUser, canUseVideoNotes } from '@/lib/auth';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const GROQ_WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo';

export async function POST(request: Request) {
  const user = await getAllowedUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!canUseVideoNotes(user.email)) {
    return NextResponse.json({ error: 'No access.' }, { status: 403 });
  }
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY is not set. Add it in Vercel to enable voice, or type your answer instead.' },
      { status: 500 },
    );
  }

  let audio: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get('audio');
    if (f instanceof File) audio = f;
  } catch {
    return NextResponse.json({ error: 'Invalid audio upload.' }, { status: 400 });
  }
  if (!audio) return NextResponse.json({ error: 'No audio received.' }, { status: 400 });

  try {
    const groqForm = new FormData();
    groqForm.append('file', audio, audio.name || 'audio.webm');
    groqForm.append('model', GROQ_WHISPER_MODEL);

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: groqForm,
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `Transcription service error (${res.status}).`, detail },
        { status: 502 },
      );
    }
    const json = (await res.json()) as { text?: string };
    return NextResponse.json({ text: (json.text ?? '').trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
