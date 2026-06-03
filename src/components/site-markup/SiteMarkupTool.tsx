'use client';

// ============================================================================
// SiteMarkupTool
// ============================================================================
// The full Site Markup workflow on one page:
//   • Job details (customer, purpose, address, notes) -> printed on the header
//   • A marked-up MAP of the location (lane closures, safety zone, etc.)
//   • A marked-up PHOTO of the actual trees / work area
//   • Download each as a .jpg, or "Print / Save as PDF" to get one clean
//     document to attach to a city permit or email to the power company.
//
// Everything is generated in the browser. The only server call is the map
// proxy (which keeps the Google key private).
// ============================================================================

import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { MapPicker } from './MapPicker';
import { PhotoPicker } from './PhotoPicker';
import type { AnnotationCanvasHandle } from './AnnotationCanvas';

const PURPOSES = [
  'City Permit',
  'Power Line Clearance (Safety Zone)',
  'Other',
] as const;

function download(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
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
  photo: string | null;
}): string {
  const { logoUrl, customer, purpose, address, notes, date, map, photo } = opts;

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
  const photoBlock = photo
    ? `<h2 class="section">Tree / Work Location</h2><div class="imgwrap"><img class="markup photo" src="${photo}" alt="Marked-up job-site photo"></div>`
    : '';

  // Keep page count tight: header sits with the map; the photo gets its own
  // page. If there's no map, the photo rides on the header page instead — so
  // we never emit a near-empty page.
  const pages: string[] = [];
  if (map) {
    pages.push(header + mapBlock + foot);
    if (photo) pages.push(brandbar + photoBlock + foot);
  } else if (photo) {
    pages.push(header + photoBlock + foot);
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

export function SiteMarkupTool() {
  const mapCanvas = useRef<AnnotationCanvasHandle | null>(null);
  const photoCanvas = useRef<AnnotationCanvasHandle | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  const [customer, setCustomer] = useState('');
  const [purpose, setPurpose] = useState<string>(PURPOSES[0]);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  function handleDownloadMap() {
    const url = mapCanvas.current?.getDataUrl();
    if (!url) {
      alert('Load a map first (search a job address above).');
      return;
    }
    download(url, `${addressSlug(address)}-map.jpg`);
  }

  function handleDownloadPhoto() {
    const url = photoCanvas.current?.getDataUrl();
    if (!url) {
      alert('Choose a photo first.');
      return;
    }
    download(url, `${addressSlug(address)}-photo.jpg`);
  }

  function handlePrint() {
    if (!address.trim()) {
      alert('Please enter the site address before printing.');
      addressInputRef.current?.focus();
      addressInputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const map = mapCanvas.current?.getDataUrl() ?? null;
    const photo = photoCanvas.current?.getDataUrl() ?? null;
    if (!map && !photo) {
      alert('Add a map and/or a photo before printing.');
      return;
    }
    const html = buildPrintHtml({
      logoUrl: `${window.location.origin}/assets/img/logotype-color.png`,
      customer,
      purpose,
      address,
      notes,
      date: format(new Date(), 'PP'),
      map,
      photo,
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
              Required. Searching the map below fills this in automatically — or
              type it here if you&apos;re not using the map.
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
        <MapPicker canvasRef={mapCanvas} onResolved={setAddress} />
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
          2 · Mark up the photo
        </h2>
        <p className="mt-1 mb-4 text-sm text-fg-2">
          Add a job-site photo and mark the tree(s), drop zone, and any
          no-park areas.
        </p>
        <PhotoPicker canvasRef={photoCanvas} />
        <div className="mt-3">
          <button
            type="button"
            onClick={handleDownloadPhoto}
            className="bt-btn bt-btn-ghost"
          >
            Download photo (.jpg)
          </button>
        </div>
      </section>

      {/* ---- Output ---- */}
      <section className="bt-card mt-8">
        <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
          3 · Print or save the document
        </h2>
        <p className="mt-1 mb-4 text-sm text-fg-2">
          Combines the job details, the map, and the photo into one document
          (the map on the first page, the photo on the second). In the print
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
