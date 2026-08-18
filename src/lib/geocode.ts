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
// Needs GOOGLE_MAPS_API_KEY with the Geocoding API enabled.
// ============================================================================

/** Every job either tool prices is in the Bratt Tree service area. */
export const SERVICE_AREA_STATE = 'MN';
export const SERVICE_AREA_STATE_NAME = 'Minnesota';

export type GeocodeSuccess = {
  ok: true;
  /** Google's canonical form, e.g. "4218 Sheridan Ave S, Minneapolis, MN 55410, USA". */
  formatted: string;
  lat: number;
  lng: number;
  /** Two-letter state Google resolved it to. */
  state: string | null;
};

export type GeocodeFailure = {
  ok: false;
  reason:
    | 'not_configured'
    | 'no_address'
    | 'not_found'
    | 'outside_service_area'
    | 'fetch_failed';
  message: string;
};

export type GeocodeResult = GeocodeSuccess | GeocodeFailure;

type GoogleResult = {
  geometry: { location: { lat: number; lng: number } };
  formatted_address: string;
  address_components?: {
    short_name: string;
    long_name: string;
    types: string[];
  }[];
};

function stateOf(result: GoogleResult): string | null {
  const hit = result.address_components?.find((c) =>
    c.types.includes('administrative_area_level_1'),
  );
  return hit?.short_name ?? null;
}

/**
 * Geocodes an address.
 *
 * `restrictToServiceArea` (the default) does two things:
 *
 *   1. Asks Google to search only within Minnesota, via the `components` filter.
 *      Without it a bare street name is a coin flip — "1375 Park Drive" resolved
 *      to White Lake, MICHIGAN, and the proposal saved happily with a Michigan
 *      map on it.
 *   2. Re-checks the state on the result Google returns and rejects anything
 *      outside MN. The components filter should make this unreachable, but a
 *      wrong state silently attached to a customer's job is bad enough to be
 *      worth checking twice.
 *
 * The internal Site Markup tool passes false, since it predates this rule and
 * its users can see the map they're working on.
 */
export async function geocodeAddress(
  raw: string,
  restrictToServiceArea = true,
): Promise<GeocodeResult> {
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

  const params = new URLSearchParams({ address, key });
  if (restrictToServiceArea) {
    params.set(
      'components',
      `administrative_area:${SERVICE_AREA_STATE}|country:US`,
    );
  }

  let data: { status: string; results?: GoogleResult[] };
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params}`,
    );
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
      message: restrictToServiceArea
        ? `We couldn't find that address in ${SERVICE_AREA_STATE_NAME}. Check the street number and add the city.`
        : `We couldn't find that address (${data.status}). Try adding the city and state.`,
    };
  }

  const top = data.results[0];
  const state = stateOf(top);

  if (restrictToServiceArea && state !== SERVICE_AREA_STATE) {
    return {
      ok: false,
      reason: 'outside_service_area',
      message: `That address came back in ${state ?? 'another state'}. This program covers ${SERVICE_AREA_STATE_NAME} only.`,
    };
  }

  return {
    ok: true,
    formatted: top.formatted_address,
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    state,
  };
}
