import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { fmtUsd, fmtPct } from '@/lib/format';
import {
  loadDashboard,
  WINDOW_LABELS,
  type WindowSummary,
  type TrackBreakdown,
} from '@/lib/off-season-data';
import { OffSeasonTotals } from './OffSeasonTotals';
import { CopyAsImageButton } from '@/components/CopyAsImageButton';

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
            Scheduled off-season work &mdash; the discounted push plus dormant
            and regular off-season work &mdash; tracked toward a combined goal in
            each window, Nov&ndash;Dec and Jan&ndash;March.
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {data && <CopyAsImageButton targetId="osw-snapshot" label="Copy" />}
          <Link href="/off-season/entry" className="bt-btn bt-btn-primary">
            Update today
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

          {/* ---- Slack snapshot: summary panel + window cards ---- */}
          <div id="osw-snapshot" className="mt-8 space-y-10">
          {/* ---- TOP: scheduled per window ---- */}
          <section className="rounded-card bg-bark p-6 text-cream sm:p-8">
            <p className="mb-5 font-headline text-sm font-black uppercase tracking-ribbon text-cream/80">
              Off-Season Work &middot; {data.season.label}
              {data.lastUpdated && (
                <span className="text-cream/50">
                  {' '}&middot; Updated {niceDate(data.lastUpdated)}
                </span>
              )}
            </p>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="lg:w-64 lg:flex-shrink-0">
                <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
                  Scheduled
                </p>
                <div className="mt-3 space-y-3">
                  {data.windows.map((w) => (
                    <div key={w.osWindow}>
                      <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-cream/60">
                        {w.windowLabel}
                      </p>
                      <p className="font-headline text-3xl font-black leading-none">
                        {fmtUsd(w.scheduled)}
                      </p>
                      <p className="mt-0.5 text-xs text-cream/70">
                        {fmtPct(w.pctToGoal)} of {fmtUsd(w.goalAmount)}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-sm text-cream/70">
                  {fmtUsd(data.grand.discount)} in discounts given
                  <span className="block text-cream/50">
                    {fmtPct(data.grand.discountPct)} of scheduled work
                  </span>
                </p>
              </div>

              <div className="min-w-0 flex-1 rounded-2 bg-cream/5 p-3">
                <OffSeasonTotals
                  bars={data.windows.map((w) => ({
                    name: w.windowLabel,
                    discounted:
                      w.breakdown.find((b) => b.workType === 'discounted')?.scheduled ?? 0,
                    dormant:
                      w.breakdown.find((b) => b.workType === 'dormant')?.scheduled ?? 0,
                    goal: w.goalAmount,
                  }))}
                />
                <p className="mt-1 text-center text-[11px] text-cream/50">
                  Combined <strong>scheduled</strong> per window toward goal
                  &mdash; orange = discounted, green = dormant, faint = left to
                  goal.
                </p>
              </div>
            </div>
          </section>

          {/* ---- Per-window detail with milestone ladders ---- */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {data.windows.map((w) => (
              <WindowCard key={w.osWindow} w={w} />
            ))}
          </section>
          </div>
        </>
      )}
    </main>
  );
}

function WindowCard({ w }: { w: WindowSummary }) {
  const reachedGoal = w.goalAmount > 0 && w.scheduled >= w.goalAmount;
  const milestoneCaption = reachedGoal
    ? 'Goal reached'
    : w.currentMilestone > 0
      ? `Passed ${fmtUsd(w.currentMilestone)} — next ${fmtUsd(w.nextMilestone)}`
      : `Working toward the first ${fmtUsd(w.nextMilestone)}`;

  return (
    <article className="bt-card">
      <div>
        <p className="bt-eyebrow">{WINDOW_LABELS[w.osWindow]}</p>
        <h2 className="mt-1 font-headline text-3xl font-black uppercase text-bark-deep">
          {fmtUsd(w.scheduled)}
          <span className="ml-2 text-base font-bold text-fg-2">
            scheduled of {fmtUsd(w.goalAmount)}
          </span>
        </h2>
      </div>

      <div className="mt-4">
        <MilestoneBar
          value={w.scheduled}
          goal={w.goalAmount}
          step={w.milestoneStep}
        />
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-orange">
            {milestoneCaption}
          </span>
          <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            {fmtPct(w.pctToGoal)} to goal
          </span>
        </div>
      </div>

      {/* Breakdown: how the combined number splits across the two work types. */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {w.breakdown.map((b) => (
          <BreakdownTile key={b.workType} b={b} />
        ))}
      </div>
    </article>
  );
}

// A milestone ladder: an orange progress fill toward goal, with a tick at each
// $-rung. Reached rungs are dark; upcoming ones faint.
function MilestoneBar({
  value,
  goal,
  step,
}: {
  value: number;
  goal: number;
  step: number;
}) {
  const pct = goal > 0 ? Math.max(0, Math.min(1, value / goal)) : 0;
  const rungs: number[] = [];
  if (goal > 0 && step > 0) {
    for (let m = step; m < goal - 1; m += step) rungs.push(m);
    // Guard against pathological configs producing a huge number of ticks.
    if (rungs.length > 40) rungs.length = 0;
  }

  return (
    <div className="relative h-4 w-full overflow-hidden rounded-full bg-paper-edge/60">
      <div
        className="h-full rounded-full bg-orange transition-all"
        style={{ width: `${pct * 100}%` }}
      />
      {rungs.map((m) => {
        const left = (m / goal) * 100;
        const reached = value >= m;
        return (
          <span
            key={m}
            className={`absolute top-0 h-full w-px ${
              reached ? 'bg-white/50' : 'bg-bark/25'
            }`}
            style={{ left: `${left}%` }}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}

function BreakdownTile({ b }: { b: TrackBreakdown }) {
  return (
    <div className="rounded-2 border-2 border-paper-edge bg-paper/40 px-3 py-2.5">
      <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-wood">
        {b.typeLabel}
      </p>
      <p className="mt-0.5 font-headline text-lg font-black leading-tight text-ink">
        {fmtUsd(b.scheduled)}
      </p>
      {b.hasDiscount && (
        <p className="text-xs text-fg-2">{fmtUsd(b.discount)} discounts</p>
      )}
    </div>
  );
}
