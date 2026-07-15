// ============================================================================
// Knot Library index — /crew/knots
// ============================================================================
// A browsable reference of the knots the field crew actually uses. Each card
// links to a step-by-step page. Meant to be looked up on a phone in the field,
// so it stays a lightweight reference (no test here — the graded "Knot Tying"
// training module lives under /crew/modules).
// ============================================================================

import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { KNOTS } from '@/lib/knots';
import { KnotFigure } from '@/components/crew/knots/KnotFigure';

export const dynamic = 'force-dynamic';

const DIFFICULTY_STYLE: Record<string, string> = {
  Core: 'bg-green-dark text-white',
  Everyday: 'bg-lime text-bark-deep',
  Advanced: 'bg-orange text-white',
};

export default async function KnotLibraryPage() {
  await requireHubAccess('crew');

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Knot library
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Knot library
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        The knots we use for rigging, hauling, and anchoring — step by step. Pull
        one up on your phone at the truck. When you&apos;re ready to get signed
        off, take the{' '}
        <Link
          href="/crew/modules/knot_tying"
          className="font-headline font-extrabold uppercase tracking-ribbon text-xs text-orange hover:underline"
        >
          Knot Tying module
        </Link>
        .
      </p>

      <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {KNOTS.map((k) => (
          <li key={k.slug}>
            <Link
              href={`/crew/knots/${k.slug}`}
              className="bt-card flex h-full flex-col gap-3 transition-colors hover:!border-orange"
            >
              <div className="overflow-hidden rounded-2 border border-paper-edge">
                {/* Thumbnail = the finished knot (its last step). */}
                <KnotFigure
                  slug={k.slug}
                  frame={k.steps[k.steps.length - 1].frame}
                  className="block w-full"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
                  {k.name}
                </h2>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon ${
                    DIFFICULTY_STYLE[k.difficulty] ?? 'bg-paper-edge text-fg-2'
                  }`}
                >
                  {k.difficulty}
                </span>
              </div>
              {k.alsoCalled && k.alsoCalled.length > 0 && (
                <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  a.k.a. {k.alsoCalled.join(' · ')}
                </p>
              )}
              <p className="text-sm text-fg-2">{k.tagline}</p>
              <p className="mt-auto font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
                How to tie it →
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
