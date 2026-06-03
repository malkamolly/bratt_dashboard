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

/** Build the standalone HTML document we print from a hidden iframe. The
 *  <title> becomes the browser's default "Save as PDF" file name. */
function buildPrintHtml(opts: {
  title: string;
  customer: string;
  purpose: string;
  address: string;
  notes: string;
  date: string;
  map: string | null;
  photo: string | null;
}): string {
  const { title, customer, purpose, address, notes, date, map, photo } = opts;

  const row = (k: string, v: string) =>
    v ? `<tr><td class="k">${k}</td><td>${escapeHtml(v)}</td></tr>` : '';
  const header = `
    <h1>BRATT TREE — SITE WORK PLAN</h1>
    <div class="purpose">${escapeHtml(purpose)}</div>
    <table>
      ${row('Customer:', customer)}
      ${row('Address:', address)}
      ${row('Date:', date)}
      ${row('Notes:', notes)}
    </table>`;
  const mapBlock = map
    ? `<h2>Site Map</h2><img class="map" src="${map}" alt="Marked-up site map">`
    : '';
  const photoBlock = photo
    ? `<h2>Tree / Work Location</h2><img class="photo" src="${photo}" alt="Marked-up job-site photo">`
    : '';

  // Keep page count tight: header sits with the map; the photo gets its own
  // page. If there's no map, the photo rides on the header page instead — so
  // we never emit a near-empty page.
  const pages: string[] = [];
  if (map) {
    pages.push(header + mapBlock);
    if (photo) pages.push(photoBlock);
  } else if (photo) {
    pages.push(header + photoBlock);
  } else {
    pages.push(header);
  }
  const body = pages
    .map((p) => `<section class="page">${p}</section>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; color: #1A0E05; }
  h1 { font-size: 20px; margin: 0; }
  .purpose { font-size: 13px; margin: 4px 0 12px; }
  table { font-size: 12px; border-collapse: collapse; margin-bottom: 14px; }
  td { padding: 2px 12px 2px 0; vertical-align: top; }
  td.k { font-weight: 700; white-space: nowrap; }
  h2 { font-size: 14px; margin: 0 0 6px; }
  img { display: block; max-width: 100%; }
  /* Cap heights so a single image never spills onto a second page. */
  img.map { max-height: 8in; }
  img.photo { max-height: 9.3in; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
</style></head><body>${body}</body></html>`;
}

/** Print a standalone HTML document via a hidden iframe, so ONLY that document
 *  prints (no blank pages from the surrounding app). */
function printViaIframe(html: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
    // Tidy up after the dialog closes; the timeout is a safety net for
    // browsers that don't fire `afterprint`.
    win.onafterprint = () => iframe.remove();
    setTimeout(() => iframe.remove(), 60000);
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

export function SiteMarkupTool() {
  const mapCanvas = useRef<AnnotationCanvasHandle | null>(null);
  const photoCanvas = useRef<AnnotationCanvasHandle | null>(null);

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
    const map = mapCanvas.current?.getDataUrl() ?? null;
    const photo = photoCanvas.current?.getDataUrl() ?? null;
    if (!map && !photo) {
      alert('Add a map and/or a photo before printing.');
      return;
    }
    const html = buildPrintHtml({
      // Browsers use the document title as the default Save-as-PDF file name.
      title: address.trim() || 'Bratt Tree Site Work Plan',
      customer,
      purpose,
      address,
      notes,
      date: format(new Date(), 'PP'),
      map,
      photo,
    });
    printViaIframe(html);
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
