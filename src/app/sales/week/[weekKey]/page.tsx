import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import {
  workingWeeksInMonth,
  fromIsoDate,
  toIsoDate,
  type IsoDate,
} from '@/lib/dates';
import { monthLabel } from '@/lib/format';
import { WeekEditForm } from './WeekEditForm';
import type { Salesperson } from '@/types';

export const dynamic = 'force-dynamic';

type Params = Promise<{ weekKey: string }>;
type Search = Promise<{ year?: string; month?: string; saved?: string; deleted?: string }>;

function parseIntInRange(raw: string | undefined, min: number, max: number): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

/**
 * Given a Monday and a day offset (e.g. -7 or +7), figure out what
 * /sales/week/<key>?year=&month= URL we should jump to. We pick the month
 * that contains the most of the target week's calendar days — that way,
 * crossing a month boundary lands you in the right monthly context. If
 * the target month has no actual working week with that key (all-holiday
 * weeks etc.), we fall back to the next most common month, then give up.
 */
function adjacentWeekHref(
  baseMonday: Date,
  offsetDays: number,
  holidays: Set<IsoDate>,
): string | null {
  const target = new Date(baseMonday);
  target.setDate(baseMonday.getDate() + offsetDays);
  const targetMondayIso = toIsoDate(target);

  const counts = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(target);
    d.setDate(target.getDate() + i);
    const k = `${d.getFullYear()}__${d.getMonth() + 1}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const ordered = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [k] of ordered) {
    const [y, m] = k.split('__').map(Number);
    const weeks = workingWeeksInMonth(y, m, holidays);
    if (weeks.some((w) => w.weekKey === targetMondayIso)) {
      return `/sales/week/${targetMondayIso}?year=${y}&month=${m}`;
    }
  }
  return null;
}

export default async function SalesWeekEditPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  const { weekKey } = await params;
  if (!isValidIsoDate(weekKey)) notFound();

  const sp = await searchParams;
  const now = new Date();
  const year =
    parseIntInRange(sp.year, 2000, 2100) ?? Number(weekKey.slice(0, 4));
  const month =
    parseIntInRange(sp.month, 1, 12) ?? Number(weekKey.slice(5, 7));

  // Load holidays + active salespeople; use holidays to compute the week's
  // working days within (year, month) so the table only shows the same days
  // the dashboard's week row aggregated.
  const supabase = await serverClient();
  const [salespeopleRes, holidayRes] = await Promise.all([
    supabase
      .from('salespeople')
      .select('id, name, display_order, is_active')
      .eq('is_active', true)
      .order('display_order'),
    supabase
      .from('holidays')
      .select('holiday_date, observed')
      .eq('observed', true),
  ]);

  const salespeople = (salespeopleRes.data ?? []) as Salesperson[];
  const holidays = new Set<IsoDate>(
    (holidayRes.data ?? []).map((h) => h.holiday_date as IsoDate),
  );

  const weeks = workingWeeksInMonth(year, month, holidays);
  const week = weeks.find((w) => w.weekKey === weekKey);
  if (!week) notFound();

  // Show every calendar day in the week that's in the month — weekends too —
  // so off-hours sales can be viewed and edited.
  const daysInWeek = week.daysInMonth;
  const workingDaySet = new Set(week.workingDays);
  const firstDay = daysInWeek[0];
  const lastDay = daysInWeek[daysInWeek.length - 1];
  const entriesRes = await supabase
    .from('sales_entries')
    .select('entry_date, salesperson_id, amount')
    .gte('entry_date', firstDay)
    .lte('entry_date', lastDay);

  const daySet = new Set(daysInWeek);
  const initialAmounts: Record<string, number> = {};
  for (const row of entriesRes.data ?? []) {
    const d = row.entry_date as IsoDate;
    if (!daySet.has(d)) continue;
    initialAmounts[`${d}__${row.salesperson_id}`] = Number(row.amount);
  }

  const firstDate = fromIsoDate(firstDay);
  const lastDate = fromIsoDate(lastDay);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const rangeLabel =
    firstDate.getMonth() === lastDate.getMonth()
      ? `${fmt(firstDate)}–${lastDate.getDate()}`
      : `${fmt(firstDate)} – ${fmt(lastDate)}`;

  const baseMonday = fromIsoDate(week.weekKey);
  const prevHref = adjacentWeekHref(baseMonday, -7, holidays);
  const nextHref = adjacentWeekHref(baseMonday, +7, holidays);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <p className="bt-eyebrow">Sales · Week Detail</p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
          Week of {rangeLabel}
        </h1>
        <div className="flex items-center gap-2">
          <WeekNavButton href={prevHref} label="‹ Prev week" />
          <WeekNavButton href={nextHref} label="Next week ›" />
        </div>
      </div>
      <p className="mt-3 text-fg-2">
        {monthLabel(year, month)} &mdash; {week.workingDays.length} working day
        {week.workingDays.length === 1 ? '' : 's'}. Weekend rows are shown too —
        enter any off-hours sales there.{' '}
        <Link
          href={`/sales?year=${year}&month=${month}`}
          className="text-orange underline decoration-orange/40 underline-offset-2 hover:decoration-orange"
        >
          Back to dashboard
        </Link>
      </p>

      <div className="mt-8">
        <WeekEditForm
          weekKey={week.weekKey}
          days={daysInWeek}
          workingDaySet={Array.from(workingDaySet)}
          salespeople={salespeople}
          initialAmounts={initialAmounts}
          year={year}
          month={month}
          canEdit={user.role === 'admin'}
        />
      </div>
    </main>
  );
}

function WeekNavButton({
  href,
  label,
}: {
  href: string | null;
  label: string;
}) {
  const classes =
    'inline-flex items-center rounded-full border-2 border-paper-edge bg-white px-3 py-1.5 font-headline text-xs font-extrabold uppercase tracking-ribbon text-ink transition-colors';
  if (!href) {
    return (
      <span
        aria-disabled="true"
        className={`${classes} cursor-not-allowed opacity-40`}
      >
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className={`${classes} hover:border-orange hover:text-orange`}>
      {label}
    </Link>
  );
}
