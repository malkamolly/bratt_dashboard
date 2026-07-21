import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { fmtUsd, fmtPct } from '@/lib/format';
import { loadDashboard, type TargetSummary } from '@/lib/off-season-data';
import { OffSeasonChart } from './OffSeasonChart';

export const dynamic = 'force-dynamic';

// "2026-08-01" -> "Aug 1, 2026"
function niceDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function OffSeasonPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  await requireHubAccess('pace');
  const params = await searchParams;
  const data = await loadDashboard(params.season);

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/office" className="hover:underline">
          Office Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Off-Season Work
      </p>

      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
            Off-Season Work
          </h1>
          <p className="mt-4 max-w-2xl text-fg-2">
            How our off-season push is booking up against goal &mdash; the
            discounted fall work and the dormant-season work that has to happen
            cold. Winter work is better for the yard, and this is where we track
            the pace.
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Link href="/off-season/entry" className="bt-btn bt-btn-primary">
            Enter today
          </Link>
          <Link href="/off-season/settings" className="bt-btn bt-btn-ghost">
            Goals
          </Link>
        </div>
      </div>

      {!data ? (
        <p className="mt-10 rounded-2 border-2 border-paper-edge bg-paper/40 px-4 py-6 text-fg-2">
          No seasons set up yet. Add goals on the{' '}
          <Link href="/off-season/settings" className="text-orange underline">
            Goals
          </Link>{' '}
          screen to get started.
        </p>
      ) : (
        <>
          {/* Season switcher — the current season is shown by default; you can
              flip to any past season for comparison. */}
          {data.seasons.length > 1 && (
            <nav className="mt-8 flex flex-wrap items-center gap-2">
              <span className="bt-eyebrow mr-1">Season</span>
              {data.seasons.map((s) => {
                const active = s.id === data.season.id;
                return (
                  <Link
                    key={s.id}
                    href={`/off-season?season=${encodeURIComponent(s.id)}`}
                    className={`rounded-full border-2 px-4 py-1.5 font-headline text-xs font-extrabold uppercase tracking-ribbon transition-colors ${
                      active
                        ? 'border-orange bg-orange text-white'
                        : 'border-paper-edge text-fg-2 hover:border-orange'
                    }`}
                  >
                    {s.label}
                    {s.isCurrent && !active ? ' · now' : ''}
                  </Link>
                );
              })}
            </nav>
          )}

          <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {data.targets.map((t) => (
              <TargetCard key={t.workType} t={t} />
            ))}
          </section>
        </>
      )}
    </main>
  );
}

function TargetCard({ t }: { t: TargetSummary }) {
  const pctClamped = Math.max(0, Math.min(1, t.pctToGoal));

  // Pace status: neutral before the window opens; otherwise ahead / on pace /
  // behind based on booked-vs-even-pace. "On pace" = within 2% of goal.
  const tolerance = 0.02 * t.goalAmount;
  let chipClass = 'bt-status-neutral';
  let chipText = 'Not started yet';
  if (t.hasStarted) {
    if (Math.abs(t.pace) <= tolerance) {
      chipClass = 'bt-status-onpace';
      chipText = 'On pace';
    } else if (t.pace > 0) {
      chipClass = 'bt-status-ahead';
      chipText = `${fmtUsd(t.pace)} ahead of pace`;
    } else {
      chipClass = 'bt-status-behind';
      chipText = `${fmtUsd(Math.abs(t.pace))} behind pace`;
    }
  }

  return (
    <article className="bt-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
            {t.label}
          </h2>
          <p className="mt-1 text-sm text-fg-2">{t.blurb}</p>
        </div>
        <span className={chipClass}>{chipText}</span>
      </div>

      {/* Booked vs goal */}
      <div className="mt-5 flex items-baseline gap-2">
        <span className="font-headline text-4xl font-black text-ink">
          {fmtUsd(t.booked)}
        </span>
        <span className="text-sm text-fg-2">
          booked of {fmtUsd(t.goalAmount)} goal
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-3 w-full overflow-hidden rounded-full bg-paper-edge/60">
          <div
            className="h-full rounded-full bg-orange transition-all"
            style={{ width: `${pctClamped * 100}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
          <span>{fmtPct(t.pctToGoal)} to goal</span>
          <span>
            {niceDate(t.windowStart)} &ndash; {niceDate(t.windowEnd)}
          </span>
        </div>
      </div>

      {/* Discount cost */}
      <div className="mt-4 flex items-center justify-between rounded-2 border-2 border-paper-edge bg-paper/40 px-4 py-2.5">
        <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
          Discounts given
        </span>
        <span className="font-headline text-base font-black text-ink">
          {fmtUsd(t.discountGiven)}
          <span className="ml-2 text-xs font-bold text-fg-2">
            {fmtPct(t.discountPct)} of booked
          </span>
        </span>
      </div>

      <div className="mt-5">
        <OffSeasonChart series={t.series} />
      </div>
    </article>
  );
}
