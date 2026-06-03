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

function download(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function SiteMarkupTool() {
  const mapCanvas = useRef<AnnotationCanvasHandle | null>(null);
  const photoCanvas = useRef<AnnotationCanvasHandle | null>(null);

  const [customer, setCustomer] = useState('');
  const [purpose, setPurpose] = useState<string>(PURPOSES[0]);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  // Flattened images captured at print time.
  const [printMap, setPrintMap] = useState<string | null>(null);
  const [printPhoto, setPrintPhoto] = useState<string | null>(null);
  const [printReq, setPrintReq] = useState(0);

  // After the print images land in the DOM, trigger the browser print dialog.
  useEffect(() => {
    if (printReq === 0) return;
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, [printReq]);

  function handleDownloadMap() {
    const url = mapCanvas.current?.getDataUrl();
    if (!url) {
      alert('Load a map first (search a job address above).');
      return;
    }
    download(url, 'bratt-site-map.jpg');
  }

  function handleDownloadPhoto() {
    const url = photoCanvas.current?.getDataUrl();
    if (!url) {
      alert('Choose a photo first.');
      return;
    }
    download(url, 'bratt-site-photo.jpg');
  }

  function handlePrint() {
    const map = mapCanvas.current?.getDataUrl() ?? null;
    const photo = photoCanvas.current?.getDataUrl() ?? null;
    if (!map && !photo) {
      alert('Add a map and/or a photo before printing.');
      return;
    }
    setPrintMap(map);
    setPrintPhoto(photo);
    setPrintReq((n) => n + 1);
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
          Combines the job details, the map, and the photo into one document.
          In the print window, pick <strong>&ldquo;Save as PDF&rdquo;</strong> as
          the destination to email it, or print it to paper.
        </p>
        <button
          type="button"
          onClick={handlePrint}
          className="bt-btn bt-btn-primary"
        >
          Print / Save as PDF
        </button>
      </section>

      {/* ---- Print-only layout (hidden on screen) ---- */}
      <PrintDocument
        customer={customer}
        purpose={purpose}
        address={address}
        notes={notes}
        mapImg={printMap}
        photoImg={printPhoto}
      />

      <style>{`
        .site-print { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .site-print, .site-print * { visibility: visible !important; }
          .site-print {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
          }
          .site-print img {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            max-width: 100%;
            height: auto;
          }
          .site-print-page { page-break-after: always; }
          .site-print-page:last-child { page-break-after: auto; }
        }
      `}</style>
    </>
  );
}

function PrintDocument({
  customer,
  purpose,
  address,
  notes,
  mapImg,
  photoImg,
}: {
  customer: string;
  purpose: string;
  address: string;
  notes: string;
  mapImg: string | null;
  photoImg: string | null;
}) {
  const today = format(new Date(), 'PP');
  return (
    <div className="site-print" aria-hidden>
      <div className="site-print-page" style={{ padding: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>
          BRATT TREE — SITE WORK PLAN
        </h1>
        <p style={{ fontSize: '13px', margin: '4px 0 12px' }}>{purpose}</p>
        <table style={{ fontSize: '12px', borderCollapse: 'collapse', marginBottom: '14px' }}>
          <tbody>
            {customer && (
              <tr>
                <td style={{ paddingRight: '12px', fontWeight: 700 }}>Customer:</td>
                <td>{customer}</td>
              </tr>
            )}
            {address && (
              <tr>
                <td style={{ paddingRight: '12px', fontWeight: 700 }}>Address:</td>
                <td>{address}</td>
              </tr>
            )}
            <tr>
              <td style={{ paddingRight: '12px', fontWeight: 700 }}>Date:</td>
              <td>{today}</td>
            </tr>
            {notes && (
              <tr>
                <td style={{ paddingRight: '12px', fontWeight: 700, verticalAlign: 'top' }}>Notes:</td>
                <td>{notes}</td>
              </tr>
            )}
          </tbody>
        </table>
        {mapImg && (
          <>
            <h2 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px' }}>Site Map</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mapImg} alt="Marked-up site map" />
          </>
        )}
      </div>

      {photoImg && (
        <div className="site-print-page" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px' }}>
            Tree / Work Location
          </h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoImg} alt="Marked-up job-site photo" />
        </div>
      )}
    </div>
  );
}
