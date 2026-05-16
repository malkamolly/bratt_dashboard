import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import {
  monthRange,
  workingDaysInMonth,
  fromIsoDate,
  type IsoDate,
} from '@/lib/dates';
import { fmtUsd, fmtPct, monthLabel } from '@/lib/format';
import { MonthPicker } from '@/components/MonthPicker';

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

  const [
    personRes,
    entriesRes,
    holidayRes,
    goalsRes,
    monthHistoricalRes,
    yearHistoricalsRes,
  ] = await Promise.all([
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
    supabase
      .from('sales_monthly_historicals')
      .select('amount, source_note')
      .eq('salesperson_id', salespersonId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
    supabase
      .from('sales_monthly_historicals')
      .select('month, amount')
      .eq('salesperson_id', salespersonId)
      .eq('year', year)
      .order('month', { ascending: true }),
  ]);

  if (!personRes.data) notFound();
  const person = personRes.data;

  const entries = entriesRes.data ?? [];
  const holidays = new Set<IsoDate>(
    (holidayRes.data ?? []).map((h) => h.holiday_date as IsoDate),
  );
  const totalWorkingDays = workingDaysInMonth(year, month, holidays);

  const monthHistorical = monthHistoricalRes.data
    ? Number(monthHistoricalRes.data.amount)
    : null;
  const isHistoricalMonth = monthHistorical != null;

  const dailySum = entries.reduce((s, e) => s + Number(e.amount), 0);
  const mtd = isHistoricalMonth ? monthHistorical! : dailySum;
  const daysEntered = entries.length;
  const dailyAvg = daysEntered > 0 ? dailySum / daysEntered : 0;

  const rawGoals = goalsRes.data?.per_person_goals as
    | Record<string, number | string>
    | null
    | undefined;
  const goalRaw = rawGoals?.[salespersonId];
  const goal = goalRaw != null ? Number(goalRaw) : null;
  const pctToGoal = goal && goal > 0 ? mtd / goal : null;

  const priorMonths = (yearHistoricalsRes.data ?? []).map((h) => ({
    month: h.month as number,
    total: Number(h.amount),
  }));
  const ytdFromHistoricals = priorMonths.reduce((s, h) => s + h.total, 0);

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
        {monthLabel(year, month)}
        {isHistoricalMonth ? (
          <>
            {' '}&middot;{' '}
            <span className="font-bold text-ink">Closed month</span>
            <span className="ml-1 text-fg-3">(stored as monthly total)</span>
          </>
        ) : (
          <>
            {' '}&middot;{' '}
            <strong className="text-ink">{daysEntered}</strong> day
            {daysEntered === 1 ? '' : 's'} entered of {totalWorkingDays} working days
          </>
        )}
      </p>

      {/* Summary cards */}
      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <SummaryCard
          label={isHistoricalMonth ? 'Month Total' : 'Month-To-Date'}
          value={fmtUsd(mtd)}
          accent="orange"
        />
        <SummaryCard
          label="Daily Average"
          value={fmtUsd(dailyAvg)}
          hint={
            isHistoricalMonth
              ? 'Not available (no daily detail)'
              : daysEntered > 0
                ? `Across ${daysEntered} day${daysEntered === 1 ? '' : 's'}`
                : undefined
          }
        />
        <SummaryCard
          label="Monthly Goal"
          value={goal != null ? fmtUsd(goal) : 'TBD'}
        />
        <SummaryCard
          label="% of Goal"
          value={pctToGoal != null ? fmtPct(pctToGoal) : '—'}
        />
      </section>

      {/* Daily table OR closed-month notice */}
      {isHistoricalMonth ? (
        <section className="mt-8 rounded-card border-2 border-dashed border-paper-edge bg-white/60 p-6 text-fg-2">
          <p className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
            No daily breakdown
          </p>
          <p className="mt-2 text-sm">
            {monthLabel(year, month)} was loaded as a monthly total rather than
            day-by-day. The number above is the source of truth for this month.
            {monthHistoricalRes.data?.source_note && (
              <>
                {' '}
                <span className="text-fg-3">
                  ({monthHistoricalRes.data.source_note})
                </span>
              </>
            )}
          </p>
        </section>
      ) : (
        <DailyEntriesSection
          year={year}
          month={month}
          start={start}
          entries={entries}
          total={dailySum}
        />
      )}

      {/* Prior months in this year */}
      {priorMonths.length > 0 && (
        <section className="mt-10">
          <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
            Prior Months ({year})
          </h2>
          <div className="mt-4 overflow-hidden rounded-card border-[3px] border-lime bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-edge/40 text-fg-2">
                <tr>
                  <th className="px-4 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon">
                    Month
                  </th>
                  <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">
                    Total
                  </th>
                  <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon" />
                </tr>
              </thead>
              <tbody>
                {priorMonths.map((p, idx) => (
                  <tr
                    key={p.month}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-paper/40'}
                  >
                    <td className="px-4 py-3 font-headline font-bold text-ink">
                      {monthLabel(year, p.month)}
                    </td>
                    <td className="px-4 py-3 text-right font-headline font-bold">
                      {fmtUsd(p.total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/sales/${salespersonId}?year=${year}&month=${p.month}`}
                        className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-paper-edge bg-paper-edge/30">
                  <td className="px-4 py-3 font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
                    Prior-Month Total
                  </td>
                  <td className="px-4 py-3 text-right font-headline text-lg font-black text-ink">
                    {fmtUsd(ytdFromHistoricals)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function DailyEntriesSection({
  year,
  month,
  start,
  entries,
  total,
}: {
  year: number;
  month: number;
  start: string;
  entries: Array<{ entry_date: string; amount: number | string; created_by: string | null }>;
  total: number;
}) {
  return (
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
                  {fmtUsd(total)}
                </td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
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
