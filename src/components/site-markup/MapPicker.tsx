'use client';

// ============================================================================
// MapPicker
// ============================================================================
// Handles the "map" half of the Site Markup tool:
//   1. Type an address -> we geocode it (server proxy) to get coordinates.
//   2. Frame the shot with zoom, map-type, and nudge controls. Each change
//      pulls a fresh flat map image from our /api/site-map proxy.
//   3. The framed map flows straight into an AnnotationCanvas to draw on.
//
// The canvas ref is owned by the parent so it can export the finished markup.
// ============================================================================

import { useCallback, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import {
  AnnotationCanvas,
  type AnnotationCanvasHandle,
} from './AnnotationCanvas';

type Resolved = { lat: number; lng: number; formatted: string };
type MapType = 'hybrid' | 'roadmap';

type Props = {
  canvasRef: RefObject<AnnotationCanvasHandle | null>;
  /** Called with the tidy address Google returned, for the printed header. */
  onResolved?: (formatted: string) => void;
};

// Image is 640x480 at scale 2 = 1280x960 px on screen.
const IMG_W = 1280;
const IMG_H = 960;

/** Degrees of longitude per screen pixel at a given zoom (Web Mercator). */
function degPerPixelLng(zoom: number): number {
  return 360 / (256 * Math.pow(2, zoom));
}

export function MapPicker({ canvasRef, onResolved }: Props) {
  const [address, setAddress] = useState('');
  const [marker, setMarker] = useState<Resolved | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState(19);
  const [maptype, setMaptype] = useState<MapType>('hybrid');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  async function findAddress(e?: React.FormEvent) {
    e?.preventDefault();
    const q = address.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    try {
      const res = await fetch(
        `/api/site-map/geocode?address=${encodeURIComponent(q)}`,
      );
      if (res.status === 503) {
        setNotConfigured(true);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? 'Could not find that address.');
        return;
      }
      const resolved: Resolved = data;
      setMarker(resolved);
      setCenter({ lat: resolved.lat, lng: resolved.lng });
      setZoom(19);
      onResolved?.(resolved.formatted);
    } catch {
      setError('Something went wrong looking up that address.');
    } finally {
      setLoading(false);
    }
  }

  // Shift the framed view by roughly a quarter of the image in a direction.
  const nudge = useCallback(
    (dir: 'n' | 's' | 'e' | 'w') => {
      setCenter((c) => {
        if (!c) return c;
        const dpp = degPerPixelLng(zoom);
        const stepLng = (IMG_W / 4) * dpp;
        const stepLat =
          (IMG_H / 4) * dpp * Math.cos((c.lat * Math.PI) / 180);
        switch (dir) {
          case 'n':
            return { ...c, lat: c.lat + stepLat };
          case 's':
            return { ...c, lat: c.lat - stepLat };
          case 'e':
            return { ...c, lng: c.lng + stepLng };
          case 'w':
            return { ...c, lng: c.lng - stepLng };
        }
      });
    },
    [zoom],
  );

  const mapSrc = useMemo(() => {
    if (!center || !marker) return null;
    const p = new URLSearchParams({
      clat: String(center.lat),
      clng: String(center.lng),
      mlat: String(marker.lat),
      mlng: String(marker.lng),
      zoom: String(zoom),
      maptype,
    });
    return `/api/site-map/static?${p.toString()}`;
  }, [center, marker, zoom, maptype]);

  const ctrlBtn =
    'rounded-md border-2 border-paper-edge bg-white px-3 py-1.5 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2 transition-colors hover:border-orange hover:text-orange disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div>
      {/* Address search */}
      <form onSubmit={findAddress} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Job address — e.g. 123 Main St, Springfield IL"
          className="min-w-0 flex-1 rounded-md border-2 border-paper-edge bg-white px-3 py-2 text-sm text-ink focus:border-orange focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !address.trim()}
          className="bt-btn bt-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Finding…' : 'Find on map'}
        </button>
      </form>

      {notConfigured && (
        <p className="mt-3 rounded-md border-2 border-status-warn bg-status-warn/15 px-3 py-2 text-sm text-fg-2">
          🗺️ The live map isn&apos;t switched on yet. Once{' '}
          <code className="font-mono text-xs">GOOGLE_MAPS_API_KEY</code> is added
          in Vercel it&apos;ll appear here. You can still mark up a photo below in
          the meantime.
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-md border-2 border-orange-press bg-orange-press/10 px-3 py-2 text-sm text-orange-press">
          {error}
        </p>
      )}

      {marker && (
        <p className="mt-3 text-sm text-fg-2">
          📍 <strong>{marker.formatted}</strong>
        </p>
      )}

      {/* Framing controls — only once we have a map */}
      {mapSrc && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Frame:
          </span>
          <button type="button" className={ctrlBtn} onClick={() => setZoom((z) => Math.min(21, z + 1))} disabled={zoom >= 21}>
            Zoom +
          </button>
          <button type="button" className={ctrlBtn} onClick={() => setZoom((z) => Math.max(14, z - 1))} disabled={zoom <= 14}>
            Zoom −
          </button>
          <button type="button" className={ctrlBtn} onClick={() => nudge('n')}>↑</button>
          <button type="button" className={ctrlBtn} onClick={() => nudge('s')}>↓</button>
          <button type="button" className={ctrlBtn} onClick={() => nudge('w')}>←</button>
          <button type="button" className={ctrlBtn} onClick={() => nudge('e')}>→</button>
          <button
            type="button"
            className={ctrlBtn}
            onClick={() => marker && setCenter({ lat: marker.lat, lng: marker.lng })}
          >
            Re-center
          </button>
          <button
            type="button"
            className={ctrlBtn}
            onClick={() => setMaptype((m) => (m === 'hybrid' ? 'roadmap' : 'hybrid'))}
          >
            {maptype === 'hybrid' ? 'Satellite' : 'Road map'}
          </button>
        </div>
      )}

      <p className="mt-3 mb-2 text-xs text-fg-3">
        Tip: re-framing the map clears its markups, so frame the shot first, then
        draw your lane closures and safety zone.
      </p>

      <AnnotationCanvas
        ref={canvasRef}
        src={mapSrc}
        placeholder="Search a job address above to load the map."
      />
    </div>
  );
}
