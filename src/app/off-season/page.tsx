import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { fmtUsd, fmtPct } from '@/lib/format';
import {
  loadDashboard,
  OS_WINDOWS,
  WORK_TYPES,
  WORK_TYPE_LABELS,
  WINDOW_LABELS,
  type TrackSummary,
  type Totals,
} from '@/lib/off-season-data';
import { OffSeasonChart } from './OffSeasonChart';
import { OffSeasonTotals } from './OffSeasonTotals';

export const dynamic = 'force-dynamic';

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
            Our off-season push, four tracks in all: the discounted work and the
            dormant-season work, each split into the Nov&ndash;Dec and
            Jan&ndash;March windows. Winter work is better for the yard &mdash;
            this is where we track how it&rsquo;s booking up.
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

          {/* ---- TOP: season totals across all four tracks ---- */}
          <section className="mt-8 rounded-card bg-bark p-6 text-cream sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="lg:w-64 lg:flex-shrink-0">
                <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
                  On the books &mdash; all tracks
                </p>
                <p className="mt-2 font-headline text-5xl font-black leading-none">
                  {fmtUsd(data.grand.booked)}
                </p>
                <p className="mt-2 text-sm text-cream/70">
                  {fmtPct(data.grand.pctToGoal)} of {fmtUsd(data.grand.goal)}{' '}
                  combined goal
                </p>
                <p className="mt-1 text-sm text-cream/70">
                  {fmtUsd(data.grand.discount)} in discounts given
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <MiniTotal label="Discounted" t={data.byType.discounted} accent="text-apricot" />
                  <MiniTotal label="Dormant" t={data.byType.dormant} accent="text-green" />
                  <MiniTotal label="Nov–Dec" t={data.byWindow.nov_dec} accent="text-cream/80" />
                  <MiniTotal label="Jan–March" t={data.byWindow.jan_march} accent="text-cream/80" />
                </div>
              </div>

              <div className="min-w-0 flex-1 rounded-2 bg-cream/5 p-3">
                <OffSeasonTotals
                  bars={OS_WINDOWS.map((win) => ({
                    name: WINDOW_LABELS[win],
                    discounted:
                      data.tracks.find(
                        (t) => t.osWindow === win && t.workType === 'discounted',
                      )?.booked ?? 0,
                    dormant:
                      data.tracks.find(
                        (t) => t.osWindow === win && t.workType === 'dormant',
                      )?.booked ?? 0,
                    goal: data.byWindow[win].goal,
                  }))}
                />
                <p className="mt-1 text-center text-[11px] text-cream/50">
                  Each bar is a window&rsquo;s booking toward goal &mdash; orange
                  = discounted, green = dormant, faint = left to goal.
                </p>
              </div>
            </div>
          </section>

          {/* ---- DETAIL: one card per track, grouped by work type ---- */}
          {WORK_TYPES.map((wt) => (
            <section key={wt} className="mt-10">
              <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
                {WORK_TYPE_LABELS[wt]}
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {data.tracks
                  .filter((t) => t.workType === wt)
                  .map((t) => (
                    <TrackCard key={`${t.workType}-${t.osWindow}`} t={t} />
                  ))}
              </div>
            </section>
          ))}
        </>
      )}
    </main>
  );
}

function MiniTotal({
  label,
  t,
  accent,
}: {
  label: string;
  t: Totals;
  accent: string;
}) {
  return (
    <div className="rounded-2 border border-cream/15 px-3 py-2">
      <p className={`font-headline text-[10px] font-extrabold uppercase tracking-ribbon ${accent}`}>
        {label}
      </p>
      <p className="mt-0.5 font-headline text-lg font-black leading-tight">
        {fmtUsd(t.booked)}
      </p>
    </div>
  );
}

function TrackCard({ t }: { t: TrackSummary }) {
  const pctClamped = Math.max(0, Math.min(1, t.pctToGoal));

  const tolerance = 0.02 * t.goalAmount;
  let chipClass = 'bt-status-neutral';
  let chipText = 'Not started yet';
  if (t.hasStarted) {
    if (Math.abs(t.pace) <= tolerance) {
      chipClass = 'bt-status-onpace';
      chipText = 'On pace';
    } else if (t.pace > 0) {
      chipClass = 'bt-status-ahead';
      chipText = `${fmtUsd(t.pace)} ahead`;
    } else {
      chipClass = 'bt-status-behind';
      chipText = `${fmtUsd(Math.abs(t.pace))} behind`;
    }
  }

  return (
    <article className="bt-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="bt-eyebrow">{t.windowLabel}</p>
          <h3 className="mt-1 font-headline text-xl font-black uppercase text-bark-deep">
            {fmtUsd(t.booked)}
            <span className="ml-2 text-sm font-bold text-fg-2">
              of {fmtUsd(t.goalAmount)}
            </span>
          </h3>
        </div>
        <span className={chipClass}>{chipText}</span>
      </div>

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
