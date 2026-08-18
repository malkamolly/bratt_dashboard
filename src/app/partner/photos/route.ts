// ============================================================================
// Tree photo upload for the Plant Health Program
// ============================================================================
// POST /partner/photos   multipart: treeId + photo   ->  { id, url }
//
// A route handler rather than a server action: photos are the one thing in this
// hub big enough to care about transport. A route handler takes raw multipart
// bytes with no React runtime in the middle, and it gives the browser a real
// per-file progress/error signal, which matters when a rep is uploading six
// photos on one bar of signal.
//
// The browser downscales and re-encodes each image to JPEG before sending (see
// TreePhotoPicker), so what arrives here is a few hundred KB rather than the
// 12 MB a modern phone produces. The cap below is a backstop, not the plan.
//
// Gated by the partner cookie. Storage writes use the service role, because a
// partner holds no Supabase session that storage policies would accept.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { addTreePhoto, isPartnerRequest } from '@/lib/partner-data';

export const dynamic = 'force-dynamic';

/** Vercel rejects request bodies over ~4.5 MB before our code runs, so stay
 *  well under it and fail with a message the rep can act on. */
const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(req: NextRequest) {
  if (!(await isPartnerRequest())) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  // Only our own page may post here.
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: 'That photo was too large to upload. Try again.' },
      { status: 413 },
    );
  }

  const treeId = String(form.get('treeId') ?? '');
  const file = form.get('photo');

  if (!treeId) {
    return NextResponse.json({ error: 'Missing tree.' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No photo attached.' }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: 'Photos need to be JPG, PNG, or WebP.' },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'That photo is too large even after resizing. Try another.' },
      { status: 413 },
    );
  }

  try {
    const photo = await addTreePhoto(treeId, await file.arrayBuffer(), file.type);
    return NextResponse.json({ id: photo.id, url: photo.url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed.' },
      { status: 400 },
    );
  }
}
