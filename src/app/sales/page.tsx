import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { loadSalesMonth } from '@/lib/sales-data';
import {
  calculateSalesPace,
  paceStatus,
  type PaceStatus,
} from '@/lib/calculations';
import { fmtUsd, fmtPct, monthLabel } from '@/lib/format';
import { workingWeeksInMonth, toIsoDate, type IsoDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

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

export default async function SalesDashboardPage() {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  const data = await loadSalesMonth();
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
  const nameById = new Map(data.salespeople.map((sp) => [sp.id, sp.name]));

  // Week grouping uses the real holiday set so Memorial Day etc. don't count
  // as working days.
  const weeks = workingWeeksInMonth(
    data.ctx.year,
    data.ctx.month,
    data.holidays,
  );

  // Sum entries by week.
  type WeekRow = {
    label: string;
    workingDaysTotal: number;
    workingDaysComplete: number;
    total: number;
    dailyAvg: number;
    expected: number;
    isPast: boolean;
  };
  const entriesByDate = new Map<IsoDate, number>();
  for (const e of data.entries) {
    entriesByDate.set(
      e.entry_date,
      (entriesByDate.get(e.entry_date) ?? 0) + e.amount,
    );
  }
  const todayIso = toIsoDate(data.ctx.asOf);
  const weeklyGoal =
    c.budgeted_days > 0 ? c.goal / c.budgeted_days : 0; // per-day allocation

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
    return {
      label: w.label,
      workingDaysTotal,
      workingDaysComplete,
      total,
      dailyAvg,
      expected,
      isPast: workingDaysComplete >= workingDaysTotal,
    };
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="bt-eyebrow">Dashboard 1</p>
          <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink">
            Sales PACE
          </h1>
          <p className="mt-3 text-fg-2">
            {monthLabel(data.ctx.year, data.ctx.month)} &mdash;{' '}
            <strong className="text-ink">
              Day {c.budgeted_days_been_through} of {c.budgeted_days}
            </strong>{' '}
            ({c.budgeted_days_remaining} working day
            {c.budgeted_days_remaining === 1 ? '' : 's'} left)
          </p>
        </div>
        <Link href="/sales/entry" className="bt-btn bt-btn-primary">
          Enter Today&apos;s Sales
        </Link>
      </section>

      {/* Company hero — MTD + 3 stats all on one row */}
      <section className="mt-8 rounded-card bg-bark p-6 text-cream sm:p-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-4 sm:items-stretch">
          <div className="flex flex-col justify-between border-b border-bark-deep pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6">
            <div>
              <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
                Company MTD
              </p>
              <p className="mt-2 font-display text-5xl tracking-wider sm:text-5xl">
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
                  w.workingDaysComplete === 0
                    ? 'no-data'
                    : w.expected <= 0
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

      {/* Per-salesperson table */}
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
  children: React.ReactNode;
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
