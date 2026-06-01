import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireHubAccess, canUseCalculator } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { QuoteBuilder } from '@/components/QuoteBuilder';

export const dynamic = 'force-dynamic';

export default async function CalculatorPage() {
  const user = await requireHubAccess('hub');
  // Managers + admin only while the calculator is in testing.
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
        PHC Calculator
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        PHC Price Calculator
      </h1>
      <p className="mt-4 max-w-2xl text-fg-2">
        Build a quote for a customer visit. Pick a treatment, enter the tree&apos;s
        DBH (trunk diameter at ~4.5 ft up), and the number of trees getting that
        same treatment. Add a line for each treatment and the total adds up as you
        go.
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/calculator" />
      </div>

      <QuoteBuilder />

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
    </main>
  );
}
