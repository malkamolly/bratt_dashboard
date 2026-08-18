import Link from 'next/link';
import { QuoteBuilder } from '@/components/QuoteBuilder';
import { PARTNER } from '@/lib/partner-config';

export const dynamic = 'force-dynamic';

/**
 * Partner-facing PHC calculator.
 *
 * Deliberately reuses <QuoteBuilder /> and lib/phc-pricing.ts unchanged, so the
 * partner and our own sales arborists always quote from the SAME price book.
 * Never fork the price book for the partner — if partner pricing ever needs to
 * differ, add a rate layer on top of phc-pricing.ts instead of copying it.
 *
 * The `.partner-theme` wrapper on the layout re-skins the shared .bt-* classes
 * inside QuoteBuilder to neutral slate/emerald (see globals.css), which is how
 * we reuse the component without dragging Bratt's orange branding along.
 */
export default function PartnerCalculatorPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm text-slate-500">
        <Link href="/partner" className="hover:underline">
          {PARTNER.name}
        </Link>
        <span className="mx-2">/</span>
        Calculator
      </p>

      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        PHC Price Calculator
      </h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        Pick a treatment, enter the tree&apos;s DBH (trunk diameter measured
        about 4.5 ft off the ground), and how many trees are getting that same
        treatment. Add a line per treatment and the total adds up as you go.
      </p>

      <div className="mt-8">
        <QuoteBuilder />
      </div>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Good to know
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            Prices cover an <strong>entire year</strong> of treatment. When a
            treatment includes multiple sprays, all of them are included in the
            price shown.
          </li>
          <li>
            Single-spray pricing reflects one or more trees on the{' '}
            <strong>same property</strong>.
          </li>
          <li>
            Single-spray pricing does <strong>not</strong> apply to trees over 25
            ft tall &mdash; contact {PARTNER.contactName} for those.
          </li>
          <li>
            These prices are a quoting aid. Double-check anything unusual with{' '}
            <a
              href={`mailto:${PARTNER.contactEmail}`}
              className="font-semibold text-emerald-700 hover:underline"
            >
              {PARTNER.contactName}
            </a>{' '}
            before committing to a customer.
          </li>
        </ul>
      </section>
    </main>
  );
}
