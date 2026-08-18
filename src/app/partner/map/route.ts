// ============================================================================
// Static site map for the Plant Health Program
// ============================================================================
// Streams a Google Static Maps image for a proposal's coordinates.
//
// Why a separate route from /api/site-map/static: that one gates on an internal
// Supabase session (getAllowedUser + canUseSiteMarkup), which a partner user
// never has — they'd get a 401. This is the same idea gated on the partner
// cookie instead. Both keep GOOGLE_MAPS_API_KEY on the server.
//
// Coordinates come from the proposal row (geocoded once on save), not from the
// query string, so nobody can use this as an open Google Maps proxy on our key.
//
// GET /partner/map?proposal=<uuid>  ->  image/png
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { PARTNER_COOKIE, isValidPartnerCookie } from '@/lib/partner-auth';
import { getProposal } from '@/lib/partner-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ok = await isValidPartnerCookie(req.cookies.get(PARTNER_COOKIE)?.value);
  if (!ok) return new NextResponse('Unauthorized', { status: 401 });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return new NextResponse('Map not configured', { status: 503 });

  const id = req.nextUrl.searchParams.get('proposal');
  if (!id) return new NextResponse('Missing proposal', { status: 400 });

  const proposal = await getProposal(id);
  if (!proposal?.latitude || !proposal?.longitude) {
    return new NextResponse('No coordinates for that proposal', { status: 404 });
  }

  const params = new URLSearchParams({
    center: `${proposal.latitude},${proposal.longitude}`,
    zoom: '18',
    size: '640x320',
    scale: '2',
    maptype: 'hybrid',
    markers: `color:0xEB4C1B|${proposal.latitude},${proposal.longitude}`,
    key,
  });

  const upstream = await fetch(
    `https://maps.googleapis.com/maps/api/staticmap?${params}`,
  );
  if (!upstream.ok) {
    return new NextResponse('Map unavailable', { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      // The site doesn't move. Cache hard so re-opening a proposal is free.
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
