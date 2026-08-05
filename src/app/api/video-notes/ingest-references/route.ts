// ============================================================================
// POST /api/video-notes/ingest-references  (owner only)
// ============================================================================
// Distills every PDF in content/references/ into playbook entries the video
// analyzer applies (source='reference'). Replaces the previous reference batch,
// so it's safe to re-run whenever the PDFs change. These entries never appear in
// the Sales Arborist Library and are untouched by the Library import. Uses the
// service-role client for the write (after checking owner access), so it isn't
// blocked by RLS.
// ============================================================================

import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { getAllowedUser, isOwner } from '@/lib/auth';
import { ingestReferences } from '@/lib/playbook-ingest';

// Distilling several PDFs is a few Claude calls back-to-back — give it room.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await getAllowedUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (!isOwner(user.email)) {
    return NextResponse.json(
      { error: 'Only the owner can import reference PDFs.' },
      { status: 403 },
    );
  }

  try {
    const result = await ingestReferences(adminClient(), user.email);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
