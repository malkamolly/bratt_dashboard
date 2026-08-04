// ============================================================================
// POST /api/video-notes/analyze
// ============================================================================
// Receives the frames the browser pulled from an estimate-walkthrough video,
// asks Claude to describe what it sees, stores the findings, and returns them.
//
// Auth: hub roles only (admin / user / sales_manager / sales_arborist), matching
// the RLS policy in migration 060. We check here too so the request fails fast
// with a clean 403 instead of a database error.
// ============================================================================

import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser, canAccessHub } from '@/lib/auth';
import { analyzeFrames, VIDEO_NOTES_MODEL, type Frame } from '@/lib/video-notes';

// Vision over a few dozen images can take a while — give it room (Vercel caps
// this at the plan's max; 60s is the Pro default).
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type Body = {
  frames?: Frame[];
  address?: string;
  videoName?: string;
  durationSeconds?: number;
};

export async function POST(request: Request) {
  const user = await getAllowedUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (!canAccessHub(user.role, 'hub')) {
    return NextResponse.json({ error: 'You do not have access to this tool.' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const frames = body.frames ?? [];
  if (!Array.isArray(frames) || frames.length === 0) {
    return NextResponse.json({ error: 'No frames were provided.' }, { status: 400 });
  }

  try {
    const findings = await analyzeFrames(frames, body.address);

    const supabase = await serverClient();
    const { data, error } = await supabase
      .from('video_analyses')
      .insert({
        created_by: user.email,
        video_name: body.videoName ?? null,
        address: body.address ?? null,
        duration_seconds: body.durationSeconds ?? null,
        frame_count: frames.length,
        status: 'complete',
        model: VIDEO_NOTES_MODEL,
        findings,
      })
      .select('id')
      .single();

    if (error) {
      // The analysis worked; only the save failed. Still return the findings so
      // the arborist isn't left empty-handed.
      return NextResponse.json({ id: null, findings, saveError: error.message });
    }

    return NextResponse.json({ id: data.id, findings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong analyzing the video.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
