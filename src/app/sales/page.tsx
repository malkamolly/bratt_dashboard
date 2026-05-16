import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { loadSalesMonth, loadYearToDate, type YearToDateData } from '@/lib/sales-data';
import {
  calculateSalesPace,
  paceStatus,
  type PaceStatus,
} from '@/lib/calculations';
import { fmtUsd, fmtPct, monthLabel } from '@/lib/format';
import { workingWeeksInMonth, toIsoDate, type IsoDate } from '@/lib/dates';
import { MonthPicker } from '@/components/MonthPicker';

export const dynamic = 'force-dynamic';

type Search = Promise<{ year?: string; month?: string }>;

function parseIntInRange(raw: string | undefined, min: number, max: number): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
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

export default async function SalesDashboardPage({
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
    loadSalesMonth(year, month),
    loadYearToDate(year),
  ]);
  const nameById = new Map(data.salespeople.map((s) => [s.id, s.name]));
  const isHistorical = data.historicals.length > 0;
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;

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

// ----------------------------------------------------------------------------
// Live month: full pace dashboard with daily entries, week-by-week, and
// projected month-end pace.
// ----------------------------------------------------------------------------
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
  data: Awaited<ReturnType<typeof loadSalesMonth>>;
  ytd: YearToDateData;
  nameById: Map<string, string>;
  isCurrentMonth: boolean;
}) {
  const result = calculateSalesPace({
    entries: data.entries,
    reconciliation: { adjustments: data.reconciliation },
    budgetedDays: data.ctx.budgetedDays,
    budgetedDaysBeenThrough: data.ctx.budgetedDaysBeenThrough,
    companyGoal: data.companyGoal,
    perPersonGoals: data.perPersonGoals,
    salespeopleIds: data.salespeople.map((sp) => sp.id),
  });

  const c = result.company;
  const companyStatus = paceStatus(
    c.mtd_total,
    c.goal,
    c.budgeted_days_been_through,
    c.budgeted_days,
  );

  const weeks = workingWeeksInMonth(year, month, data.holidays);

  type WeekRow = {
    label: string;
    workingDaysTotal: number;
    workingDaysComplete: number;
    total: number;
    dailyAvg: number;
    expected: number;
  };
  const entriesByDate = new Map<IsoDate, number>();
  for (const e of data.entries) {
    entriesByDate.set(
      e.entry_date,
      (entriesByDate.get(e.entry_date) ?? 0) + e.amount,
    );
  }
  const todayIso = toIsoDate(data.ctx.asOf);
  const weeklyGoal = c.budgeted_days > 0 ? c.goal / c.budgeted_days : 0;
  const weekRows: WeekRow[] = weeks.map((w) => {
    const workingDaysTotal = w.workingDays.length;
    const workingDaysComplete = w.workingDays.filter((d) => d <= todayIso).length;
    const total = w.workingDays.reduce(
      (s, d) => s + (entriesByDate.get(d) ?? 0),
      0,
    );
    const dailyAvg =
      workingDaysComplete > 0 ? total / workingDaysComplete : 0;
    const expected = weeklyGoal * workingDaysTotal;
    return { label: w.label, workingDaysTotal, workingDaysComplete, total, dailyAvg, expected };
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <DashboardHeader
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

      {/* Company hero */}
      <section className="mt-3 rounded-card bg-bark p-6 text-cream sm:p-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-4 sm:items-stretch">
          <div className="flex flex-col justify-between border-b border-bark-deep pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6">
            <div>
              <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
                Company MTD
              </p>
              <p className="mt-2 font-display text-5xl tracking-wider">
                {fmtUsd(c.mtd_total)}
              </p>
              <p className="mt-1 text-sm text-cream/80">
                of {fmtUsd(c.goal)} &middot; {fmtPct(c.pct_to_goal)} of plan
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
            value={fmtUsd(c.mtd_pace)}
            hint="If today's rate holds"
          />
          <Stat
            label="Daily avg so far"
            value={fmtUsd(c.daily_needed_to_remain_on_pace)}
            hint="Per working day"
          />
          <Stat
            label="Daily needed for goal"
            value={fmtUsd(c.daily_needed_to_achieve_budget)}
            hint={`Across ${c.budgeted_days_remaining} day${
              c.budgeted_days_remaining === 1 ? '' : 's'
            } left`}
          />
        </div>
      </section>

      {/* Week by week */}
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
                <Th align="right">Total</Th>
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
                        const partialExpected =
                          (w.workingDaysComplete / w.workingDaysTotal) *
                          w.expected;
                        if (partialExpected <= 0) return 'no-data';
                        const ratio = w.total / partialExpected;
                        if (ratio >= 1.05) return 'ahead';
                        if (ratio < 0.95) return 'behind';
                        return 'on-pace';
                      })();
                return (
                  <tr
                    key={w.label}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-paper/40'}
                  >
                    <Td className="font-headline font-bold text-ink">
                      {w.label}
                    </Td>
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

      {/* Per-salesperson */}
      <section className="mt-10">
        <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
          By Salesperson
        </h2>
        <div className="mt-4 overflow-hidden rounded-card border-[3px] border-lime bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-edge/40 text-fg-2">
              <tr>
                <Th>Salesperson</Th>
                <Th align="right">MTD</Th>
                <Th align="right">Pacing</Th>
                <Th align="right">Goal</Th>
                <Th align="right">% of Goal</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {result.perSalesperson.map((p, idx) => {
                const status =
                  p.goal != null
                    ? paceStatus(
                        p.mtd_total,
                        p.goal,
                        c.budgeted_days_been_through,
                        c.budgeted_days,
                      )
                    : 'no-data';
                const name = nameById.get(p.salesperson_id) ?? p.salesperson_id;
                return (
                  <tr
                    key={p.salesperson_id}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-paper/40'}
                  >
                    <Td className="font-headline font-bold">
                      <Link
                        href={`/sales/${p.salesperson_id}`}
                        className="text-ink hover:text-orange hover:underline"
                      >
                        {name}
                      </Link>
                    </Td>
                    <Td align="right">{fmtUsd(p.mtd_total)}</Td>
                    <Td align="right">{fmtUsd(p.mtd_pace)}</Td>
                    <Td align="right">
                      {p.goal != null ? fmtUsd(p.goal) : 'TBD'}
                    </Td>
                    <Td align="right">{fmtPct(p.pct_to_goal)}</Td>
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
          Click a salesperson&apos;s name to see their day-by-day numbers.
        </p>
      </section>
    </main>
  );
}

// ----------------------------------------------------------------------------
// Historical month: closed-out month stored as one rolled-up total per
// salesperson. No daily/weekly views — just the per-person totals.
// ----------------------------------------------------------------------------
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
  data: Awaited<ReturnType<typeof loadSalesMonth>>;
  ytd: YearToDateData;
  nameById: Map<string, string>;
  isCurrentMonth: boolean;
}) {
  const histByPerson = new Map<string, number>();
  for (const h of data.historicals) {
    histByPerson.set(h.salesperson_id, h.amount);
  }
  const total = data.historicals.reduce((s, h) => s + h.amount, 0);
  const goal = data.companyGoal;
  const pct = goal > 0 ? total / goal : 0;
  const status: PaceStatus =
    goal > 0
      ? total / goal >= 1.05
        ? 'ahead'
        : total / goal < 0.95
          ? 'behind'
          : 'on-pace'
      : 'no-data';

  // Order by display_order, fall back to historical map order.
  const rows = data.salespeople
    .map((sp) => ({ id: sp.id, name: sp.name, amount: histByPerson.get(sp.id) ?? 0 }))
    .sort((a, b) => {
      const oa = data.salespeople.find((s) => s.id === a.id)?.display_order ?? 0;
      const ob = data.salespeople.find((s) => s.id === b.id)?.display_order ?? 0;
      return oa - ob;
    });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <DashboardHeader
        year={year}
        month={month}
        subline={<>Closed month &middot; stored as monthly totals only</>}
        showEntryButton={isCurrentMonth}
      />

      <YtdStrip ytd={ytd} />

      {/* Historical hero */}
      <section className="mt-3 rounded-card bg-bark p-6 text-cream sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
              Total for {monthLabel(year, month)}
            </p>
            <p className="mt-2 font-display text-6xl tracking-wider">
              {fmtUsd(total)}
            </p>
            <p className="mt-1 text-sm text-cream/80">
              of {fmtUsd(goal)} &middot; {fmtPct(pct)} of goal
            </p>
          </div>
          <span className={statusChipClass(status)}>{statusLabel(status)}</span>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
          By Salesperson
        </h2>
        <div className="mt-4 overflow-hidden rounded-card border-[3px] border-lime bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-edge/40 text-fg-2">
              <tr>
                <Th>Salesperson</Th>
                <Th align="right">Total</Th>
                <Th align="right">% of Month</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr
                  key={r.id}
                  className={idx % 2 === 0 ? 'bg-white' : 'bg-paper/40'}
                >
                  <Td className="font-headline font-bold">
                    <Link
                      href={`/sales/${r.id}?year=${year}&month=${month}`}
                      className="text-ink hover:text-orange hover:underline"
                    >
                      {nameById.get(r.id) ?? r.name}
                    </Link>
                  </Td>
                  <Td align="right">{fmtUsd(r.amount)}</Td>
                  <Td align="right">
                    {total > 0 ? fmtPct(r.amount / total) : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-paper-edge bg-paper-edge/30">
                <Td className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
                  Month Total
                </Td>
                <Td align="right" className="font-headline text-lg font-black text-ink">
                  {fmtUsd(total)}
                </Td>
                <Td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </main>
  );
}

// ----------------------------------------------------------------------------
// Shared bits
// ----------------------------------------------------------------------------

function DashboardHeader({
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
        <p className="bt-eyebrow">Dashboard 1</p>
        <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink">
          Sales PACE
        </h1>
        <p className="mt-3 text-fg-2">
          {monthLabel(year, month)} &mdash; {subline}
        </p>
      </div>
      <div className="flex flex-col items-stretch gap-3 sm:items-end">
        {showEntryButton && (
          <Link href="/sales/entry" className="bt-btn bt-btn-primary">
            Enter Today&apos;s Sales
          </Link>
        )}
        <MonthPicker year={year} month={month} />
      </div>
    </section>
  );
}

/**
 * A slim YTD progress bar that lives above the Company MTD card. Deliberately
 * understated so it doesn't compete with the big monthly number.
 */
function YtdStrip({ ytd }: { ytd: YearToDateData }) {
  if (!ytd.byMonth || ytd.byMonth.length === 0) return null;
  const pct =
    ytd.annualGoal && ytd.annualGoal > 0 ? ytd.ytdTotal / ytd.annualGoal : null;
  const barPct = pct != null ? Math.min(100, Math.max(0, pct * 100)) : null;

  return (
    <section className="mt-6 flex flex-col gap-3 rounded-full border-2 border-paper-edge bg-white/70 px-5 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-2">
          YTD {ytd.year}
        </span>
        <span className="font-headline text-lg font-black text-ink">
          {fmtUsd(ytd.ytdTotal)}
        </span>
        {ytd.annualGoal != null ? (
          <span className="text-xs text-fg-3">
            of {fmtUsd(ytd.annualGoal)} &middot; {pct != null ? fmtPct(pct) : '—'}
          </span>
        ) : (
          <span className="text-xs text-fg-3">no annual goal set</span>
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

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
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
