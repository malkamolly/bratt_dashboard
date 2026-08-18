// ============================================================================
// Address geocoding (SERVER ONLY)
// ============================================================================
// Turns a typed street address into a canonical address plus coordinates, using
// Google's Geocoding API. Server-side so the API key never reaches a browser.
//
// Two callers, deliberately sharing one implementation:
//   - /api/site-map/geocode  — the internal Site Markup tool (session-gated)
//   - the Plant Health Program proposal actions (partner-cookie-gated)
//
// Needs GOOGLE_MAPS_API_KEY with the Geocoding API enabled. Without it,
// callers get `not_configured` and should carry on without a map rather than
// failing — an address we can't verify is still an address worth saving.
// ============================================================================

export type GeocodeSuccess = {
  ok: true;
  /** Google's canonical form, e.g. "4218 Sheridan Ave S, Minneapolis, MN 55410, USA". */
  formatted: string;
  lat: number;
  lng: number;
};

export type GeocodeFailure = {
  ok: false;
  reason: 'not_configured' | 'no_address' | 'not_found' | 'fetch_failed';
  message: string;
};

export type GeocodeResult = GeocodeSuccess | GeocodeFailure;

export async function geocodeAddress(raw: string): Promise<GeocodeResult> {
  const address = raw.trim();
  if (!address) {
    return { ok: false, reason: 'no_address', message: 'Enter an address first.' };
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return {
      ok: false,
      reason: 'not_configured',
      message:
        'Address checking is not switched on yet. Add GOOGLE_MAPS_API_KEY in Vercel to enable it.',
    };
  }

  const url =
    'https://maps.googleapis.com/maps/api/geocode/json?address=' +
    encodeURIComponent(address) +
    `&key=${key}`;

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
    return {
      ok: false,
      reason: 'fetch_failed',
      message: 'Could not reach Google to check the address. Try again.',
    };
  }

  if (data.status !== 'OK' || !data.results?.length) {
    return {
      ok: false,
      reason: 'not_found',
      message: `We couldn't find that address (${data.status}). Try adding the city and state.`,
    };
  }

  const top = data.results[0];
  return {
    ok: true,
    formatted: top.formatted_address,
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
  };
}
