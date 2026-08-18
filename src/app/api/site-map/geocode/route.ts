// ============================================================================
// Geocoding proxy for the Site Markup tool
// ============================================================================
// Turns a typed street address into map coordinates (lat/lng) using Google's
// Geocoding API. We do this on the SERVER so the Google API key never ships to
// the browser. Only signed-in hub users can call it (so randoms can't burn
// through our daily map quota).
//
// Returns:
//   200 { lat, lng, formatted }     - found it
//   400 { error }                    - no address given
//   401 { error }                    - not a signed-in hub user
//   404 { error, message }           - Google couldn't find that address
//   503 { error: 'not_configured' }  - the GOOGLE_MAPS_API_KEY isn't set yet
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAllowedUser, canUseSiteMarkup } from '@/lib/auth';
import { geocodeAddress } from '@/lib/geocode';

export const dynamic = 'force-dynamic';

// HTTP status per failure reason, so the client sees the same codes as before.
const STATUS: Record<string, number> = {
  no_address: 400,
  not_configured: 503,
  not_found: 404,
  outside_service_area: 404,
  fetch_failed: 502,
};

export async function GET(req: NextRequest) {
  // Managers + admin only (matches the Site Markup page gating).
  const user = await getAllowedUser();
  if (!user || !canUseSiteMarkup(user.role)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // The actual Google call lives in lib/geocode.ts, shared with the Plant
  // Health Program hub so there is one implementation to keep correct.
  // `false` = don't restrict to Minnesota. This tool predates that rule and its
  // users can see the map they're working on; the Plant Health Program hub does
  // restrict, because a partner rep never sees the map until after it saves.
  const result = await geocodeAddress(
    req.nextUrl.searchParams.get('address') ?? '',
    false,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, message: result.message },
      { status: STATUS[result.reason] ?? 500 },
    );
  }

  return NextResponse.json({
    lat: result.lat,
    lng: result.lng,
    formatted: result.formatted,
  });
}
