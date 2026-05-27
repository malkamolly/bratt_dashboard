// ============================================================================
// Certificate — /crew/certificates/[number]
// ============================================================================
// Printable certificate page. The brand frame is styled for browser "Print
// to PDF" (US Letter portrait). Hidden chrome (header/footer nav) so the
// printed page only shows the certificate.
// ============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { requireHubAccess } from '@/lib/auth';
import { getCertificateByNumber } from '@/lib/crew-data';
import { PrintButton } from '@/components/crew/PrintButton';

export const dynamic = 'force-dynamic';

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  await requireHubAccess('crew');
  const { number } = await params;

  const cert = await getCertificateByNumber(number);
  if (!cert) notFound();

  const passedOn = cert.passed_on ? parseISO(cert.passed_on) : null;
  const pct =
    cert.score_total > 0
      ? Math.round((cert.score_correct / cert.score_total) * 100)
      : 0;

  return (
    <>
      {/* Print-only stylesheet: hide nav chrome, keep brand colors, fit one page. */}
      <style>{`
        @media print {
          /* Force browsers to actually print background colors, gradients,
             and the logo image instead of stripping them out. */
          html, body, .cert-frame, .cert-frame * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body { background: white !important; }
          .no-print { display: none !important; }
          /* Drop the screen padding so the certificate doesn't spill
             onto a second page. */
          .cert-main { padding: 0 !important; max-width: none !important; }
          .cert-frame {
            border-width: 6px !important;
            box-shadow: none !important;
            margin: 0 !important;
            break-inside: avoid;
          }
          @page { size: letter portrait; margin: 0.5in; }
        }
      `}</style>

      <main className="cert-main mx-auto max-w-6xl px-6 py-10">
        {/* Top nav strip — hidden when printing */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <p className="bt-eyebrow">
            <Link href="/crew" className="hover:underline">
              Field Crew Hub
            </Link>
            <span className="mx-2 text-fg-3">/</span>
            Certificate
          </p>
          <div className="flex gap-3">
            <PrintButton />
            <Link
              href={`/crew/employees/${cert.employee_slug}`}
              className="bt-btn bt-btn-dark"
            >
              {cert.employee_name}&apos;s profile
            </Link>
          </div>
        </div>

        {/* Certificate frame */}
        <article
          className="cert-frame mt-6 rounded-card border-[6px] border-bark-deep bg-cream p-10 shadow-sh-3"
          style={{ background: 'linear-gradient(180deg, #FFF8EC 0%, #FBF5C8 100%)' }}
        >
          {/* Lime sub-frame for the Bratt Tree look */}
          <div className="rounded-card border-2 border-lime p-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- plain <img> prints reliably */}
            <img
              src="/assets/img/logotype-color.png"
              alt="Bratt Tree"
              className="mx-auto mb-5 h-24 w-auto"
            />
            <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
              Bratt Tree · Operator Certification
            </p>
            <h1 className="mt-4 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
              Certificate
            </h1>
            <p className="mt-6 font-headline text-sm uppercase tracking-ribbon text-fg-2">
              This certifies that
            </p>
            <p className="mt-2 font-display text-5xl tracking-wide text-bark-deep">
              {cert.employee_name}
            </p>
            <p className="mt-6 max-w-lg mx-auto text-fg-2">
              has successfully completed the training and certification test for
            </p>
            <p className="mt-3 font-headline text-2xl font-black uppercase tracking-ribbon text-bark-deep">
              {cert.module_name}
            </p>

            <div className="mt-8 grid grid-cols-3 gap-6 text-sm">
              <div>
                <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  Date passed
                </p>
                <p className="mt-1 font-headline text-base font-extrabold text-bark-deep">
                  {passedOn ? format(passedOn, 'MMM d, yyyy') : '—'}
                </p>
              </div>
              <div>
                <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  Score
                </p>
                <p className="mt-1 font-headline text-base font-extrabold text-bark-deep">
                  {cert.score_correct} / {cert.score_total}
                  <span className="ml-1 text-xs text-fg-3">({pct}%)</span>
                </p>
              </div>
              <div>
                <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  Certificate №
                </p>
                <p className="mt-1 font-mono text-xs text-bark-deep">
                  {cert.certificate_number}
                </p>
              </div>
            </div>

            {/* Signature line */}
            <div className="mx-auto mt-12 max-w-xs">
              {/* eslint-disable-next-line @next/next/no-img-element -- plain <img> prints reliably */}
              <img
                src="/brand/signatures/caleb-o.svg"
                alt="Trainer signature"
                className="mx-auto -mb-1 h-16 w-auto"
              />
              <div className="border-t border-bark-deep pt-1 text-center">
                <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  Trainer
                </p>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Issued by Bratt Tree — {cert.certificate_number}
          </p>
        </article>
      </main>
    </>
  );
}
