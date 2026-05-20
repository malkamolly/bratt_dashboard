import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import {
  loadProductionMonth,
  loadProductionYearToDate,
  type ProductionYtdData,
} from '@/lib/production-data';
import {
  calculateProductionPace,
  paceStatus,
  type PaceStatus,
} from '@/lib/calculations';
import { fmtUsd, fmtPct, monthLabel } from '@/lib/format';
import { workingWeeksInMonth, toIsoDate, type IsoDate } from '@/lib/dates';
import { MonthPicker } from '@/components/MonthPicker';
import type { Crew } from '@/types';

export const dynamic = 'force-dynamic';

type Search = Promise<{ year?: string; month?: string }>;

function parseIntInRange(raw: string | undefined, min: number, max: number) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function statusChipClass(s: PaceStatus): string {
  switch (s) {
    case 'ahead':
      return 'bt-status-ahead';
    case 'on-pace':
      return 'bt-status-onpace';
    case 'behind':
      return 'bt-status-behind';
    case 'no-data':
    default:
      return 'bt-status-neutral';
  }
}

function statusLabel(s: PaceStatus): string {
  switch (s) {
    case 'ahead':
      return 'Ahead';
    case 'on-pace':
      return 'On Pace';
    case 'behind':
      return 'Behind';
    case 'no-data':
    default:
      return '—';
  }
}

export default async function ProductionDashboardPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const now = new Date();
  const year = parseIntInRange(sp.year, 2000, 2100) ?? now.getFullYear();
  const month = parseIntInRange(sp.month, 1, 12) ?? now.getMonth() + 1;

  const [data, ytd] = await Promise.all([
    loadProductionMonth(year, month),
    loadProductionYearToDate(year),
  ]);

  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;
  const isHistorical = data.historicals.length > 0;
  const nameById = new Map(data.crews.map((c) => [c.id, c.name]));

  if (isHistorical) {
    return (
      <HistoricalMonthView
        year={year}
        month={month}
        data={data}
        ytd={ytd}
        nameById={nameById}
        isCurrentMonth={isCurrentMonth}
      />
    );
  }
  return (
    <LiveMonthView
      year={year}
      month={month}
      data={data}
      ytd={ytd}
      nameById={nameById}
      isCurrentMonth={isCurrentMonth}
    />
  );
}

