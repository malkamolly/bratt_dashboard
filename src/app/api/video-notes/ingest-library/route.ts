// ============================================================================
// POST /api/video-notes/ingest-library  (admin only)
// ============================================================================
// Distills the whole Sales Arborist Training Library into playbook entries the
// video analyzer applies. Replaces the previous library batch, so it's safe to
// re-run whenever the Library changes. Uses the service-role client for the
// write (after checking admin access), so it isn't blocked by RLS.
// ============================================================================

import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { getAllowedUser } from '@/lib/auth';
import { ingestLibrary } from '@/lib/playbook-ingest';

// Distilling the full library is one big Claude call — give it room.
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await getAllowedUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only an admin can import the Training Library.' },
      { status: 403 },
    );
  }

  try {
    const result = await ingestLibrary(adminClient(), user.email);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
