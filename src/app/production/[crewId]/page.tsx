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

type Params = Promise<{ crewId: string }>;
type Search = Promise<{ year?: string; month?: string }>;

function parseIntInRange(raw: string | undefined, min: number, max: number) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export default async function CrewDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  const { crewId } = await params;
  const sp = await searchParams;
  const now = new Date();
  const year = parseIntInRange(sp.year, 2000, 2100) ?? now.getFullYear();
  const month = parseIntInRange(sp.month, 1, 12) ?? now.getMonth() + 1;

  const supabase = await serverClient();
  const { start, end } = monthRange(year, month);

  const [
    crewRes,
    entriesRes,
    holidayRes,
    budgetRes,
    monthHistoricalRes,
    yearHistoricalsRes,
  ] = await Promise.all([
    supabase
      .from('crews')
      .select('id, name, kind, is_active')
      .eq('id', crewId)
      .maybeSingle(),
    supabase
      .from('production_entries')
      .select('entry_date, jobs, revenue, created_by, updated_at')
      .eq('crew_id', crewId)
      .gte('entry_date', start)
      .lte('entry_date', end)
      .order('entry_date', { ascending: true }),
    supabase
      .from('holidays')
      .select('holiday_date, observed')
      .eq('observed', true),
    supabase
      .from('crew_monthly_budgets')
      .select('budget_revenue')
      .eq('crew_id', crewId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
    supabase
      .from('production_monthly_historicals')
      .select('jobs, revenue, source_note')
      .eq('crew_id', crewId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
    supabase
      .from('production_monthly_historicals')
      .select('month, jobs, revenue')
      .eq('crew_id', crewId)
      .eq('year', year)
      .order('month', { ascending: true }),
  ]);

  if (!crewRes.data) notFound();
  const crew = crewRes.data;

  const entries = entriesRes.data ?? [];
  const holidays = new Set<IsoDate>(
    (holidayRes.data ?? []).map((h) => h.holiday_date as IsoDate),
  );
  const totalWorkingDays = workingDaysInMonth(year, month, holidays);
  const budget = budgetRes.data?.budget_revenue
    ? Number(budgetRes.data.budget_revenue)
    : null;

  const monthHist = monthHistoricalRes.data
    ? {
        jobs: Number(monthHistoricalRes.data.jobs),
        revenue: Number(monthHistoricalRes.data.revenue),
        sourceNote: monthHistoricalRes.data.source_note as string | null,
      }
    : null;
  const isHistorical = monthHist != null;

  const dailyJobs = entries.reduce((s, e) => s + Number(e.jobs), 0);
  const dailyRevenue = entries.reduce((s, e) => s + Number(e.revenue), 0);
  const mtdJobs = isHistorical ? monthHist!.jobs : dailyJobs;
  const mtdRevenue = isHistorical ? monthHist!.revenue : dailyRevenue;
  const daysEntered = entries.length;
  const avgJob = mtdJobs > 0 ? mtdRevenue / mtdJobs : 0;
  const pctToBudget = budget != null && budget > 0 ? mtdRevenue / budget : null;

  const priorMonths = (yearHistoricalsRes.data ?? []).map((h) => ({
    month: h.month as number,
    jobs: Number(h.jobs),
    revenue: Number(h.revenue),
  }));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/production" className="hover:underline">
          Production PACE
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        {crew.kind === 'phc' ? 'PHC Crew' : 'Crew'}
      </p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-5xl uppercase tracking-wider text-ink">
          {crew.name}
        </h1>
        <MonthPicker year={year} month={month} />
      </div>
      <p className="mt-2 text-fg-2">
        {monthLabel(year, month)}
        {isHistorical ? (
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

      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label={isHistorical ? 'Revenue' : 'Revenue MTD'}
          value={fmtUsd(mtdRevenue)}
          accent="orange"
        />
        <SummaryCard
          label="Jobs"
          value={String(mtdJobs)}
          hint={mtdJobs > 0 ? `Avg ${fmtUsd(avgJob)}/job` : undefined}
        />
        <SummaryCard
          label="Budget"
          value={budget != null ? fmtUsd(budget) : 'TBD'}
        />
        <SummaryCard
          label="% of Budget"
          value={pctToBudget != null ? fmtPct(pctToBudget) : '—'}
        />
      </section>

      {isHistorical ? (
        <section className="mt-8 rounded-card border-2 border-dashed border-paper-edge bg-white/60 p-6 text-fg-2">
          <p className="font-headline text-sm font-extrabold uppercase tracking-ribbon">
            No daily breakdown
          </p>
          <p className="mt-2 text-sm">
            {monthLabel(year, month)} was loaded as a monthly total rather than
            day-by-day. The numbers above are the source of truth for this month.
            {monthHist?.sourceNote && (
              <>
                {' '}
                <span className="text-fg-3">({monthHist.sourceNote})</span>
              </>
            )}
          </p>
        </section>
      ) : entries.length === 0 ? (
        <div className="mt-8 rounded-card border-2 border-dashed border-paper-edge bg-white/60 px-6 py-8 text-center text-fg-2">
          No entries yet for {monthLabel(year, month)}.{' '}
          <Link
            href={`/production/entry?date=${start}`}
            className="font-bold text-orange hover:underline"
          >
            Add some →
          </Link>
        </div>
      ) : (
        <section className="mt-8">
          <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
            Daily Entries
          </h2>
          <div className="mt-4 overflow-hidden rounded-card border-[3px] border-lime bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-edge/40 text-fg-2">
                <tr>
                  <th className="px-4 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon">Date</th>
                  <th className="px-4 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon">Day</th>
                  <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">Jobs</th>
                  <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">Revenue</th>
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
                        {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-fg-2">
                        {d.toLocaleDateString('en-US', { weekday: 'long' })}
                      </td>
                      <td className="px-4 py-3 text-right font-headline font-bold">
                        {Number(e.jobs)}
                      </td>
                      <td className="px-4 py-3 text-right font-headline font-bold">
                        {fmtUsd(Number(e.revenue))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/production/entry?date=${e.entry_date}`}
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
                  <td colSpan={2} className="px-4 py-3 font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-headline font-black text-ink">
                    {dailyJobs}
                  </td>
                  <td className="px-4 py-3 text-right font-headline text-lg font-black text-ink">
                    {fmtUsd(dailyRevenue)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {priorMonths.length > 0 && (
        <section className="mt-10">
          <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
            Prior Months ({year})
          </h2>
          <div className="mt-4 overflow-hidden rounded-card border-[3px] border-lime bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-edge/40 text-fg-2">
                <tr>
                  <th className="px-4 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon">Month</th>
                  <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">Jobs</th>
                  <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">Revenue</th>
                  <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon" />
                </tr>
              </thead>
              <tbody>
                {priorMonths.map((p, idx) => (
                  <tr key={p.month} className={idx % 2 === 0 ? 'bg-white' : 'bg-paper/40'}>
                    <td className="px-4 py-3 font-headline font-bold text-ink">
                      {monthLabel(year, p.month)}
                    </td>
                    <td className="px-4 py-3 text-right font-headline font-bold">{p.jobs}</td>
                    <td className="px-4 py-3 text-right font-headline font-bold">{fmtUsd(p.revenue)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/production/${crewId}?year=${year}&month=${p.month}`}
                        className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
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