// ---------------------------------------------------------------------------
// LIVE MONTH
// ---------------------------------------------------------------------------
function LiveMonthView({
  year,
  month,
  data,
  ytd,
  nameById,
  isCurrentMonth,
}: {
  year: number;
  month: number;
  data: Awaited<ReturnType<typeof loadProductionMonth>>;
  ytd: ProductionYtdData;
  nameById: Map<string, string>;
  isCurrentMonth: boolean;
}) {
  const result = calculateProductionPace({
    entries: data.entries,
    reconciliation: { adjustments: data.reconciliation },
    budgetedDays: data.ctx.budgetedDays,
    budgetedDaysBeenThrough: data.ctx.budgetedDaysBeenThrough,
    crewBudgets: data.crewBudgets,
    crewIds: data.crews.map((c) => c.id),
    crewInProgress: data.crewInProgress,
  });

  const c = result.combined;
  // Pace status uses effective (completed + in-progress) MTD so a crew with
  // a big open job doesn't show "behind" just because the job hasn't closed.
  const companyStatus = paceStatus(
    c.effective_mtd_revenue,
    c.total_budget,
    c.budgeted_days_been_through,
    c.budgeted_days,
  );

  // Clam crews live inside the Production Crews section on the dashboard
  // (even though they have kind='clam' so the entry form positions them
  // separately).
  const idsByKinds = (...kinds: string[]) =>
    new Set(data.crews.filter((cr) => kinds.includes(cr.kind)).map((cr) => cr.id));
  const productionCrewIds = idsByKinds('production', 'clam');
  const stumpCrewIds = idsByKinds('stump');
  const phcCrewIds = idsByKinds('phc');
  const productionCrewRows = result.perCrew.filter((p) =>
    productionCrewIds.has(p.crew_id),
  );
  const stumpCrewRows = result.perCrew.filter((p) => stumpCrewIds.has(p.crew_id));
  const phcCrewRows = result.perCrew.filter((p) => phcCrewIds.has(p.crew_id));

  // Subtotals for the Production / Stump / PHC breakdown shown at the top.
  // Uses effective MTD (completed + in-progress) to match the company-wide
  // status calculation.
  const summarize = (rows: typeof result.perCrew) => {
    const mtd = rows.reduce((s, r) => s + r.mtd_revenue, 0);
    const wip = rows.reduce((s, r) => s + r.in_progress_revenue, 0);
    const budget = rows.reduce((s, r) => s + r.budget, 0);
    return { mtd, wip, effective: mtd + wip, budget };
  };
  const productionSummary = summarize(productionCrewRows);
  const stumpSummary = summarize(stumpCrewRows);
  const phcSummary = summarize(phcCrewRows);

  const weeks = workingWeeksInMonth(year, month, data.holidays);
  const revByDate = new Map<IsoDate, number>();
  for (const e of data.entries) {
    revByDate.set(e.entry_date, (revByDate.get(e.entry_date) ?? 0) + e.revenue);
  }
  const todayIso = toIsoDate(data.ctx.asOf);
  const weeklyTarget =
    c.budgeted_days > 0 ? c.total_budget / c.budgeted_days : 0;
  const weekRows = weeks.map((w) => {
    const workingDaysTotal = w.workingDays.length;
    const workingDaysComplete = w.workingDays.filter((d) => d <= todayIso).length;
    const total = w.workingDays.reduce(
      (s, d) => s + (revByDate.get(d) ?? 0),
      0,
    );
    const dailyAvg = workingDaysComplete > 0 ? total / workingDaysComplete : 0;
    const expected = weeklyTarget * workingDaysTotal;
    return { label: w.label, workingDaysTotal, workingDaysComplete, total, dailyAvg, expected };
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Header
        year={year}
        month={month}
        subline={
          <>
            <strong className="text-ink">
              Day {c.budgeted_days_been_through} of {c.budgeted_days}
            </strong>{' '}
            ({c.budgeted_days_remaining} working day
            {c.budgeted_days_remaining === 1 ? '' : 's'} left)
          </>
        }
        showEntryButton={isCurrentMonth}
      />

      <YtdStrip ytd={ytd} />

      <section className="mt-3 rounded-card bg-bark p-6 text-cream sm:p-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-4 sm:items-stretch">
          <div className="flex flex-col justify-between border-b border-bark-deep pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6">
            <div>
              <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
                Combined MTD
              </p>
              <p className="mt-2 font-display text-5xl tracking-wider">
                {fmtUsd(c.effective_mtd_revenue)}
              </p>
              <p className="mt-1 text-sm text-cream/80">
                of {fmtUsd(c.total_budget)} &middot;{' '}
                {c.total_budget > 0
                  ? fmtPct(c.effective_mtd_revenue / c.total_budget)
                  : '—'} of budget
              </p>
              <p className="mt-1 text-xs text-cream/60">
                {fmtUsd(c.mtd_revenue)} completed
                {c.in_progress_revenue > 0 && (
                  <> &middot; {fmtUsd(c.in_progress_revenue)} in progress</>
                )}
              </p>
              <p className="mt-1 text-xs text-cream/60">
                {c.mtd_jobs} {c.mtd_jobs === 1 ? 'job' : 'jobs'} &middot; avg{' '}
                {fmtUsd(c.avg_job_size)}/job
              </p>
            </div>
            <div className="mt-3">
              <span className={statusChipClass(companyStatus)}>
                {statusLabel(companyStatus)}
              </span>
            </div>
          </div>

          <Stat
            label="Pacing to finish"
            value={fmtUsd(c.total_pacing_revenue)}
            hint={
              c.in_progress_revenue > 0
                ? "Completed run-rate + in-progress"
                : "If today's rate holds"
            }
          />
          <Stat
            label="Daily avg so far"
            value={fmtUsd(c.daily_avg_revenue)}
            hint={`${c.daily_avg_jobs.toFixed(1)} jobs/day`}
          />
          <Stat
            label="Daily needed for budget"
            value={fmtUsd(c.total_daily_budget_needed)}
            hint={`Across ${c.budgeted_days_remaining} day${
              c.budgeted_days_remaining === 1 ? '' : 's'
            } left`}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-bark-deep pt-5 sm:grid-cols-3">
          <KindBreakdown label="Production Crews" summary={productionSummary} />
          <KindBreakdown label="Stump Grinding" summary={stumpSummary} />
          <KindBreakdown label="PHC" summary={phcSummary} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
          Week by Week
        </h2>
        <div className="mt-4 overflow-hidden rounded-card border-[3px] border-lime bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-edge/40 text-fg-2">
              <tr>
                <Th>Week</Th>
                <Th align="right">Days</Th>
                <Th align="right">Revenue</Th>
                <Th align="right">Daily Avg</Th>
                <Th align="right">Weekly Target</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {weekRows.map((w, idx) => {
                const status: PaceStatus =
                  w.workingDaysComplete === 0 || w.expected <= 0
                    ? 'no-data'
                    : (() => {
                        const partial =
                          (w.workingDaysComplete / w.workingDaysTotal) *
                          w.expected;
                        if (partial <= 0) return 'no-data';
                        const ratio = w.total / partial;
                        if (ratio >= 1.05) return 'ahead';
                        if (ratio < 0.95) return 'behind';
                        return 'on-pace';
                      })();
                return (
                  <tr
                    key={w.label}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-paper/40'}
                  >
                    <Td className="font-headline font-bold text-ink">{w.label}</Td>
                    <Td align="right">
                      {w.workingDaysComplete}/{w.workingDaysTotal}
                    </Td>
                    <Td align="right">{fmtUsd(w.total)}</Td>
                    <Td align="right">{fmtUsd(w.dailyAvg)}</Td>
                    <Td align="right">{fmtUsd(w.expected)}</Td>
                    <Td align="right">
                      <span className={statusChipClass(status)}>
                        {statusLabel(status)}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <CrewTable
        title="Production Crews"
        rows={productionCrewRows}
        nameById={nameById}
        companyDays={c.budgeted_days}
        companyDaysComplete={c.budgeted_days_been_through}
      />

      {stumpCrewRows.length > 0 && (
        <CrewTable
          title="Stump Grinding"
          rows={stumpCrewRows}
          nameById={nameById}
          companyDays={c.budgeted_days}
          companyDaysComplete={c.budgeted_days_been_through}
        />
      )}

      {phcCrewRows.length > 0 && (
        <CrewTable
          title="Plant Healthcare"
          rows={phcCrewRows}
          nameById={nameById}
          companyDays={c.budgeted_days}
          companyDaysComplete={c.budgeted_days_been_through}
        />
      )}
    </main>
  );
}

function CrewTable({
  title,
  rows,
  nameById,
  companyDays,
  companyDaysComplete,
}: {
  title: string;
  rows: Array<ReturnType<typeof calculateProductionPace>['perCrew'][number]>;
  nameById: Map<string, string>;
  companyDays: number;
  companyDaysComplete: number;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
        {title}
      </h2>
      <div className="mt-4 overflow-x-auto rounded-card border-[3px] border-lime bg-white">
        <table className="w-full min-w-[860px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[7%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[9%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="bg-paper-edge/40 text-fg-2">
            <tr>
              <Th>Crew</Th>
              <Th align="right">Jobs</Th>
              <Th align="right">Completed</Th>
              <Th align="right">In Progress</Th>
              <Th align="right">Avg Job</Th>
              <Th align="right">Pacing</Th>
              <Th align="right">Budget</Th>
              <Th align="right">% of Budget</Th>
              <Th align="right">Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, idx) => {
              const status =
                p.budget > 0
                  ? paceStatus(
                      p.effective_mtd_revenue,
                      p.budget,
                      companyDaysComplete,
                      companyDays,
                    )
                  : 'no-data';
              const name = nameById.get(p.crew_id) ?? p.crew_id;
              return (
                <tr
                  key={p.crew_id}
                  className={idx % 2 === 0 ? 'bg-white' : 'bg-paper/40'}
                >
                  <Td className="font-headline font-bold">
                    <Link
                      href={`/production/${p.crew_id}`}
                      className="text-orange underline decoration-orange/40 underline-offset-2 hover:decoration-orange"
                    >
                      {name}
                    </Link>
                  </Td>
                  <Td align="right">{p.mtd_jobs}</Td>
                  <Td align="right">{fmtUsd(p.mtd_revenue)}</Td>
                  <Td align="right">
                    {p.in_progress_revenue > 0 ? (
                      fmtUsd(p.in_progress_revenue)
                    ) : (
                      <span className="text-fg-3">—</span>
                    )}
                  </Td>
                  <Td align="right">{p.mtd_jobs > 0 ? fmtUsd(p.avg_job_size) : '—'}</Td>
                  <Td align="right">{fmtUsd(p.pacing_revenue)}</Td>
                  <Td align="right">
                    {p.budget > 0 ? fmtUsd(p.budget) : 'TBD'}
                  </Td>
                  <Td align="right">
                    {p.budget > 0 ? fmtPct(p.pct_to_budget) : '—'}
                  </Td>
                  <Td align="right">
                    <span className={statusChipClass(status)}>
                      {statusLabel(status)}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-fg-3">
        Click a crew name to see day-by-day numbers. Status uses completed + in-progress revenue.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// HISTORICAL MONTH
// ---------------------------------------------------------------------------
function HistoricalMonthView({
  year,
  month,
  data,
  ytd,
  nameById,
  isCurrentMonth,
}: {
  year: number;
  month: number;
  data: Awaited<ReturnType<typeof loadProductionMonth>>;
  ytd: ProductionYtdData;
  nameById: Map<string, string>;
  isCurrentMonth: boolean;
}) {
  const histByCrew = new Map<string, { jobs: number; revenue: number }>();
  for (const h of data.historicals) {
    histByCrew.set(h.crew_id, { jobs: h.jobs, revenue: h.revenue });
  }
  const totalRev = data.historicals.reduce((s, h) => s + h.revenue, 0);
  const totalJobs = data.historicals.reduce((s, h) => s + h.jobs, 0);
  const totalBudget = Object.values(data.crewBudgets).reduce((s, n) => s + n, 0);
  const pct = totalBudget > 0 ? totalRev / totalBudget : 0;
  const status: PaceStatus =
    totalBudget > 0
      ? pct >= 1.05
        ? 'ahead'
        : pct < 0.95
          ? 'behind'
          : 'on-pace'
      : 'no-data';

  const rowsForKinds = (...kinds: string[]) =>
    data.crews
      .filter((c) => kinds.includes(c.kind))
      .map((c) => ({
        crew: c,
        jobs: histByCrew.get(c.id)?.jobs ?? 0,
        revenue: histByCrew.get(c.id)?.revenue ?? 0,
        budget: data.crewBudgets[c.id] ?? 0,
      }));
  const productionRows = rowsForKinds('production', 'clam');
  const stumpRows = rowsForKinds('stump');
  const phcRows = rowsForKinds('phc');
  const sumRev = (rows: typeof productionRows) =>
    rows.reduce((s, r) => s + r.revenue, 0);
  const productionSubtotal = sumRev(productionRows);
  const stumpSubtotal = sumRev(stumpRows);
  const phcSubtotal = sumRev(phcRows);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Header
        year={year}
        month={month}
        subline={<>Closed month &middot; stored as monthly totals only</>}
        showEntryButton={isCurrentMonth}
      />

      <YtdStrip ytd={ytd} />

      <section className="mt-3 rounded-card bg-bark p-6 text-cream sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
              Total for {monthLabel(year, month)}
            </p>
            <p className="mt-2 font-display text-6xl tracking-wider">
              {fmtUsd(totalRev)}
            </p>
            <p className="mt-1 text-sm text-cream/80">
              {totalBudget > 0 ? (
                <>of {fmtUsd(totalBudget)} &middot; {fmtPct(pct)} of budget</>
              ) : (
                'no budget set'
              )}{' '}
              &middot; {totalJobs} {totalJobs === 1 ? 'job' : 'jobs'}
            </p>
          </div>
          <span className={statusChipClass(status)}>{statusLabel(status)}</span>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3 border-t border-bark-deep pt-4">
          <SubtotalStat label="Production Crews" value={productionSubtotal} />
          <SubtotalStat label="Stump Grinding" value={stumpSubtotal} />
          <SubtotalStat label="PHC" value={phcSubtotal} />
        </div>
      </section>

      <HistoricalCrewTable
        title="Production Crews"
        rows={productionRows}
        nameById={nameById}
        totalRev={totalRev}
        year={year}
        month={month}
      />
      {stumpRows.length > 0 && (
        <HistoricalCrewTable
          title="Stump Grinding"
          rows={stumpRows}
          nameById={nameById}
          totalRev={totalRev}
          year={year}
          month={month}
        />
      )}
      {phcRows.length > 0 && (
        <HistoricalCrewTable
          title="Plant Healthcare"
          rows={phcRows}
          nameById={nameById}
          totalRev={totalRev}
          year={year}
          month={month}
        />
      )}
    </main>
  );
}

function HistoricalCrewTable({
  title,
  rows,
  nameById,
  totalRev,
  year,
  month,
}: {
  title: string;
  rows: Array<{ crew: Crew; jobs: number; revenue: number; budget: number }>;
  nameById: Map<string, string>;
  totalRev: number;
  year: number;
  month: number;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
        {title}
      </h2>
      <div className="mt-4 overflow-x-auto rounded-card border-[3px] border-lime bg-white">
        <table className="w-full min-w-[640px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[12%]" />
            <col className="w-[22%]" />
            <col className="w-[20%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead className="bg-paper-edge/40 text-fg-2">
            <tr>
              <Th>Crew</Th>
              <Th align="right">Jobs</Th>
              <Th align="right">Revenue</Th>
              <Th align="right">Budget</Th>
              <Th align="right">% of Month</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.crew.id}
                className={idx % 2 === 0 ? 'bg-white' : 'bg-paper/40'}
              >
                <Td className="font-headline font-bold">
                  <Link
                    href={`/production/${r.crew.id}?year=${year}&month=${month}`}
                    className="text-orange underline decoration-orange/40 underline-offset-2 hover:decoration-orange"
                  >
                    {nameById.get(r.crew.id) ?? r.crew.name}
                  </Link>
                </Td>
                <Td align="right">{r.jobs}</Td>
                <Td align="right">{fmtUsd(r.revenue)}</Td>
                <Td align="right">{r.budget > 0 ? fmtUsd(r.budget) : '—'}</Td>
                <Td align="right">
                  {totalRev > 0 ? fmtPct(r.revenue / totalRev) : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
function Header({
  year,
  month,
  subline,
  showEntryButton,
}: {
  year: number;
  month: number;
  subline: React.ReactNode;
  showEntryButton: boolean;
}) {
  return (
    <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="bt-eyebrow">Dashboard 2</p>
        <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink">
          Production PACE
        </h1>
        <p className="mt-3 text-fg-2">
          {monthLabel(year, month)} &mdash; {subline}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {showEntryButton && (
          <>
            <Link
              href="/production/entry"
              className="inline-flex items-center rounded-full bg-orange px-5 py-2 font-headline text-xs font-extrabold uppercase tracking-ribbon text-white shadow-sh-1 transition-colors hover:bg-orange-hover"
            >
              Enter Today&apos;s Numbers
            </Link>
            <Link
              href="/production/in-progress"
              className="inline-flex items-center rounded-full border-2 border-bark bg-white px-4 py-2 font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark transition-colors hover:bg-bark hover:text-cream"
            >
              In-Progress Jobs
            </Link>
          </>
        )}
        <MonthPicker year={year} month={month} />
      </div>
    </section>
  );
}

function YtdStrip({ ytd }: { ytd: ProductionYtdData }) {
  if (!ytd.byMonth || ytd.byMonth.length === 0) return null;
  const pct =
    ytd.annualGoal && ytd.annualGoal > 0 ? ytd.ytdRevenue / ytd.annualGoal : null;
  const barPct = pct != null ? Math.min(100, Math.max(0, pct * 100)) : null;
  return (
    <section className="mt-6 flex flex-col gap-3 rounded-full border-2 border-paper-edge bg-white/70 px-5 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-2">
          YTD {ytd.year}
        </span>
        <span className="font-headline text-lg font-black text-ink">
          {fmtUsd(ytd.ytdRevenue)}
        </span>
        {ytd.annualGoal != null ? (
          <span className="text-xs text-fg-3">
            of {fmtUsd(ytd.annualGoal)} &middot; {pct != null ? fmtPct(pct) : '—'}
          </span>
        ) : (
          <span className="text-xs text-fg-3">
            {ytd.ytdJobs} {ytd.ytdJobs === 1 ? 'job' : 'jobs'} &middot; no annual goal set
          </span>
        )}
      </div>
      {barPct != null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-edge sm:w-48">
          <div
            className="h-full rounded-full bg-orange"
            style={{ width: `${barPct}%` }}
          />
        </div>
      )}
    </section>
  );
}

function SubtotalStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-lime">
        {label}
      </p>
      <p className="mt-1 font-headline text-xl font-black sm:text-2xl">
        {fmtUsd(value)}
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col justify-between border-b border-bark-deep pb-4 last:border-b-0 last:pb-0 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6 sm:last:border-r-0 sm:last:pr-0">
      <div>
        <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-lime">
          {label}
        </p>
        <p className="mt-2 font-headline text-2xl font-black sm:text-3xl">
          {value}
        </p>
      </div>
      {hint && <p className="mt-1 text-xs text-cream/70">{hint}</p>}
    </div>
  );
}

function KindBreakdown({
  label,
  summary,
}: {
  label: string;
  summary: { mtd: number; wip: number; effective: number; budget: number };
}) {
  const pct = summary.budget > 0 ? summary.effective / summary.budget : null;
  return (
    <div>
      <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-lime">
        {label}
      </p>
      <p className="mt-1 font-headline text-xl font-black sm:text-2xl">
        {fmtUsd(summary.effective)}
      </p>
      <p className="mt-0.5 text-[11px] text-cream/70">
        {summary.budget > 0 ? (
          <>
            of {fmtUsd(summary.budget)} &middot; {fmtPct(pct ?? 0)}
          </>
        ) : (
          'no budget set'
        )}
      </p>
      {summary.wip > 0 && (
        <p className="mt-0.5 text-[11px] text-cream/60">
          {fmtUsd(summary.mtd)} completed &middot; {fmtUsd(summary.wip)} in progress
        </p>
      )}
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-4 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  className = '',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-3 ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  );
}
