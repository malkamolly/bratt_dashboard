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

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Managers + admin only (matches the Site Markup page gating).
  const user = await getAllowedUser();
  if (!user || !canUseSiteMarkup(user.role)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error: 'not_configured',
        message:
          'The live map is not switched on yet. Add GOOGLE_MAPS_API_KEY in Vercel to enable it.',
      },
      { status: 503 },
    );
  }

  const address = req.nextUrl.searchParams.get('address')?.trim();
  if (!address) {
    return NextResponse.json({ error: 'Missing address.' }, { status: 400 });
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    address,
  )}&key=${key}`;

  let data: {
    status: string;
    results?: {
      geometry: { location: { lat: number; lng: number } };
      formatted_address: string;
    }[];
  };
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch {
    return NextResponse.json(
      { error: 'fetch_failed', message: 'Could not reach Google. Try again.' },
      { status: 502 },
    );
  }

  if (data.status !== 'OK' || !data.results?.length) {
    return NextResponse.json(
      {
        error: 'not_found',
        message: `Couldn't find that address (${data.status}). Try adding the city and state.`,
      },
      { status: 404 },
    );
  }

  const top = data.results[0];
  return NextResponse.json({
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    formatted: top.formatted_address,
  });
}
