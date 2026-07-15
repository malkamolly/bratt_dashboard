import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireHubAccess, canUseCalculator } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { QuoteBuilder } from '@/components/QuoteBuilder';
import { StumpQuoteBuilder } from '@/components/StumpQuoteBuilder';
import { CalculatorTabs } from '@/components/CalculatorTabs';

export const dynamic = 'force-dynamic';

export default async function CalculatorPage() {
  const user = await requireHubAccess('hub');
  // Open to admin, the sales manager, and sales arborists (see canUseCalculator).
  if (!canUseCalculator(user.role)) redirect('/access-denied');

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Calculators
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Price Calculators
      </h1>
      <p className="mt-4 max-w-2xl text-fg-2">
        Build a quote for a customer visit. Pick the calculator you need below.
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/calculator" />
      </div>

      <CalculatorTabs
        tabs={[
          { id: 'phc', label: 'PHC Treatments', content: <PhcCalculator /> },
          { id: 'stump', label: 'Stump Herbicide', content: <StumpHerbicideCalculator /> },
        ]}
      />
    </main>
  );
}

function PhcCalculator() {
  return (
    <div>
      <p className="max-w-2xl text-fg-2">
        Pick a treatment, enter the tree&apos;s DBH (trunk diameter at ~4.5 ft
        up), and the number of trees getting that same treatment. Add a line for
        each treatment and the total adds up as you go.
      </p>

      <div className="mt-6">
        <QuoteBuilder />
      </div>

      <section className="mt-10 rounded-card border-2 border-paper-edge bg-white/60 p-5 text-sm text-fg-2">
        <h2 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
          Good to know
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>
            Prices are for an <strong>entire year</strong> of treatment. When a
            treatment includes multiple sprays, all of them are included in the
            price shown.
          </li>
          <li>
            Single-spray pricing reflects one or more trees on the{' '}
            <strong>same property</strong>.
          </li>
          <li>
            Single-spray pricing does <strong>not</strong> apply to trees over
            25 ft tall — consult PHC Manager (Connor) for those.
          </li>
          <li>
            Prices come from the Master PHC Price Guide and are a quoting aid —
            double-check anything unusual with the PHC manager.
          </li>
        </ul>
      </section>
    </div>
  );
}

function StumpHerbicideCalculator() {
  return (
    <div>
      <p className="max-w-2xl text-fg-2">
        Enter each stump&apos;s diameter (in inches) and how many stumps of that
        size the customer has. Pricing is per stump; add a line for each size and
        the total adds up as you go.
      </p>

      <section className="mt-6 rounded-card border-2 border-orange-press bg-orange/10 p-5 text-sm text-orange-press">
        <h2 className="font-headline text-xs font-extrabold uppercase tracking-ribbon">
          The 2 ft rule — read before quoting multiples
        </h2>
        <p className="mt-3">
          When multiple stumps are grouped within a <strong>2 ft area</strong>,
          someone from the <strong>Review team</strong> needs to help determine
          the best pricing — the straight per-stump total below may not apply.
        </p>
      </section>

      <div className="mt-6">
        <StumpQuoteBuilder />
      </div>
    </div>
  );
}
