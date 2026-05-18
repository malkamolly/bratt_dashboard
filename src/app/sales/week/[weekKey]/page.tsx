import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import {
  workingWeeksInMonth,
  fromIsoDate,
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

  const firstDay = week.workingDays[0];
  const lastDay = week.workingDays[week.workingDays.length - 1];
  const entriesRes = await supabase
    .from('sales_entries')
    .select('entry_date, salesperson_id, amount')
    .gte('entry_date', firstDay)
    .lte('entry_date', lastDay);

  const workingDaysSet = new Set(week.workingDays);
  const initialAmounts: Record<string, number> = {};
  for (const row of entriesRes.data ?? []) {
    const d = row.entry_date as IsoDate;
    if (!workingDaysSet.has(d)) continue;
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <p className="bt-eyebrow">Sales · Week Detail</p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Week of {rangeLabel}
      </h1>
      <p className="mt-3 text-fg-2">
        {monthLabel(year, month)} &mdash; {week.workingDays.length} working day
        {week.workingDays.length === 1 ? '' : 's'}.{' '}
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
          workingDays={week.workingDays}
          salespeople={salespeople}
          initialAmounts={initialAmounts}
          year={year}
          month={month}
        />
      </div>
    </main>
  );
}
