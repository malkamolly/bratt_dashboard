// ============================================================================
// Static map image proxy for the Site Markup tool
// ============================================================================
// Fetches a single flat map image (Google "Static Maps") for a given center,
// zoom, and map type, and streams the raw image bytes back to the browser.
//
// Why proxy it instead of pointing an <img> straight at Google?
//   1. The Google API key stays on the server (never exposed in the browser).
//   2. The image comes from OUR domain, which means the browser will let us
//      draw it onto a <canvas> and export it. A cross-origin Google image
//      would "taint" the canvas and block the download.
//
// Query params:
//   clat, clng  - center of the framed view (required)
//   mlat, mlng  - optional marker pin (where the typed address actually lands)
//   zoom        - 14..21 (clamped)
//   maptype     - 'hybrid' | 'roadmap' | 'satellite' (default hybrid)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAllowedUser, canAccessHub } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ALLOWED_MAPTYPES = new Set(['hybrid', 'roadmap', 'satellite']);

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const user = await getAllowedUser();
  if (!user || !canAccessHub(user.role, 'hub')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const p = req.nextUrl.searchParams;
  const clat = num(p.get('clat'));
  const clng = num(p.get('clng'));
  if (clat == null || clng == null) {
    return NextResponse.json({ error: 'Missing center.' }, { status: 400 });
  }

  // Clamp zoom to a sensible street-level range.
  const zoom = Math.min(21, Math.max(14, Math.round(num(p.get('zoom')) ?? 19)));
  const maptypeRaw = p.get('maptype') ?? 'hybrid';
  const maptype = ALLOWED_MAPTYPES.has(maptypeRaw) ? maptypeRaw : 'hybrid';

  // 640x480 at scale=2 = a crisp 1280x960 image, the max the free tier allows.
  const params = new URLSearchParams({
    center: `${clat},${clng}`,
    zoom: String(zoom),
    size: '640x480',
    scale: '2',
    maptype,
    key,
  });

  // Optional marker showing exactly where the typed address resolved. It can
  // sit off-center once the user pans, which is useful — it pins the address
  // even while they frame the surrounding street.
  const mlat = num(p.get('mlat'));
  const mlng = num(p.get('mlng'));
  if (mlat != null && mlng != null) {
    params.append('markers', `color:red|${mlat},${mlng}`);
  }

  const url = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;

  let upstream: Response;
  try {
    upstream = await fetch(url);
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: 'upstream', status: upstream.status },
      { status: 502 },
    );
  }

  const buf = await upstream.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      // Cache briefly per-user so re-framing nudges don't re-hit Google for
      // the identical view.
      'Cache-Control': 'private, max-age=600',
    },
  });
}
