// ============================================================================
// Revenue Calendar — /hub/revenue-calendar
// ============================================================================
// What production revenue is on the board, by day. ServiceTitan shows what's
// scheduled; it won't tell you what a day is WORTH. This does, and it looks
// forward as far as the export goes.
//
// Open to everyone with Sales Arborist Hub access, like the rest of the hub —
// only the upload is restricted, since an import replaces the calendar for
// everyone. The usual refresh isn't a person at all: a scheduled job posts to
// /api/scheduled-revenue/import twice a day.
//
// THE THREE PILES, because the whole page rests on them:
//   FIRM   — on the calendar. Everything not on hold.
//   HOLD   — its own panel, never in a daily figure. On the board, not
//            committed; folding it in would inflate every day it touches.
//   PARKED — sold work sitting on ServiceTitan's far-future placeholder date.
//            Real money, no real date, so it gets a panel rather than a square.
// See lib/scheduled-revenue.ts for the full reasoning.
//
// No client JavaScript. Month, unit filter, and the open day all live in the
// URL, so a view can be pasted into Slack and land someone on exactly what you
// were looking at.
// ============================================================================

import Link from 'next/link';
import { requireHubAccess, canUploadScheduledRevenue } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { loadActiveScheduledRevenue } from '@/lib/scheduled-revenue-data';
import {
  UNIT_ORDER,
  UNIT_LABELS,
  UNIT_SHORT,
  STATUS_LABELS,
  PARKED_FROM,
  isBusinessUnit,
  horizon,
  pastDated,
  addDays,
  type BusinessUnit,
  type ScheduledJob,
  type ScheduledRevenueData,
} from '@/lib/scheduled-revenue';
import { RevenueCalendar, UnitSplitBar, compactUsd } from '@/components/RevenueCalendar';
import { fmtUsd, fmtUsdCents, fmtDateTime, monthLabel } from '@/lib/format';
import { businessToday, toIsoDate } from '@/lib/dates';
import { uploadScheduledRevenue } from './actions';

export const dynamic = 'force-dynamic';

