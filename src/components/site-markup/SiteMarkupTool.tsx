'use client';

// ============================================================================
// SiteMarkupTool
// ============================================================================
// The full Site Markup workflow on one page:
//   • Job details (customer, purpose, address, notes) -> printed on the header
//   • A marked-up MAP of the location (lane closures, safety zone, etc.)
//   • One or more marked-up PHOTOS of the actual trees / work area
//   • Download each as a .jpg, or "Print / Save as PDF" to get one clean
//     document to attach to a city permit or email to the power company.
//
// Everything is generated in the browser. The only server call is the map
// proxy (which keeps the Google key private).
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { MapPicker } from './MapPicker';
import { PhotoPicker } from './PhotoPicker';
import type { AnnotationCanvasHandle } from './AnnotationCanvas';

const PURPOSES = [
  'City Permit',
  'Power Line Clearance (Safety Zone)',
  'Other',
] as const;

// Upper bound on photo slots. Every slot holds a full drawing canvas in memory
// and they all land in ONE print document, so an unbounded list is a reliable
// way to crash Safari on an iPad mid-print. Six covers real jobs with room to
// spare; raise it if the crews start bumping into it.
const MAX_PHOTOS = 6;

/** One photo slot: its markup canvas plus the optional caption that becomes
 *  that page's heading in the PDF. */
type PhotoSlot = {
  /** Stable key for React (and for finding the slot again on edit/remove). */
  key: string;
  caption: string;
  /** Handle to this slot's markup canvas, for exporting the flattened image. */
  canvas: { current: AnnotationCanvasHandle | null };
  /** A photo handed over from another slot's multi-select, if any. */
  pendingFile: File | null;
};

let photoKeyCounter = 0;
function newPhotoSlot(pendingFile: File | null = null): PhotoSlot {
  photoKeyCounter += 1;
  return {
    key: `photo-${photoKeyCounter}`,
    caption: '',
    canvas: { current: null },
    pendingFile,
  };
}

/** Heading for a photo — the arborist's caption when they wrote one, otherwise
 *  a generic label (numbered only when there's more than one photo). */
function photoLabel(slot: PhotoSlot, index: number, total: number): string {
  const caption = slot.caption.trim();
  if (caption) return caption;
  return total > 1
    ? `Tree / Work Location ${index + 1}`
    : 'Tree / Work Location';
}

/** Convert a data: URL (e.g. from canvas.toDataURL) into a Blob. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Save a generated image to the device.
 *
 * iPads / iPhones (Safari) ignore the <a download> attribute — tapping such a
 * link just opens the image in the same tab instead of saving a file, which is
 * why the sales team couldn't get their .jpgs. On devices that support it we
 * hand the file to the native share sheet instead, where "Save Image" (Photos)
 * or "Save to Files" does the actual save. Desktop / Android keep the classic
 * download-link path.
 */
