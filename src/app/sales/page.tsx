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

      {/* Company hero */}
      <section className="mt-8 rounded-card bg-bark p-6 text-cream sm:p-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
              Company Month-To-Date
            </p>
            <p className="mt-2 font-display text-5xl tracking-wider sm:text-6xl">
              {fmtUsd(c.mtd_total)}
            </p>
            <p className="mt-1 text-sm text-cream/80">
              of {fmtUsd(c.goal)} goal &middot; {fmtPct(c.pct_to_goal)} of plan
            </p>
          </div>
          <span className={statusChipClass(companyStatus)}>
            {statusLabel(companyStatus)}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                return (
                  <tr
                    key={p.salesperson_id}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-paper/40'}
                  >
                    <Td className="font-headline font-bold text-ink">
                      {nameById.get(p.salesperson_id) ?? p.salesperson_id}
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
    <div className="rounded-2 bg-bark-deep/40 p-4">
      <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-lime">
        {label}
      </p>
      <p className="mt-1 font-headline text-2xl font-black">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-cream/70">{hint}</p>}
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
