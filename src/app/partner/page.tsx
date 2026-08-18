import Link from 'next/link';
import { PARTNER } from '@/lib/partner-config';

export const dynamic = 'force-dynamic';

/**
 * Partner Hub landing. Starts with one card (the PHC calculator) — add cards
 * here as the partnership grows (service descriptions, a request form, etc.).
 */
export default function PartnerHomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        Plant Health Care pricing
      </h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        Price a Plant Health Care treatment for your customer in seconds. These
        are Bratt Tree&apos;s current published prices for the treatments we
        perform on your behalf.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <Link
          href="/partner/calculator"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-emerald-600 hover:shadow-md"
        >
          <h2 className="text-lg font-bold text-slate-900 group-hover:text-emerald-800">
            PHC Price Calculator
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Pick a treatment, enter the tree&apos;s trunk diameter, and get the
            price for a full year of treatment.
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-emerald-700">
            Open calculator &rarr;
          </span>
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Questions?</h2>
          <p className="mt-2 text-sm text-slate-600">
            For anything unusual &mdash; a very large tree, a tree over 25 ft, or
            a treatment you don&apos;t see listed &mdash; reach out to{' '}
            {PARTNER.contactName} before quoting.
          </p>
          <a
            href={`mailto:${PARTNER.contactEmail}`}
            className="mt-4 inline-block text-sm font-semibold text-emerald-700 hover:underline"
          >
            {PARTNER.contactEmail}
          </a>
        </div>
      </div>
    </main>
  );
}
