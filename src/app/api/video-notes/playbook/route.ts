// ============================================================================
// POST /api/video-notes/playbook  (admin only)
// ============================================================================
// Edit or delete playbook entries from the admin Playbook view.
//   { action: "update", id, category?, title?, content?, active? }
//   { action: "delete", id }
// Uses the service-role client for the write, after checking admin access.
// ============================================================================

import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { getAllowedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Body = {
  action?: 'update' | 'delete';
  id?: string;
  category?: string;
  title?: string;
  content?: string;
  active?: boolean;
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
  if (!body.id) {
    return NextResponse.json({ error: 'Missing entry id.' }, { status: 400 });
  }

  const supabase = adminClient();

  if (body.action === 'delete') {
    const { error } = await supabase.from('arborist_playbook').delete().eq('id', body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'update') {
    const patch: Record<string, unknown> = {};
    if (typeof body.category === 'string') patch.category = body.category.trim();
    if (typeof body.title === 'string') patch.title = body.title.trim();
    if (typeof body.content === 'string') patch.content = body.content.trim();
    if (typeof body.active === 'boolean') patch.active = body.active;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }
    const { error } = await supabase.from('arborist_playbook').update(patch).eq('id', body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
