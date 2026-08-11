// ============================================================================
// POST /api/video-notes/coach  (hub roles)
// ============================================================================
// Drives the Coach Mode conversation. Stateless: the client sends the analysis
// findings plus the whole conversation so far.
//   mode = "chat"      -> returns { reply }   (the coach's next message)
//   mode = "summarize" -> returns { lessons } (proposed playbook lessons)
// ============================================================================

import { NextResponse } from 'next/server';
import { getAllowedUser, canUseVideoNotes } from '@/lib/auth';
import {
  runCoachChat,
  runCoachSummarize,
  streamCoachChat,
  type CoachMessage,
} from '@/lib/coach';
import type { Findings } from '@/lib/video-notes';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type Body = {
  findings?: Findings;
  history?: CoachMessage[];
  mode?: 'chat' | 'summarize';
  // Chat only: stream the reply as plain text instead of returning JSON, so the
  // client can start speaking the first sentence before the rest is written.
  stream?: boolean;
};

export async function POST(request: Request) {
  const user = await getAllowedUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!canUseVideoNotes(user.email)) {
    return NextResponse.json({ error: 'No access.' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!body.findings) {
    return NextResponse.json({ error: 'Missing analysis context.' }, { status: 400 });
  }
  const history = body.history ?? [];

  try {
    if (body.mode === 'summarize') {
      const lessons = await runCoachSummarize(body.findings, history);
      return NextResponse.json({ lessons });
    }
    if (body.stream) {
      return new NextResponse(streamCoachChat(body.findings, history), {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          Connection: 'keep-alive',
          // Belt and braces against intermediaries that buffer by default.
          'X-Accel-Buffering': 'no',
        },
      });
    }
    const reply = await runCoachChat(body.findings, history);
    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The coach hit an error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