async function saveImage(dataUrl: string, filename: string): Promise<void> {
  const blob = dataUrlToBlob(dataUrl);
  const file = new File([blob], filename, { type: blob.type });

  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (err) {
      // AbortError = the user tapped "Cancel" on the share sheet; that's a
      // deliberate no-op, not something to fall back from. Any other error
      // falls through to the download-link path below.
      if ((err as Error)?.name === 'AbortError') return;
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Turn the address into a safe-ish file name stem (used for .jpg downloads). */
function addressSlug(address: string): string {
  const s = address
    .trim()
    .replace(/[,/\\]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'bratt-site-plan';
}

/** Build the standalone, branded HTML document we print from a hidden iframe. */
function buildPrintHtml(opts: {
  logoUrl: string;
  customer: string;
  purpose: string;
  address: string;
  notes: string;
  date: string;
  map: string | null;
  photos: { url: string; label: string }[];
}): string {
  const { logoUrl, customer, purpose, address, notes, date, map, photos } = opts;

  const row = (k: string, v: string) =>
    v
      ? `<tr><td class="k">${k}</td><td>${escapeHtml(v)}</td></tr>`
      : '';

  const brandbar = `
    <div class="brandbar">
      <img src="${logoUrl}" alt="Bratt Tree">
      <div class="doc-title">
        <div class="eyebrow">Site Work Plan</div>
        <div class="addr">${escapeHtml(address)}</div>
        <span class="badge">${escapeHtml(purpose)}</span>
      </div>
    </div>`;
  const info = `
    <table class="info">
      ${row('Customer', customer)}
      ${row('Date', date)}
      ${row('Notes', notes)}
    </table>`;
  const header = brandbar + info;
  const foot =
    '<div class="foot">Prepared with the Bratt Tree Sales Arborist Hub</div>';

  const mapBlock = map
    ? `<h2 class="section">Site Map</h2><div class="imgwrap"><img class="markup map" src="${map}" alt="Marked-up site map"></div>`
    : '';
  const photoBlocks = photos.map(
    (p) =>
      `<h2 class="section">${escapeHtml(p.label)}</h2><div class="imgwrap"><img class="markup photo" src="${p.url}" alt="Marked-up job-site photo"></div>`,
  );

  // Keep page count tight: header sits with the map, then each photo gets a
  // page of its own. If there's no map, the first photo rides on the header
  // page instead — so we never emit a near-empty page.
  const pages: string[] = [];
  if (map) {
    pages.push(header + mapBlock + foot);
    for (const block of photoBlocks) pages.push(brandbar + block + foot);
  } else if (photoBlocks.length > 0) {
    pages.push(header + photoBlocks[0] + foot);
    for (const block of photoBlocks.slice(1)) {
      pages.push(brandbar + block + foot);
    }
  } else {
    pages.push(header + foot);
  }
  const body = pages
    .map((p) => `<section class="page">${p}</section>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Site Work Plan</title>
<style>
  @page { size: letter; margin: 0.6in; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: #1A0E05; }
  .brandbar {
    display: flex; align-items: flex-end; justify-content: space-between;
    border-bottom: 3px solid #EB4C1B; padding-bottom: 10px; margin-bottom: 16px;
  }
  .brandbar img { height: 44px; width: auto; display: block; }
  .doc-title { text-align: right; max-width: 62%; }
  .doc-title .eyebrow {
    font-size: 9px; font-weight: 800; letter-spacing: 0.1em;
    text-transform: uppercase; color: #7A6B55;
  }
  .doc-title .addr {
    font-size: 14px; font-weight: 800; color: #1A0E05;
    margin-top: 2px; line-height: 1.25;
  }
  .badge {
    display: inline-block; margin-top: 5px; background: #EB4C1B; color: #fff;
    font-size: 9px; font-weight: 800; letter-spacing: 0.08em;
    text-transform: uppercase; padding: 3px 9px; border-radius: 999px;
  }
  table.info { font-size: 12px; border-collapse: collapse; margin: 0 0 16px; }
  table.info td { padding: 2px 16px 2px 0; vertical-align: top; }
  table.info td.k {
    font-weight: 700; white-space: nowrap; color: #7A6B55;
    text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em;
    padding-top: 4px;
  }
  h2.section {
    font-size: 11px; font-weight: 800; letter-spacing: 0.08em;
    text-transform: uppercase; color: #EB4C1B; margin: 0 0 7px;
  }
  .imgwrap {
    display: inline-block; max-width: 100%;
    border: 1px solid #E8DCC0; border-radius: 6px; overflow: hidden;
  }
  img.markup { display: block; max-width: 100%; height: auto; }
  /* Cap heights so a single image never spills onto a second page. */
  img.map { max-height: 7.3in; }
  img.photo { max-height: 8.6in; }
  .foot {
    margin-top: 12px; font-size: 8.5px; color: #A99; color: #9b8a73;
    letter-spacing: 0.04em;
  }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
</style></head><body>${body}</body></html>`;
}

/** Print a standalone HTML document via a hidden iframe, so ONLY that document
 *  prints (no blank pages from the surrounding app). The PDF file name is the
 *  browser's title at print time — and Chrome uses the TOP document's title
 *  for an iframe print, so we swap it in here and restore it afterward. */
function printDocument(html: string, filename: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) return;
    const prevTitle = document.title;
    const restore = () => {
      document.title = prevTitle;
      iframe.remove();
    };
    document.title = filename;
    win.focus();
    win.onafterprint = restore;
    // Safety net for browsers that don't fire `afterprint`.
    setTimeout(restore, 60000);
    win.print();
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // No crossOrigin: both callers pass same-origin sources (a data: URL for
    // the marked-up image, our own /assets logo). Setting crossOrigin on a
    // data: URL makes iOS Safari fail the load, which used to make brandImage
    // throw and silently fall back to the unbranded image.
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Split `text` into lines that each fit within `maxWidth` for the ctx's
 *  current font. Wraps on spaces; an over-long single word stays on its line. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const trial = `${line} ${words[i]}`;
    if (ctx.measureText(trial).width <= maxWidth) {
      line = trial;
    } else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines;
}

/** Trace a rounded-rectangle path (caller then fills / clips / strokes it). */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Compose the full marked-up image into a single standalone document JPEG —
 *  the same layout as the Print / Save-as-PDF output (logo, address, purpose
 *  pill, customer / date / notes, a section heading, the image, and the
 *  footer). Built entirely on <canvas> so it renders reliably on iPads. */
async function brandImage(
  markupUrl: string,
  opts: {
    logoUrl: string;
    customer: string;
    address: string;
    purpose: string;
    notes: string;
    date: string;
    label: string; // section heading, e.g. "Site Map"
  },
): Promise<string> {
  const { logoUrl, customer, address, purpose, notes, date, label } = opts;
  const markup = await loadImage(markupUrl);
  let logo: HTMLImageElement | null = null;
  try {
    logo = await loadImage(logoUrl);
  } catch {
    logo = null; // the rest of the document still renders without the logo
  }

  const W = markup.naturalWidth;
  const mH = markup.naturalHeight;

  // Everything scales off the image width so downloads look consistent
  // regardless of the source map/photo resolution.
  const M = Math.round(W * 0.055); // page margin
  const contentW = W; // the image spans the full content column
  const canvasW = contentW + M * 2;
  const leftX = M;
  const rightX = canvasW - M;

  const eyebrowF = Math.round(W * 0.013);
  const addrF = Math.round(W * 0.023);
  const badgeF = Math.round(W * 0.013);
  const labelF = Math.round(W * 0.0135);
  const valueF = Math.round(W * 0.018);
  const sectionF = Math.round(W * 0.0165);
  const footF = Math.round(W * 0.012);
  const rule = Math.max(3, Math.round(W * 0.0035));
  const gapS = Math.round(W * 0.006);

  // A throwaway context purely for measuring text: sizing the real canvas
  // wipes it, so we must know the final height before we create it.
  const meas = document.createElement('canvas').getContext('2d');
  if (!meas) return markupUrl;

  // ---- Header geometry -----------------------------------------------------
  const logoH = Math.round(W * 0.06);
  const logoW =
    logo && logo.naturalHeight > 0
      ? Math.round(logoH * (logo.naturalWidth / logo.naturalHeight))
      : 0;

  const rightColMaxW = Math.round(contentW * 0.66);
  meas.font = `800 ${addrF}px sans-serif`;
  const addrLines = wrapText(meas, address, rightColMaxW);
  const addrLineH = Math.round(addrF * 1.2);

  const pillPadX = Math.round(badgeF * 0.95);
  const pillPadY = Math.round(badgeF * 0.55);
  const pillH = badgeF + pillPadY * 2;

  let yTop = M;
  const eyebrowY = yTop;
  const addrY = eyebrowY + eyebrowF + gapS;
  const badgeY = addrY + addrLines.length * addrLineH + gapS;
  const rightStackBottom = badgeY + pillH;
  const headerBottom = Math.max(yTop + logoH, rightStackBottom);

  const ruleY = headerBottom + Math.round(W * 0.014);
  let y = ruleY + rule + Math.round(W * 0.022);

  // ---- Info rows (skip any that are empty) ---------------------------------
  const infoRows = ([
    ['Customer', customer],
    ['Date', date],
    ['Notes', notes],
  ] as const).filter(([, v]) => v && v.trim());

  meas.font = `700 ${labelF}px sans-serif`;
  let labelColW = 0;
  for (const [k] of infoRows) {
    labelColW = Math.max(labelColW, meas.measureText(k.toUpperCase()).width);
  }
  labelColW = Math.round(labelColW + W * 0.028);
  const valueX = leftX + labelColW;
  const valueMaxW = contentW - labelColW;
  const valueLineH = Math.round(valueF * 1.4);
  const rowGap = Math.round(W * 0.011);

  const rowLayouts: { k: string; lines: string[]; y: number }[] = [];
  for (const [k, v] of infoRows) {
    meas.font = `600 ${valueF}px sans-serif`;
    const lines = wrapText(meas, v, valueMaxW);
    rowLayouts.push({ k, lines, y });
    y += Math.max(valueLineH, lines.length * valueLineH) + rowGap;
  }
  if (infoRows.length) y += Math.round(W * 0.012);

  // ---- Section heading + image + footer ------------------------------------
  const sectionY = y;
  y += Math.round(sectionF * 1.1) + Math.round(W * 0.014);

  const imgY = y;
  y = imgY + mH;

  y += Math.round(W * 0.022);
  const footY = y;
  y += Math.round(footF * 1.3);

  const totalH = y + M;

  // ---- Draw ----------------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return markupUrl;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, totalH);

  // Logo (top-left)
  if (logo && logoW > 0) {
    ctx.drawImage(logo, leftX, yTop, logoW, logoH);
  }

  // Right-aligned header text
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#7A6B55';
  ctx.font = `800 ${eyebrowF}px sans-serif`;
  ctx.fillText('SITE WORK PLAN', rightX, eyebrowY);

  ctx.fillStyle = '#1A0E05';
  ctx.font = `800 ${addrF}px sans-serif`;
  addrLines.forEach((ln, i) => ctx.fillText(ln, rightX, addrY + i * addrLineH));

  // Purpose "pill" (right-aligned, brand orange)
  ctx.font = `800 ${badgeF}px sans-serif`;
  const pillText = purpose.toUpperCase();
  const pillW = Math.round(ctx.measureText(pillText).width) + pillPadX * 2;
  const pillX = rightX - pillW;
  ctx.fillStyle = '#EB4C1B';
  roundRectPath(ctx, pillX, badgeY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, pillX + pillW / 2, badgeY + pillH / 2 + 1);

  // Orange rule under the header
  ctx.fillStyle = '#EB4C1B';
  ctx.fillRect(leftX, ruleY, contentW, rule);

  // Info rows
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (const rowItem of rowLayouts) {
    ctx.fillStyle = '#7A6B55';
    ctx.font = `700 ${labelF}px sans-serif`;
    ctx.fillText(rowItem.k.toUpperCase(), leftX, rowItem.y + Math.round(valueF * 0.15));
    ctx.fillStyle = '#1A0E05';
    ctx.font = `600 ${valueF}px sans-serif`;
    rowItem.lines.forEach((ln, i) =>
      ctx.fillText(ln, valueX, rowItem.y + i * valueLineH),
    );
  }

  // Section heading
  ctx.fillStyle = '#EB4C1B';
  ctx.font = `800 ${sectionF}px sans-serif`;
  ctx.fillText(label.toUpperCase(), leftX, sectionY);

  // The marked-up image, with rounded corners + a light border
  const imgR = Math.round(W * 0.006);
  ctx.save();
  roundRectPath(ctx, leftX, imgY, contentW, mH, imgR);
  ctx.clip();
  ctx.drawImage(markup, leftX, imgY, contentW, mH);
  ctx.restore();
  ctx.strokeStyle = '#E8DCC0';
  ctx.lineWidth = Math.max(1, Math.round(W * 0.0012));
  roundRectPath(ctx, leftX, imgY, contentW, mH, imgR);
  ctx.stroke();

  // Footer
  ctx.fillStyle = '#9b8a73';
  ctx.font = `600 ${footF}px sans-serif`;
  ctx.fillText('Prepared with the Bratt Tree Sales Arborist Hub', leftX, footY);

  return canvas.toDataURL('image/jpeg', 0.92);
}

export function SiteMarkupTool() {
  const mapCanvas = useRef<AnnotationCanvasHandle | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  const [customer, setCustomer] = useState('');
  const [purpose, setPurpose] = useState<string>(PURPOSES[0]);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<PhotoSlot[]>(() => [newPhotoSlot()]);

  function addPhoto() {
    setPhotos((ps) => (ps.length >= MAX_PHOTOS ? ps : [...ps, newPhotoSlot()]));
  }

  /** Photos picked several-at-once in one slot become slots of their own. */
  function addPhotosFromFiles(files: File[]) {
    setPhotos((ps) => {
      const room = MAX_PHOTOS - ps.length;
      if (room <= 0) return ps;
      return [...ps, ...files.slice(0, room).map((f) => newPhotoSlot(f))];
    });
  }

  function removePhoto(key: string) {
    // Never drop to zero slots — the last remove just resets to a blank one.
    setPhotos((ps) =>
      ps.length === 1 ? [newPhotoSlot()] : ps.filter((p) => p.key !== key),
    );
  }

  function setCaption(key: string, caption: string) {
    setPhotos((ps) =>
      ps.map((p) => (p.key === key ? { ...p, caption } : p)),
    );
  }

  function ensureAddress(): boolean {
    if (address.trim()) return true;
    alert('Please enter the site address first.');
    addressInputRef.current?.focus();
    addressInputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  }

  const logoUrl = () => `${window.location.origin}/assets/img/logotype-color.png`;

  // Warm the browser cache for the header logo on load. On iPads the save uses
  // the native share sheet, which must open within a few seconds of the tap; if
  // the logo had to be fetched fresh at that moment, branding could run long
  // enough for the share to be blocked. Pre-fetching keeps the tap instant.
  useEffect(() => {
    const img = new Image();
    img.src = logoUrl();
  }, []);

  async function handleDownloadMap() {
    const url = mapCanvas.current?.getDataUrl();
    if (!url) {
      alert('Load a map first (use "Find on map" above).');
      return;
    }
    if (!ensureAddress()) return;
    const name = `${addressSlug(address)}-map.jpg`;
    try {
      const branded = await brandImage(url, {
        logoUrl: logoUrl(),
        customer,
        address,
        purpose,
        notes,
        date: format(new Date(), 'PP'),
        label: 'Site Map',
      });
      await saveImage(branded, name);
    } catch {
      await saveImage(url, name); // fall back to the unbranded image if compositing fails
    }
  }

  async function handleDownloadPhoto(slot: PhotoSlot, index: number) {
    const url = slot.canvas.current?.getDataUrl();
    if (!url) {
      alert('Choose a photo first.');
      return;
    }
    if (!ensureAddress()) return;
    const suffix = photos.length > 1 ? `-photo-${index + 1}` : '-photo';
    const name = `${addressSlug(address)}${suffix}.jpg`;
    try {
      const branded = await brandImage(url, {
        logoUrl: logoUrl(),
        customer,
        address,
        purpose,
        notes,
        date: format(new Date(), 'PP'),
        label: photoLabel(slot, index, photos.length),
      });
      await saveImage(branded, name);
    } catch {
      await saveImage(url, name);
    }
  }

  function handlePrint() {
    if (!ensureAddress()) return;
    const map = mapCanvas.current?.getDataUrl() ?? null;
    // Empty slots (added but never filled) simply drop out here.
    const printPhotos = photos.flatMap((slot, i) => {
      const url = slot.canvas.current?.getDataUrl();
      return url ? [{ url, label: photoLabel(slot, i, photos.length) }] : [];
    });
    if (!map && printPhotos.length === 0) {
      alert('Add a map and/or a photo before printing.');
      return;
    }
    const html = buildPrintHtml({
      logoUrl: logoUrl(),
      customer,
      purpose,
      address,
      notes,
      date: format(new Date(), 'PP'),
      map,
      photos: printPhotos,
    });
    // The job address becomes the default Save-as-PDF file name.
    printDocument(html, address.trim() || 'Bratt Tree Site Work Plan');
  }

  return (
    <>
      {/* ---- Job details ---- */}
      <section className="bt-card">
        <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
          Job details
        </h2>
        <p className="mt-1 text-sm text-fg-2">
          These print at the top of the document you hand to the city or power
          company.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Site address <span className="text-orange-press">*</span>
            </span>
            <input
              ref={addressInputRef}
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Main St, Springfield IL"
              className="mt-1 w-full rounded-md border-2 border-paper-edge bg-white px-3 py-2 text-sm text-ink focus:border-orange focus:outline-none"
            />
            <span className="mt-1 block text-xs text-fg-3">
              Required. Type it here, then use <strong>Find on map</strong> below
              to load the location (which also tidies up the address).
            </span>
          </label>

          <label className="block">
            <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Customer (First name + last initial)
            </span>
            <input
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="e.g. Taylor M"
              className="mt-1 w-full rounded-md border-2 border-paper-edge bg-white px-3 py-2 text-sm text-ink focus:border-orange focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Purpose
            </span>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="mt-1 w-full rounded-md border-2 border-paper-edge bg-white px-3 py-2 text-sm text-ink focus:border-orange focus:outline-none"
            >
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Notes (optional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Close eastbound lane 8am–12pm; flaggers at both ends."
              className="mt-1 w-full rounded-md border-2 border-paper-edge bg-white px-3 py-2 text-sm text-ink focus:border-orange focus:outline-none"
            />
          </label>
        </div>
      </section>

      {/* ---- Map markup ---- */}
      <section className="bt-card mt-8">
        <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
          1 · Mark up the map
        </h2>
        <p className="mt-1 mb-4 text-sm text-fg-2">
          Find the address, frame the street, then draw lane closures, the
          safety zone, cones, and labels.
        </p>
        <MapPicker canvasRef={mapCanvas} address={address} onResolved={setAddress} />
        <div className="mt-3">
          <button
            type="button"
            onClick={handleDownloadMap}
            className="bt-btn bt-btn-ghost"
          >
            Download map (.jpg)
          </button>
        </div>
      </section>

      {/* ---- Photo markup ---- */}
      <section className="bt-card mt-8">
        <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
          2 · Mark up the photos
        </h2>
        <p className="mt-1 mb-4 text-sm text-fg-2">
          Add a job-site photo and mark the tree(s), drop zone, and any no-park
          areas. Got more than one? Select several photos at once when you tap{' '}
          <strong>Choose / take photo</strong>, or use{' '}
          <strong>Add another photo</strong> below &mdash; each photo gets its
          own page in the final document.
        </p>

        <div className="space-y-6">
          {photos.map((slot, idx) => (
            <div
              key={slot.key}
              className="rounded-card border-2 border-paper-edge p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="bt-eyebrow">Photo {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removePhoto(slot.key)}
                  title="Remove this photo"
                  aria-label={`Remove photo ${idx + 1}`}
                  className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-paper-edge text-fg-3 transition-colors hover:border-orange-press hover:bg-orange-press hover:text-white"
                >
                  &times;
                </button>
              </div>

              <label className="mt-3 block">
                <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  Photo label (optional)
                </span>
                <input
                  type="text"
                  value={slot.caption}
                  onChange={(e) => setCaption(slot.key, e.target.value)}
                  placeholder="e.g. Front yard oak"
                  className="mt-1 w-full rounded-md border-2 border-paper-edge bg-white px-3 py-2 text-sm text-ink focus:border-orange focus:outline-none"
                />
                <span className="mt-1 block text-xs text-fg-3">
                  Prints as the heading on that photo&apos;s page, so the city
                  can tell them apart. Leave it blank for
                  &ldquo;Tree / Work Location&rdquo;.
                </span>
              </label>

              <div className="mt-4">
                <PhotoPicker
                  canvasRef={slot.canvas}
                  pendingFile={slot.pendingFile}
                  extraSlots={MAX_PHOTOS - photos.length}
                  onExtraFiles={addPhotosFromFiles}
                />
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => handleDownloadPhoto(slot, idx)}
                  className="bt-btn bt-btn-ghost"
                >
                  Download photo (.jpg)
                </button>
              </div>
            </div>
          ))}
        </div>

        {photos.length < MAX_PHOTOS ? (
          <button
            type="button"
            onClick={addPhoto}
            className="mt-6 flex w-full flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-paper-edge py-6 text-fg-3 transition-colors hover:border-orange hover:text-orange-press"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon">
              Add another photo
            </span>
          </button>
        ) : (
          <p className="mt-6 rounded-2 border-2 border-paper-edge bg-paper px-3 py-2 text-xs text-fg-2">
            That&apos;s the {MAX_PHOTOS}-photo limit, which keeps the PDF
            printing reliably on an iPad. Need more? Save this document, then
            start a second one for the rest.
          </p>
        )}
      </section>

      {/* ---- Output ---- */}
      <section className="bt-card mt-8">
        <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
          3 · Print or save the document
        </h2>
        <p className="mt-1 mb-4 text-sm text-fg-2">
          Combines the job details, the map, and every photo into one document
          &mdash; the map on the first page, then one page per photo. In the print
          window, pick <strong>&ldquo;Save as PDF&rdquo;</strong> as the
          destination to email it, or print it to paper. The file is named after
          the job address automatically.
        </p>
        <button
          type="button"
          onClick={handlePrint}
          className="bt-btn bt-btn-primary"
        >
          Print / Save as PDF
        </button>
      </section>
    </>
  );
}
