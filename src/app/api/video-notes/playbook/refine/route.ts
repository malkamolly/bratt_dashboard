// ============================================================================
// POST /api/video-notes/playbook/refine  (admin only)
// ============================================================================
// Powers the "refine with Claude" conversation on a single playbook entry.
//   { entry, history, mode: "chat" }  -> { reply }
//   { entry, history, mode: "apply" } -> { entry } (refined category/title/content)
// The admin still reviews and Saves the result — this only proposes.
// ============================================================================

import { NextResponse } from 'next/server';
import { getAllowedUser } from '@/lib/auth';
import {
  runRefineChat,
  runRefineApply,
  streamRefineChat,
  type RefineMessage,
  type RefinedEntry,
} from '@/lib/playbook-refine';
import { VIDEO_NOTES_MODEL } from '@/lib/video-notes';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type Body = {
  entry?: RefinedEntry;
  history?: RefineMessage[];
  mode?: 'chat' | 'apply';
  // Chat only: stream the reply so the client can speak it sentence by sentence.
  stream?: boolean;
};

export async function POST(request: Request) {
  const user = await getAllowedUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admins only.' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!body.entry) {
    return NextResponse.json({ error: 'Missing entry.' }, { status: 400 });
  }
  const history = body.history ?? [];

  try {
    if (body.mode === 'apply') {
      const entry = await runRefineApply(body.entry, history);
      return NextResponse.json({ entry });
    }
    if (body.stream) {
      return new NextResponse(streamRefineChat(body.entry, history), {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
          'X-Coach-Model': VIDEO_NOTES_MODEL,
        },
      });
    }
    const reply = await runRefineChat(body.entry, history);
    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The assistant hit an error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
