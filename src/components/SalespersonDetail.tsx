// ============================================================================
// Shared salesperson detail view
// ============================================================================
// Renders summary cards, daily-entries table, prior-months table, and any
// arborist info (photo + ISA cert badge) for a single salesperson + month.
// Used by /sales/[salespersonId] (Pace) and /hub/arborists/[slug] (Hub) so
// the two pages stay visually identical.
// ============================================================================

import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import {
  monthRange,
  workingDaysInMonth,
  workingWeeksInMonth,
  fromIsoDate,
  type IsoDate,
  type WorkingWeek,
} from '@/lib/dates';
import { fmtUsd, fmtPct, monthLabel } from '@/lib/format';
import { MonthPicker } from '@/components/MonthPicker';

export type ArboristInfo = {
  photo: string | null;
  certified: boolean;
  isa_number: string | null;
  manager: boolean;
};

type Props = {
  salespersonId: string;
  year: number;
  month: number;
  breadcrumb: React.ReactNode;
  /** Page-relative base path used for MonthPicker + "View →" links.
   *  e.g. "/sales/<id>" or "/hub/arborists/<slug>" (no query string). */
  basePath: string;
  arborist?: ArboristInfo | null;
};

export async function SalespersonDetail({
  salespersonId,
  year,
  month,
  breadcrumb,
  basePath,
  arborist,
}: Props) {
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
  const weeks = workingWeeksInMonth(year, month, holidays);

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
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      {breadcrumb}

      <section className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        {arborist?.photo ? (
          <Image
            src={arborist.photo}
            alt=""
            width={176}
            height={176}
            className="aspect-square w-40 shrink-0 rounded-3xl object-cover sm:w-44"
          />
        ) : arborist ? (
          <div className="flex aspect-square w-40 shrink-0 items-center justify-center rounded-3xl bg-bark text-cream font-display text-6xl uppercase sm:w-44">
            {person.name.slice(0, 1)}
          </div>
        ) : null}
        <div className="flex-1 text-center sm:text-left">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h1 className="font-display text-5xl uppercase tracking-wider text-ink">
              {person.name}
            </h1>
            <MonthPicker year={year} month={month} basePath={basePath} />
          </div>
          {arborist && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {arborist.manager ? (
                <span className="rounded-full bg-bark px-3 py-1 font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream">
                  Sales Manager
                </span>
              ) : arborist.certified ? (
                <>
                  <span className="rounded-full bg-green/15 px-3 py-1 font-headline text-xs font-extrabold uppercase tracking-ribbon text-green-dark">
                    ISA Certified
                  </span>
                  {arborist.isa_number && (
                    <span className="font-headline text-sm font-bold text-fg-3">
                      {arborist.isa_number}
                    </span>
                  )}
                </>
              ) : (
                <span className="rounded-full bg-orange/15 px-3 py-1 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange-press">
                  Certification in progress
                </span>
              )}
            </div>
          )}
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
        </div>
      </section>

      {/* Summary cards: YTD then this-month breakdown */}
      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <SummaryCard
          label={`${year} YTD`}
          value={fmtUsd(ytdFromHistoricals + (isHistoricalMonth ? 0 : dailySum))}
        />
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
              ? 'No daily detail'
              : daysEntered > 0
                ? `${daysEntered} day${daysEntered === 1 ? '' : 's'}`
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
          weeks={weeks}
        />
      )}

      {/* Prior months in this year */}
      {priorMonths.length > 0 && (
        <section className="mt-10">
          <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
            Prior Months ({year})
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {priorMonths.map((p) => (
              <Link
                key={p.month}
                href={`${basePath}?year=${year}&month=${p.month}`}
                className="block rounded-2 border-[3px] border-lime bg-white px-3 py-2.5 transition-colors hover:!border-orange"
              >
                <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
                  {monthLabel(year, p.month)}
                </p>
                <p className="mt-0.5 font-headline text-lg font-black text-ink lg:text-xl">
                  {fmtUsd(p.total)}
                </p>
              </Link>
            ))}
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
  weeks,
}: {
  year: number;
  month: number;
  start: string;
  entries: Array<{
    entry_date: string;
    amount: number | string;
    created_by: string | null;
  }>;
  weeks: WorkingWeek[];
}) {
  const entryByDate = new Map<string, (typeof entries)[number]>();
  for (const e of entries) entryByDate.set(e.entry_date as string, e);

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
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {weeks.map((w) => {
            const weekTotal = w.workingDays.reduce((s, d) => {
              const e = entryByDate.get(d);
              return s + (e ? Number(e.amount) : 0);
            }, 0);
            return (
              <div
                key={w.weekKey}
                className="overflow-hidden rounded-2 border-[3px] border-lime bg-white"
              >
                <header className="border-b-2 border-paper-edge bg-paper-edge/40 px-3 py-2">
                  <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
                    Week of {w.label}
                  </p>
                </header>
                <ul className="divide-y divide-paper-edge/50">
                  {w.workingDays.map((iso) => {
                    const d = fromIsoDate(iso as IsoDate);
                    const dow = d.toLocaleDateString('en-US', {
                      weekday: 'short',
                    });
                    const e = entryByDate.get(iso);
                    return (
                      <li key={iso}>
                        <Link
                          href={`/sales/entry?date=${iso}`}
                          className="flex items-baseline justify-between px-3 py-1.5 text-sm hover:bg-paper-edge/30"
                        >
                          <span className="font-headline font-bold text-ink">
                            <span className="mr-1.5 text-fg-3">{dow}</span>
                            {d.getDate()}
                          </span>
                          <span
                            className={
                              e
                                ? 'font-headline font-bold text-ink'
                                : 'text-fg-3'
                            }
                          >
                            {e ? fmtUsd(Number(e.amount)) : '—'}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <footer className="flex items-baseline justify-between border-t-2 border-paper-edge bg-paper-edge/30 px-3 py-2">
                  <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
                    Total
                  </span>
                  <span className="font-headline font-black text-ink">
                    {fmtUsd(weekTotal)}
                  </span>
                </footer>
              </div>
            );
          })}
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
          ? 'rounded-2 border-[3px] border-orange bg-white px-3 py-2.5'
          : 'rounded-2 border-[3px] border-lime bg-white px-3 py-2.5'
      }
    >
      <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-2">
        {label}
      </p>
      <p className="mt-0.5 font-headline text-lg font-black text-ink lg:text-xl">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-fg-3">{hint}</p>}
    </div>
  );
}
