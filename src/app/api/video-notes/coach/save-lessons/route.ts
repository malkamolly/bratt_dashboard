// ============================================================================
// POST /api/video-notes/coach/save-lessons  (hub roles)
// ============================================================================
// Saves the lessons the mentor approved at the end of a Coach Mode session into
// the playbook (source = 'coach'). From then on, every analysis applies them.
// RLS lets a hub user insert rows attributed to themselves, so we use the
// normal (session) client and stamp created_by with their email.
// ============================================================================

import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser, canUseVideoNotes } from '@/lib/auth';
import type { ProposedLesson } from '@/lib/coach';

export const dynamic = 'force-dynamic';

type Body = { lessons?: ProposedLesson[] };

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

  const lessons = (body.lessons ?? []).filter(
    (l) => l && l.category?.trim() && l.title?.trim() && l.content?.trim(),
  );
  if (lessons.length === 0) {
    return NextResponse.json({ error: 'No valid lessons to save.' }, { status: 400 });
  }

  const supabase = await serverClient();
  const rows = lessons.map((l) => ({
    category: l.category.trim(),
    title: l.title.trim(),
    content: l.content.trim(),
    source: 'coach' as const,
    created_by: user.email,
    active: true,
  }));

  const { error } = await supabase.from('arborist_playbook').insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ count: rows.length });
}
