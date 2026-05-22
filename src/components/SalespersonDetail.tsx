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
import {
  ADDONS_SALESPERSON_NAME,
  loadAddonAttributionsForRange,
} from '@/lib/sales-data';

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
  /** When true, day rows are clickable to edit that single (date, person)
   *  cell. When false, day rows render as plain (non-link) list items. */
  canEdit?: boolean;
};

export async function SalespersonDetail({
  salespersonId,
  year,
  month,
  breadcrumb,
  basePath,
  arborist,
  canEdit = false,
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
  const isAddons = person.name === ADDONS_SALESPERSON_NAME;

  // For Add-Ons, also load the per-crew-member attributions for the month.
  const addonsData = isAddons
    ? await loadAddonAttributionsForRange(start as IsoDate, end as IsoDate)
    : null;

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

      {/* Daily table OR closed-month notice OR Add-Ons breakdown */}
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
      ) : isAddons && addonsData ? (
        <AddonsBreakdownSection
          year={year}
          month={month}
          attributions={addonsData.attributions}
          crewMembers={addonsData.crewMembers}
          canEdit={canEdit}
        />
      ) : (
        <DailyEntriesSection
          year={year}
          month={month}
          start={start}
          entries={entries}
          weeks={weeks}
          salespersonId={salespersonId}
          basePath={basePath}
          canEdit={canEdit}
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
  salespersonId,
  basePath,
  canEdit,
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
  salespersonId: string;
  basePath: string;
  canEdit: boolean;
}) {
  const entryByDate = new Map<string, (typeof entries)[number]>();
  for (const e of entries) entryByDate.set(e.entry_date as string, e);

  // Where to send the user back after they save/cancel/delete from the
  // single-cell edit page. Keeps month-context intact.
  const returnTo = `${basePath}?year=${year}&month=${month}`;
  const cellHref = (iso: string) =>
    `/sales/entry/cell?date=${iso}&salespersonId=${encodeURIComponent(salespersonId)}&returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <section className="mt-8">
      <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
        Daily Entries
      </h2>

      {entries.length === 0 ? (
        <div className="mt-4 rounded-card border-2 border-dashed border-paper-edge bg-white/60 px-6 py-8 text-center text-fg-2">
          No entries yet for {monthLabel(year, month)}.{' '}
          {canEdit && (
            <Link
              href={cellHref(start)}
              className="font-bold text-orange hover:underline"
            >
              Add some →
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {weeks.map((w) => {
            const workingDaySet = new Set(w.workingDays);
            const weekTotal = w.daysInMonth.reduce((s, d) => {
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
                  {w.daysInMonth.map((iso) => {
                    const d = fromIsoDate(iso as IsoDate);
                    const dow = d.toLocaleDateString('en-US', {
                      weekday: 'short',
                    });
                    const e = entryByDate.get(iso);
                    const isOffHours = !workingDaySet.has(iso);
                    const rowClass = `flex items-baseline justify-between px-3 py-1.5 text-sm ${
                      isOffHours ? 'bg-paper/30' : ''
                    } ${canEdit ? 'hover:bg-paper-edge/30' : ''}`;
                    const dayLabel = (
                      <>
                        <span
                          className={
                            isOffHours
                              ? 'font-headline font-bold text-fg-2'
                              : 'font-headline font-bold text-ink'
                          }
                        >
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
                      </>
                    );
                    return (
                      <li key={iso}>
                        {canEdit ? (
                          <Link href={cellHref(iso)} className={rowClass}>
                            {dayLabel}
                          </Link>
                        ) : (
                          <div className={rowClass}>{dayLabel}</div>
                        )}
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

function AddonsBreakdownSection({
  year,
  month,
  attributions,
  crewMembers,
  canEdit,
}: {
  year: number;
  month: number;
  attributions: Array<{
    id: string;
    entry_date: string;
    crew_member_id: string;
    amount: number;
    note: string | null;
  }>;
  crewMembers: Array<{ id: string; name: string }>;
  canEdit: boolean;
}) {
  const nameById = new Map(crewMembers.map((c) => [c.id, c.name]));

  // Per-crew-member roll-up for the whole month.
  const totalsByMember = new Map<string, number>();
  for (const a of attributions) {
    totalsByMember.set(
      a.crew_member_id,
      (totalsByMember.get(a.crew_member_id) ?? 0) + a.amount,
    );
  }
  const memberRows = Array.from(totalsByMember.entries())
    .map(([id, total]) => ({
      id,
      name: nameById.get(id) ?? '(unknown)',
      total,
    }))
    .sort((a, b) => b.total - a.total);
  const monthTotal = memberRows.reduce((s, r) => s + r.total, 0);

  // Group attributions by day for the day-by-day list.
  const byDay = new Map<string, typeof attributions>();
  for (const a of attributions) {
    const arr = byDay.get(a.entry_date) ?? [];
    arr.push(a);
    byDay.set(a.entry_date, arr);
  }
  const dayKeys = Array.from(byDay.keys()).sort();

  return (
    <>
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
            By Crew Member
          </h2>
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            {monthLabel(year, month)}
          </p>
        </div>

        {memberRows.length === 0 ? (
          <div className="mt-4 rounded-card border-2 border-dashed border-paper-edge bg-white/60 px-6 py-8 text-center text-fg-2">
            No Add-Ons attributions yet for {monthLabel(year, month)}.{' '}
            {canEdit && (
              <Link
                href="/sales/entry"
                className="font-bold text-orange hover:underline"
              >
                Add some →
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-card border-[3px] border-lime bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-paper-edge/40 text-fg-2">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon">
                    Crew member
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">
                    Month total
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">
                    % of Add-Ons
                  </th>
                </tr>
              </thead>
              <tbody>
                {memberRows.map((r, idx) => (
                  <tr
                    key={r.id}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-paper/40'}
                  >
                    <td className="px-4 py-3 font-headline font-bold text-ink">
                      {r.name}
                    </td>
                    <td className="px-4 py-3 text-right font-headline font-bold text-ink">
                      {fmtUsd(r.total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {monthTotal > 0 ? fmtPct(r.total / monthTotal) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-paper-edge bg-paper-edge/30">
                  <td className="px-4 py-3 font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
                    Month total
                  </td>
                  <td className="px-4 py-3 text-right font-headline text-lg font-black text-ink">
                    {fmtUsd(monthTotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {dayKeys.length > 0 && (
        <section className="mt-10">
          <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
            Day by Day
          </h2>
          <div className="mt-4 space-y-3">
            {dayKeys.map((iso) => {
              const rows = byDay.get(iso) ?? [];
              const dayTotal = rows.reduce((s, r) => s + r.amount, 0);
              const d = fromIsoDate(iso as IsoDate);
              const label = d.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
              const editHref = `/sales/entry?date=${iso}`;
              return (
                <div
                  key={iso}
                  className="overflow-hidden rounded-2 border-[3px] border-lime bg-white"
                >
                  <header className="flex items-baseline justify-between border-b-2 border-paper-edge bg-paper-edge/40 px-4 py-2">
                    <p className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
                      {label}
                    </p>
                    <div className="flex items-baseline gap-3">
                      <span className="font-headline font-black text-ink">
                        {fmtUsd(dayTotal)}
                      </span>
                      {canEdit && (
                        <Link
                          href={editHref}
                          className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange hover:underline"
                        >
                          Edit →
                        </Link>
                      )}
                    </div>
                  </header>
                  <ul className="divide-y divide-paper-edge/50">
                    {rows.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-baseline justify-between px-4 py-2 text-sm"
                      >
                        <div className="flex flex-col">
                          <span className="font-headline font-bold text-ink">
                            {nameById.get(r.crew_member_id) ?? '(unknown)'}
                          </span>
                          {r.note && (
                            <span className="text-xs text-fg-3">{r.note}</span>
                          )}
                        </div>
                        <span className="font-headline font-bold text-ink">
                          {fmtUsd(r.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
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