type Search = Promise<{
  year?: string;
  month?: string;
  unit?: string;
  day?: string;
  saved?: string;
  error?: string;
}>;

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function Tile({
  label,
  value,
  note,
  tone = 'normal',
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'normal' | 'alarm' | 'muted';
}) {
  return (
    <div className="rounded-card border-[3px] border-paper-edge bg-white p-4">
      <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
        {label}
      </p>
      <p
        className={`mt-1 font-headline text-3xl font-black ${
          tone === 'alarm'
            ? 'text-status-behind'
            : tone === 'muted'
              ? 'text-fg-2'
              : 'text-ink'
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-fg-2">{note}</p>}
    </div>
  );
}

function JobTable({ jobs, showDate }: { jobs: ScheduledJob[]; showDate?: boolean }) {
  if (jobs.length === 0) {
    return <p className="text-sm text-fg-2">Nothing here.</p>;
  }
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b-2 border-paper-edge">
            {showDate && <Th>Date</Th>}
            <Th>Job</Th>
            <Th>Type</Th>
            <Th>Unit</Th>
            <Th>Crew</Th>
            <Th>City</Th>
            <Th right>Subtotal</Th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.jobNumber} className="border-b border-paper-edge/70">
              {showDate && (
                <Td>
                  <span className="whitespace-nowrap font-headline text-xs font-extrabold text-fg-2">
                    {j.date ? shortDate(j.date) : '—'}
                  </span>
                </Td>
              )}
              <Td>
                <span className="font-mono text-xs text-fg-2">{j.jobNumber}</span>
              </Td>
              <Td>{j.jobType || '—'}</Td>
              <Td>
                <span className="text-xs text-fg-2">{UNIT_SHORT[j.unit]}</span>
              </Td>
              <Td>
                <span className="text-xs text-fg-2">
                  {j.crew.length ? j.crew.join(', ') : 'Unassigned'}
                </span>
              </Td>
              <Td>
                <span className="text-xs text-fg-2">{j.city || '—'}</span>
              </Td>
              <Td right>
                <span className="font-headline font-black text-ink">
                  {j.subtotal > 0 ? fmtUsdCents(j.subtotal) : '—'}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`pb-2 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3 ${
        right ? 'text-right' : ''
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`py-2 pr-3 ${right ? 'pr-0 text-right' : ''}`}>{children}</td>;
}

/** 'Sep 3' — enough in a list that already names the month. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[m - 1]} ${d}${y !== new Date().getFullYear() ? ` '${String(y).slice(2)}` : ''}`;
}

/** 'Thursday, September 3, 2026'. */
function longDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${iso}T00:00:00Z`));
}

function signed(n: number): string {
  const s = fmtUsd(Math.abs(n));
  return n === 0 ? s : n > 0 ? `+${s}` : `−${s}`;
}

// ---------------------------------------------------------------------------

export default async function RevenueCalendarPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const user = await requireHubAccess('hub');
  const canUpload = canUploadScheduledRevenue(user.role);
  const sp = await searchParams;
  const active = await loadActiveScheduledRevenue();

  const today = toIsoDate(businessToday(new Date()));
  const [todayYear, todayMonth] = today.split('-').map(Number);

  const year = clampInt(sp.year, todayYear, 2020, 2099);
  const month = clampInt(sp.month, todayMonth, 1, 12);
  const unit: BusinessUnit | null = isBusinessUnit(sp.unit) ? sp.unit : null;
  const selectedDay =
    typeof sp.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null;

  // Every internal link rebuilds the whole query so a month change doesn't quietly
  // drop the unit filter (and vice versa).
  const href = (over: {
    year?: number;
    month?: number;
    unit?: BusinessUnit | null;
    day?: string | null;
  }) => {
    const q = new URLSearchParams();
    const y = over.year ?? year;
    const m = over.month ?? month;
    const u = over.unit === undefined ? unit : over.unit;
    const d = over.day === undefined ? selectedDay : over.day;
    q.set('year', String(y));
    q.set('month', String(m));
    if (u) q.set('unit', u);
    if (d) q.set('day', d);
    return `/hub/revenue-calendar?${q.toString()}`;
  };

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Revenue Calendar
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Revenue Calendar
      </h1>
      <p className="mt-4 max-w-2xl text-fg-2">
        What every scheduled day is worth, as far out as the board goes.
        ServiceTitan will show you what&apos;s scheduled &mdash; this shows you
        the money attached to it.
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/revenue-calendar" />
      </div>

      {sp.saved && (
        <p className="mb-6 rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm text-ink">
          {sp.saved}
        </p>
      )}
      {sp.error && (
        <p className="mb-6 rounded-2 border-2 border-status-behind bg-status-behind/10 px-4 py-3 text-sm text-ink">
          {sp.error}
        </p>
      )}

      {!active ? (
        <EmptyState canUpload={canUpload} />
      ) : (
        <Report
          data={active.data}
          uploadedAt={active.uploadedAt}
          today={today}
          year={year}
          month={month}
          unit={unit}
          selectedDay={selectedDay}
          href={href}
          canUpload={canUpload}
        />
      )}
    </main>
  );
}

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

function EmptyState({ canUpload }: { canUpload: boolean }) {
  return (
    <div className="rounded-card border-[3px] border-paper-edge bg-white p-8">
      <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
        Nothing imported yet
      </h2>
      <p className="mt-3 max-w-xl text-sm text-fg-2">
        The calendar fills in from the <strong>(Claude) Scheduled Revenue</strong>{' '}
        report in ServiceTitan &mdash; jobs with an appointment date, with their
        subtotals. Once a report lands, this page refreshes itself twice a day.
      </p>
      {canUpload && <UploadForm />}
    </div>
  );
}

function UploadForm() {
  return (
    <form
      action={uploadScheduledRevenue}
      className="mt-6 rounded-2 border-2 border-paper-edge bg-paper p-4"
    >
      <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
        Import a report by hand
      </p>
      <p className="mt-1 text-xs text-fg-2">
        Export <strong>(Claude) Scheduled Revenue</strong> from ServiceTitan and
        drop the .xlsx here. This replaces the calendar for everyone.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xlsm,.csv"
          required
          className="text-sm text-fg-2 file:mr-3 file:rounded-full file:border-0 file:bg-bark file:px-4 file:py-2 file:font-headline file:text-xs file:font-extrabold file:uppercase file:tracking-ribbon file:text-cream hover:file:bg-bark-deep"
        />
        <button
          type="submit"
          className="rounded-full bg-orange px-5 py-2 font-headline text-xs font-extrabold uppercase tracking-ribbon text-white transition-colors hover:bg-orange-hover"
        >
          Import
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

function Report({
  data,
  uploadedAt,
  today,
  year,
  month,
  unit,
  selectedDay,
  href,
  canUpload,
}: {
  data: ScheduledRevenueData;
  uploadedAt: string;
  today: string;
  year: number;
  month: number;
  unit: BusinessUnit | null;
  selectedDay: string | null;
  href: (over: {
    year?: number;
    month?: number;
    unit?: BusinessUnit | null;
    day?: string | null;
  }) => string;
  canUpload: boolean;
}) {
  const dayMap = new Map(data.days.map((d) => [d.date, d]));
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const thisMonth = data.months.find((m) => m.month === monthKey);

  const board = boardTotal(data, unit);
  const next30 = horizon(data, today, 30, unit);
  const next90 = horizon(data, today, 90, unit);
  const behind = pastDated(data, today);

  // Only offer filters for units the board actually has work in — an empty
  // "Municipal" chip is a dead end.
  const presentUnits = UNIT_ORDER.filter((u) =>
    data.jobs.some((j) => j.unit === u && !j.parked && j.status !== 'hold'),
  );

  const heldJobs = data.jobs
    .filter((j) => j.status === 'hold' && !j.parked)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const heldParked = data.jobs.filter((j) => j.status === 'hold' && j.parked).length;
  const parkedJobs = data.jobs
    .filter((j) => j.parked)
    .sort((a, b) => b.subtotal - a.subtotal);

  const dayJobs = selectedDay
    ? data.jobs
        .filter((j) => j.date === selectedDay && !j.parked)
        .sort((a, b) => b.subtotal - a.subtotal)
    : [];
  const dayTotals = selectedDay ? dayMap.get(selectedDay) : undefined;

  const s = data.sinceLast;

  return (
    <>
      {/* ---- headline figures ------------------------------------------- */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label={unit ? `On the board · ${UNIT_SHORT[unit]}` : 'On the board'}
          value={fmtUsd(board.revenue)}
          note={`${board.jobs} jobs · through ${data.meta.windowEnd ? shortDate(data.meta.windowEnd) : '—'}`}
        />
        <Tile
          label="Next 30 days"
          value={fmtUsd(next30.revenue)}
          note={`${next30.jobs} jobs`}
        />
        <Tile
          label="Next 90 days"
          value={fmtUsd(next90.revenue)}
          note={`${next90.jobs} jobs`}
        />
        <Tile
          label="Past-dated"
          value={fmtUsd(behind.revenue)}
          note={
            behind.jobs > 0
              ? `${behind.jobs} jobs still sitting on days that have gone by${unit ? ' (all units)' : ''}`
              : 'Nothing stale on the board'
          }
          tone={behind.revenue > 0 ? 'alarm' : 'muted'}
        />
      </section>

      {/* ---- what's deliberately NOT in those numbers -------------------- */}
      <section className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2 border-2 border-status-warn/60 bg-status-warn/[0.07] p-4">
          <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            On hold &mdash; not counted anywhere above
          </p>
          <p className="mt-1 font-headline text-2xl font-black text-ink">
            {fmtUsd(data.totals.holdRevenue)}{' '}
            <span className="text-sm font-extrabold text-fg-2">
              · {data.totals.holdJobs} jobs
            </span>
          </p>
          <p className="mt-1 text-xs text-fg-2">
            On the board but not committed. Kept out of every daily figure on
            purpose &mdash; the list is below.
          </p>
        </div>
        <div className="rounded-2 border-2 border-paper-edge bg-white p-4">
          <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Parked &mdash; sold, no real date
          </p>
          <p className="mt-1 font-headline text-2xl font-black text-ink">
            {fmtUsd(data.totals.parkedRevenue)}{' '}
            <span className="text-sm font-extrabold text-fg-2">
              · {data.totals.parkedJobs} jobs
            </span>
          </p>
          <p className="mt-1 text-xs text-fg-2">
            Sitting on ServiceTitan&apos;s {shortDate(PARKED_FROM)} placeholder.
            Real money, nowhere to put it on a calendar.
          </p>
        </div>
      </section>

      {/* ---- day-over-day ------------------------------------------------ */}
      {s && (
        <p className="mt-3 rounded-2 border-2 border-paper-edge bg-paper px-4 py-3 text-sm text-fg-2">
          <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Since{' '}
            {s.prevSourceDate
              ? shortDate(s.prevSourceDate)
              : s.prevUploadedAt
                ? shortDate(s.prevUploadedAt.slice(0, 10))
                : 'the last report'}
          </span>
          <br />
          <strong
            className={`font-headline font-black ${
              s.firmRevenueChange >= 0 ? 'text-status-ahead' : 'text-status-behind'
            }`}
          >
            {signed(s.firmRevenueChange)}
          </strong>{' '}
          on the board · {s.addedJobs} job{s.addedJobs === 1 ? '' : 's'} added (
          {fmtUsd(s.addedRevenue)}) · {s.removedJobs} came off (
          {fmtUsd(s.removedRevenue)})
        </p>
      )}

      {/* ---- unit filter ------------------------------------------------- */}
      {presentUnits.length > 1 && (
        <nav className="mt-8 flex flex-wrap items-center gap-2">
          <span className="mr-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Business unit
          </span>
          <Chip href={href({ unit: null })} active={unit === null}>
            All
          </Chip>
          {presentUnits.map((u) => (
            <Chip key={u} href={href({ unit: u })} active={unit === u}>
              {UNIT_LABELS[u]}
            </Chip>
          ))}
        </nav>
      )}

      {/* ---- month ------------------------------------------------------- */}
      <section className="mt-6 rounded-card border-[3px] border-paper-edge bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <MonthNav year={year} month={month} href={href} />
          <div className="text-right">
            <p className="font-headline text-3xl font-black text-ink">
              {fmtUsd(
                unit
                  ? (thisMonth?.byUnit[unit] ?? 0)
                  : (thisMonth?.firmRevenue ?? 0),
              )}
            </p>
            <p className="text-xs text-fg-2">
              {thisMonth
                ? `${unit ? (thisMonth.jobsByUnit?.[unit] ?? 0) : thisMonth.firmJobs} jobs across ${thisMonth.workingDays} working days`
                : 'Nothing scheduled this month'}
              {thisMonth && thisMonth.holdRevenue > 0 && (
                <>
                  {' '}
                  · <span className="text-status-warn">
                    {fmtUsd(thisMonth.holdRevenue)} held
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {thisMonth && !unit && (
          <UnitSplitBar byUnit={thisMonth.byUnit} className="mt-4" />
        )}

        <div className="mt-5">
          <RevenueCalendar
            year={year}
            month={month}
            days={dayMap}
            unit={unit}
            today={today}
            selectedDay={selectedDay}
            hrefForDay={(day) => href({ day })}
          />
        </div>

        <p className="mt-4 text-xs text-fg-3">
          Squares show scheduled revenue only &mdash; held work is a footnote,
          never part of the figure. Tap a day for the job list.
        </p>
      </section>

      {/* ---- the open day ------------------------------------------------ */}
      {selectedDay && (
        <section className="mt-4 rounded-card border-[3px] border-orange bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
              {longDate(selectedDay)}
            </h2>
            <Link
              href={href({ day: null })}
              className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3 hover:text-orange"
            >
              Close ✕
            </Link>
          </div>
          <p className="mt-1 font-headline text-2xl font-black text-ink">
            {fmtUsdCents(dayTotals?.firmRevenue ?? 0)}{' '}
            <span className="text-sm font-extrabold text-fg-2">
              · {dayTotals?.firmJobs ?? 0} jobs scheduled
            </span>
            {dayTotals && dayTotals.holdRevenue > 0 && (
              <span className="ml-2 text-sm font-extrabold text-status-warn">
                + {fmtUsdCents(dayTotals.holdRevenue)} held
              </span>
            )}
          </p>
          <div className="mt-4">
            <JobTable jobs={dayJobs} />
          </div>
        </section>
      )}

      {/* ---- the forward view -------------------------------------------- */}
      <section className="mt-4 rounded-card border-[3px] border-paper-edge bg-white p-4 sm:p-6">
        <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
          The outlook
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-fg-2">
          Every month with work on it, as far as the board goes. Bars are
          relative to the biggest month &mdash; tap one to open its calendar.
          {unit && <> Filtered to {UNIT_LABELS[unit]}.</>}
        </p>
        <MonthOutlook
          months={data.months}
          unit={unit}
          currentMonth={monthKey}
          today={today}
          href={href}
        />
      </section>

      {/* ---- the hold list ----------------------------------------------- */}
      <details className="mt-4 rounded-card border-[3px] border-status-warn/60 bg-white p-4 sm:p-6">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="font-headline text-xl font-black uppercase text-bark-deep">
            On hold &mdash; {heldJobs.length} jobs, {fmtUsd(heldSum(heldJobs))}
          </span>
          <span className="ml-2 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange">
            show ▾
          </span>
          <p className="mt-2 max-w-2xl text-sm text-fg-2">
            Dated work sitting at <strong>{STATUS_LABELS.hold}</strong>. None of
            it is in the calendar figures. Chase it and it becomes real revenue
            on the day it&apos;s already sitting on.
            {heldParked > 0 && (
              <>
                {' '}
                A further {heldParked} held {heldParked === 1 ? 'job is' : 'jobs are'}{' '}
                parked with no date &mdash; those are in the parked list below.
              </>
            )}
          </p>
        </summary>
        <div className="mt-4">
          <JobTable jobs={heldJobs} showDate />
        </div>
      </details>

      {/* ---- the parked list --------------------------------------------- */}
      <details className="mt-4 rounded-card border-[3px] border-paper-edge bg-white p-4 sm:p-6">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="font-headline text-xl font-black uppercase text-bark-deep">
            Parked &mdash; {parkedJobs.length} jobs,{' '}
            {fmtUsd(data.totals.parkedRevenue)}
          </span>
          <span className="ml-2 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange">
            show ▾
          </span>
          <p className="mt-2 max-w-2xl text-sm text-fg-2">
            Sold work parked on {shortDate(PARKED_FROM)} because it has no real
            date yet. Biggest first &mdash; every one of these is a day on the
            calendar waiting to happen.
          </p>
        </summary>
        <div className="mt-4">
          <JobTable jobs={parkedJobs} />
        </div>
      </details>

      {/* ---- provenance --------------------------------------------------- */}
      <section className="mt-8 rounded-card border-[3px] border-paper-edge bg-paper p-4 sm:p-6">
        <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
          Where this comes from
        </p>
        <p className="mt-2 text-sm text-fg-2">
          Last updated <strong>{fmtDateTime(uploadedAt)}</strong>
          {data.meta.sourceDate && <> · report dated {shortDate(data.meta.sourceDate)}</>}
          {data.meta.uploadedBy && <> · by {data.meta.uploadedBy}</>}.{' '}
          {data.totals.allJobs} jobs read, worth{' '}
          {fmtUsd(data.totals.allRevenue)} in total &mdash;{' '}
          {compactUsd(data.totals.firmRevenue)} scheduled,{' '}
          {compactUsd(data.totals.holdRevenue)} held,{' '}
          {compactUsd(data.totals.parkedRevenue)} parked.
          {data.totals.zeroDollarJobs > 0 && (
            <>
              {' '}
              {data.totals.zeroDollarJobs} carry no dollars (sign posting, clam
              pick-ups and the like) and are counted as jobs, not revenue.
            </>
          )}
        </p>
        <p className="mt-2 text-xs text-fg-3">
          Refreshes automatically twice a day, at 6:30am and 7:30pm Central.
        </p>
        {canUpload && <UploadForm />}
      </section>
    </>
  );
}

/**
 * Every month on the board, as bars.
 *
 * This is the "how far out are we booked" view — the calendar answers "what is
 * next Tuesday worth", and this answers "what does spring look like". Months
 * with nothing in them are skipped rather than drawn empty: the board is lumpy
 * by nature and a row of zeros just pushes the real months off the screen.
 */
function MonthOutlook({
  months,
  unit,
  currentMonth,
  today,
  href,
}: {
  months: ScheduledRevenueData['months'];
  unit: BusinessUnit | null;
  currentMonth: string;
  today: string;
  href: (over: { year?: number; month?: number; day?: string | null }) => string;
}) {
  const thisMonthKey = today.slice(0, 7);
  const rows = months
    .map((m) => ({
      month: m.month,
      revenue: unit ? (m.byUnit[unit] ?? 0) : m.firmRevenue,
      jobs: unit ? (m.jobsByUnit?.[unit] ?? 0) : m.firmJobs,
      hold: m.holdRevenue,
    }))
    .filter((r) => r.revenue > 0 || r.hold > 0);

  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-fg-2">Nothing on the board yet.</p>;
  }

  const peak = Math.max(...rows.map((r) => r.revenue), 1);

  return (
    <ul className="mt-5 space-y-1.5">
      {rows.map((r) => {
        const [y, m] = r.month.split('-').map(Number);
        const isCurrent = r.month === currentMonth;
        const isPast = r.month < thisMonthKey;
        return (
          <li key={r.month}>
            <Link
              href={href({ year: y, month: m, day: null })}
              className={`flex items-center gap-3 rounded-2 border-2 px-3 py-2 transition-colors ${
                isCurrent
                  ? 'border-orange bg-orange/[0.06]'
                  : 'border-transparent hover:border-paper-edge hover:bg-paper/60'
              } ${isPast ? 'opacity-60' : ''}`}
            >
              <span className="w-24 shrink-0 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
                {monthLabel(y, m)}
              </span>
              <span className="h-4 flex-1 overflow-hidden rounded-full bg-paper">
                <span
                  className={`block h-full rounded-full ${
                    isPast ? 'bg-sand' : 'bg-green'
                  }`}
                  style={{ width: `${Math.max(1.5, (r.revenue / peak) * 100)}%` }}
                />
              </span>
              <span className="w-24 shrink-0 text-right font-headline text-sm font-black text-ink">
                {compactUsd(r.revenue)}
              </span>
              <span className="hidden w-20 shrink-0 text-right text-xs text-fg-3 sm:block">
                {r.jobs} {r.jobs === 1 ? 'job' : 'jobs'}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function heldSum(jobs: ScheduledJob[]): number {
  return Math.round(jobs.reduce((s, j) => s + j.subtotal, 0) * 100) / 100;
}

/** Firm revenue and job count across the whole board, optionally for one unit. */
function boardTotal(
  data: ScheduledRevenueData,
  unit: BusinessUnit | null,
): { revenue: number; jobs: number } {
  if (!unit) {
    return { revenue: data.totals.firmRevenue, jobs: data.totals.firmJobs };
  }
  let revenue = 0;
  let jobs = 0;
  for (const j of data.jobs) {
    if (j.unit !== unit || j.parked || j.status === 'hold') continue;
    revenue += j.subtotal;
    jobs++;
  }
  return { revenue: Math.round(revenue * 100) / 100, jobs };
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border-2 px-3 py-1 font-headline text-[11px] font-extrabold uppercase tracking-ribbon transition-colors ${
        active
          ? 'border-ink bg-ink text-cream'
          : 'border-paper-edge bg-white text-fg-2 hover:border-orange hover:text-orange'
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * Prev / label / next. Deliberately not the shared MonthPicker: that one builds
 * its own `?year=&month=` and would drop the unit filter and the open day every
 * time you changed month.
 */
function MonthNav({
  year,
  month,
  href,
}: {
  year: number;
  month: number;
  href: (over: { year?: number; month?: number; day?: string | null }) => string;
}) {
  const prev = new Date(Date.UTC(year, month - 2, 1));
  const next = new Date(Date.UTC(year, month, 1));
  const arrow =
    'inline-flex h-8 w-8 items-center justify-center rounded-full text-cream/70 transition-colors hover:bg-lime hover:text-ink';

  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-bark px-2 py-1.5 text-cream shadow-sh-1">
      <Link
        href={href({
          year: prev.getUTCFullYear(),
          month: prev.getUTCMonth() + 1,
          day: null,
        })}
        aria-label="Previous month"
        className={arrow}
      >
        ←
      </Link>
      <span className="min-w-[9rem] px-1 text-center font-headline text-xs font-extrabold uppercase tracking-ribbon">
        {monthLabel(year, month)}
      </span>
      <Link
        href={href({
          year: next.getUTCFullYear(),
          month: next.getUTCMonth() + 1,
          day: null,
        })}
        aria-label="Next month"
        className={arrow}
      >
        →
      </Link>
    </div>
  );
}
