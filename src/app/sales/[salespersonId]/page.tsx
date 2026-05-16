import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import {
  monthRange,
  workingDaysInMonth,
  fromIsoDate,
  toIsoDate,
  type IsoDate,
} from '@/lib/dates';
import { fmtUsd, monthLabel } from '@/lib/format';
import { MonthPicker } from './MonthPicker';

export const dynamic = 'force-dynamic';

type Params = Promise<{ salespersonId: string }>;
type Search = Promise<{ year?: string; month?: string }>;

function parseIntInRange(raw: string | undefined, min: number, max: number): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

export default async function SalespersonDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  const { salespersonId } = await params;
  const sp = await searchParams;
  const now = new Date();
  const year = parseIntInRange(sp.year, 2000, 2100) ?? now.getFullYear();
  const month = parseIntInRange(sp.month, 1, 12) ?? now.getMonth() + 1;

  const supabase = await serverClient();
  const { start, end } = monthRange(year, month);

  const [personRes, entriesRes, holidayRes, goalsRes] = await Promise.all([
    supabase
      .from('salespeople')
      .select('id, name, is_active')
      .eq('id', salespersonId)
      .maybeSingle(),
    supabase
      .from('sales_entries')
      .select('entry_date, amount, created_by, updated_at')
      .eq('salesperson_id', salespersonId)
      .gte('entry_date', start)
      .lte('entry_date', end)
      .order('entry_date', { ascending: true }),
    supabase
      .from('holidays')
      .select('holiday_date, observed')
      .eq('observed', true),
    supabase
      .from('sales_monthly_settings')
      .select('per_person_goals')
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
  ]);

  if (!personRes.data) notFound();
  const person = personRes.data;

  const entries = entriesRes.data ?? [];
  const holidays = new Set<IsoDate>(
    (holidayRes.data ?? []).map((h) => h.holiday_date as IsoDate),
  );
  const totalWorkingDays = workingDaysInMonth(year, month, holidays);

  const mtd = entries.reduce((s, e) => s + Number(e.amount), 0);
  const daysEntered = entries.length;
  const dailyAvg = daysEntered > 0 ? mtd / daysEntered : 0;

  const rawGoals = goalsRes.data?.per_person_goals as
    | Record<string, number | string>
    | null
    | undefined;
  const goalRaw = rawGoals?.[salespersonId];
  const goal = goalRaw != null ? Number(goalRaw) : null;
  const pctToGoal = goal && goal > 0 ? mtd / goal : null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/sales" className="hover:underline">
          Sales PACE
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Salesperson
      </p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-5xl uppercase tracking-wider text-ink">
          {person.name}
        </h1>
        <MonthPicker year={year} month={month} />
      </div>
      <p className="mt-2 text-fg-2">
        {monthLabel(year, month)} &middot;{' '}
        <strong className="text-ink">{daysEntered}</strong> day
        {daysEntered === 1 ? '' : 's'} entered of {totalWorkingDays} working days
      </p>

      {/* Summary cards */}
      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <SummaryCard label="Month-To-Date" value={fmtUsd(mtd)} accent="orange" />
        <SummaryCard
          label="Daily Average"
          value={fmtUsd(dailyAvg)}
          hint={daysEntered > 0 ? `Across ${daysEntered} day${daysEntered === 1 ? '' : 's'}` : undefined}
        />
        <SummaryCard
          label="Monthly Goal"
          value={goal != null ? fmtUsd(goal) : 'TBD'}
        />
        <SummaryCard
          label="% of Goal"
          value={
            pctToGoal != null
              ? new Intl.NumberFormat('en-US', {
                  style: 'percent',
                  maximumFractionDigits: 0,
                }).format(pctToGoal)
              : '—'
          }
        />
      </section>

      {/* Daily table */}
      <section className="mt-8">
        <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
          Daily Entries
        </h2>

        {entries.length === 0 ? (
          <div className="mt-4 rounded-card border-2 border-dashed border-paper-edge bg-white/60 px-6 py-8 text-center text-fg-2">
            No entries yet for {monthLabel(year, month)}.{' '}
            <Link
              href={`/sales/entry?date=${start}`}
              className="font-bold text-orange hover:underline"
            >
              Add some →
            </Link>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-card border-[3px] border-lime bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-edge/40 text-fg-2">
                <tr>
                  <th className="px-4 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon">
                    Date
                  </th>
                  <th className="px-4 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon">
                    Day
                  </th>
                  <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">
                    Entered By
                  </th>
                  <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e, idx) => {
                  const d = fromIsoDate(e.entry_date as IsoDate);
                  return (
                    <tr
                      key={e.entry_date as string}
                      className={idx % 2 === 0 ? 'bg-white' : 'bg-paper/40'}
                    >
                      <td className="px-4 py-3 font-headline font-bold text-ink">
                        {d.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-fg-2">
                        {d.toLocaleDateString('en-US', { weekday: 'long' })}
                      </td>
                      <td className="px-4 py-3 text-right font-headline font-bold">
                        {fmtUsd(Number(e.amount))}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-fg-3">
                        {e.created_by ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/sales/entry?date=${e.entry_date}`}
                          className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange hover:underline"
                        >
                          Edit →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-paper-edge bg-paper-edge/30">
                  <td
                    colSpan={2}
                    className="px-4 py-3 font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2"
                  >
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-headline text-lg font-black text-ink">
                    {fmtUsd(mtd)}
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'orange';
}) {
  return (
    <div
      className={
        accent === 'orange'
          ? 'rounded-card border-[3px] border-orange bg-white p-4'
          : 'rounded-card border-[3px] border-lime bg-white p-4'
      }
    >
      <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
        {label}
      </p>
      <p className="mt-1 font-headline text-2xl font-black text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-fg-3">{hint}</p>}
    </div>
  );
}
