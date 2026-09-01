// ============================================================================
// Revenue Calendar — /production/revenue-calendar
// ============================================================================
// What production revenue is on the board, by day. ServiceTitan shows what's
// scheduled; it won't tell you what a day is WORTH. This does, and it looks
// forward as far as the board goes.
//
// Lives in the production/office audience (requireHubAccess('pace') — admin,
// office, sales manager), because it's a scheduling tool. Only the upload is
// restricted further, since an import replaces the calendar for everyone. The
// usual refresh isn't a person at all: a scheduled job posts to
// /api/scheduled-revenue/import twice a day.
//
// THE THREE PILES, because the whole page rests on them:
//   FIRM   — on the calendar, split into tree work and PHC.
//   HOLD   — its own view, never in a daily figure. Mostly jobs waiting on a
//            customer's approval, so it is kept deliberately quiet on the
//            calendar: the number is there to be looked up, not to be the
//            first thing anyone sees and asks about.
//   PARKED — sold work sitting on ServiceTitan's far-future placeholder date.
//            Real money, no real date, so it gets a view rather than a square.
// See lib/scheduled-revenue.ts for the full reasoning.
//
// No client JavaScript. The view, month, unit filter, open day and text filter
// all live in the URL, so any of it can be pasted into Slack and land someone
// on exactly what you were looking at — and the filter boxes are plain GET
// forms rather than a search-as-you-type field that needs a bundle.
// ============================================================================

import Link from 'next/link';
import { requireHubAccess, canUploadScheduledRevenue } from '@/lib/auth';
import { loadActiveScheduledRevenue } from '@/lib/scheduled-revenue-data';
import {
  UNIT_ORDER,
  UNIT_LABELS,
  UNIT_SHORT,
  PARKED_FROM,
  isBusinessUnit,
  jobMatches,
  treeTotal,
  phcTotal,
  horizon,
  pastDated,
  type BusinessUnit,
  type ScheduledJob,
  type ScheduledRevenueData,
} from '@/lib/scheduled-revenue';
import { RevenueCalendar, UnitSplitBar, compactUsd } from '@/components/RevenueCalendar';
import { fmtUsd, fmtUsdCents, fmtDateTime, monthLabel } from '@/lib/format';
import { businessToday, toIsoDate } from '@/lib/dates';
import { uploadScheduledRevenue } from './actions';

export const dynamic = 'force-dynamic';

type View = 'calendar' | 'hold' | 'parked';

type Search = Promise<{
  view?: string;
  year?: string;
  month?: string;
  unit?: string;
  day?: string;
  q?: string;
  saved?: string;
  error?: string;
}>;

/** Everything the page needs to rebuild its own URL. */
type Nav = {
  view: View;
  year: number;
  month: number;
  unit: BusinessUnit | null;
  day: string | null;
  q: string;
};

/**
 * Every internal link rebuilds the WHOLE query, so changing month doesn't
 * quietly drop the unit filter and switching views doesn't drop the month.
 */
function linkTo(nav: Nav, over: Partial<Nav>): string {
  const n = { ...nav, ...over };
  const q = new URLSearchParams();
  if (n.view !== 'calendar') q.set('view', n.view);
  q.set('year', String(n.year));
  q.set('month', String(n.month));
  if (n.unit) q.set('unit', n.unit);
  if (n.day) q.set('day', n.day);
  if (n.q) q.set('q', n.q);
  return `/production/revenue-calendar?${q.toString()}`;
}

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

/**
 * The filter box. One text input over everything someone might type — a job
 * number, a job type, a salesperson, a crew member, a city, a zip.
 *
 * A plain GET form, so it needs no JavaScript. The hidden inputs carry the rest
 * of the page state through the submit; without them, filtering would bounce
 * you back to this month's calendar every time.
 */
function FilterBox({
  nav,
  placeholder,
  showing,
  total,
}: {
  nav: Nav;
  placeholder: string;
  showing: number;
  total: number;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <form method="get" action="/production/revenue-calendar" className="flex gap-2">
        {nav.view !== 'calendar' && <input type="hidden" name="view" value={nav.view} />}
        <input type="hidden" name="year" value={nav.year} />
        <input type="hidden" name="month" value={nav.month} />
        {nav.unit && <input type="hidden" name="unit" value={nav.unit} />}
        {nav.day && <input type="hidden" name="day" value={nav.day} />}
        <input
          type="search"
          name="q"
          defaultValue={nav.q}
          placeholder={placeholder}
          aria-label="Filter this list"
          className="w-56 rounded-full border-2 border-paper-edge bg-white px-4 py-1.5 text-sm text-ink placeholder:text-fg-3 focus:border-orange focus:outline-none sm:w-72"
        />
        <button
          type="submit"
          className="rounded-full bg-bark px-4 py-1.5 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-cream transition-colors hover:bg-bark-deep"
        >
          Filter
        </button>
      </form>
      {nav.q && (
        <>
          <span className="text-xs text-fg-2">
            {showing} of {total} shown
          </span>
          <Link
            href={linkTo(nav, { q: '' })}
            className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-orange hover:underline"
          >
            Clear
          </Link>
        </>
      )}
    </div>
  );
}

function JobTable({ jobs, showDate }: { jobs: ScheduledJob[]; showDate?: boolean }) {
  if (jobs.length === 0) {
    return <p className="mt-4 text-sm text-fg-2">Nothing matches.</p>;
  }
  return (
    <div className="-mx-2 mt-4 overflow-x-auto px-2">
      <table className="w-full min-w-[46rem] text-left text-sm">
        <thead>
          <tr className="border-b-2 border-paper-edge">
            {showDate && <Th>Sched.</Th>}
            <Th>Job</Th>
            <Th>Type</Th>
            <Th>Unit</Th>
            <Th>Sold by</Th>
            <Th>Sold on</Th>
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
                <span className="whitespace-nowrap text-xs text-fg-2">
                  {j.soldBy || '—'}
                </span>
              </Td>
              <Td>
                <span className="whitespace-nowrap text-xs text-fg-2">
                  {j.soldOn ? shortDate(j.soldOn) : '—'}
                </span>
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

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** 'Sep 3', or "Sep 3 '27" once it leaves this year. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const thisYear = new Date().getFullYear();
  return `${MONTH_ABBR[m - 1]} ${d}${y !== thisYear ? ` '${String(y).slice(2)}` : ''}`;
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

function sumOf(jobs: ScheduledJob[]): number {
  return Math.round(jobs.reduce((s, j) => s + j.subtotal, 0) * 100) / 100;
}

// ---------------------------------------------------------------------------

export default async function RevenueCalendarPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  // Production / office audience: admin, office, sales manager.
  const user = await requireHubAccess('pace');
  const canUpload = canUploadScheduledRevenue(user.role);
  const sp = await searchParams;
  const active = await loadActiveScheduledRevenue();

  const today = toIsoDate(businessToday(new Date()));
  const [todayYear, todayMonth] = today.split('-').map(Number);

  const nav: Nav = {
    view:
      sp.view === 'hold' ? 'hold' : sp.view === 'parked' ? 'parked' : 'calendar',
    year: clampInt(sp.year, todayYear, 2020, 2099),
    month: clampInt(sp.month, todayMonth, 1, 12),
    unit: isBusinessUnit(sp.unit) ? sp.unit : null,
    day:
      typeof sp.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null,
    // Capped so a pasted essay can't become the page's heading.
    q: typeof sp.q === 'string' ? sp.q.slice(0, 80) : '',
  };

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/production" className="hover:underline">
          Production
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Revenue Calendar
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Revenue Calendar
      </h1>
      <p className="mt-4 max-w-2xl text-fg-2">
        What every scheduled day is worth, as far out as the board goes.
        ServiceTitan will show you what&apos;s scheduled &mdash; this shows the
        money attached to it, tree work and PHC kept apart.
      </p>

      {sp.saved && (
        <p className="mt-6 rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm text-ink">
          {sp.saved}
        </p>
      )}
      {sp.error && (
        <p className="mt-6 rounded-2 border-2 border-status-behind bg-status-behind/10 px-4 py-3 text-sm text-ink">
          {sp.error}
        </p>
      )}

      {!active ? (
        <div className="mt-8">
          <EmptyState canUpload={canUpload} />
        </div>
      ) : (
        <Report
          data={active.data}
          uploadedAt={active.uploadedAt}
          today={today}
          nav={nav}
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
        The calendar fills in from the <strong>Scheduled Revenue</strong> reports
        in ServiceTitan &mdash; jobs with an appointment date, with their
        subtotals. It takes two: one for the next 365 days, and one for the
        far-future parked work, because ServiceTitan won&apos;t schedule a report
        that looks out further than a year.
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
        Import reports by hand
      </p>
      <p className="mt-1 text-xs text-fg-2">
        Export the Scheduled Revenue reports from ServiceTitan and drop them here
        &mdash; <strong>pick both files at once</strong> (the 365-day one and the
        parked one). This replaces the calendar for everyone.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xlsm,.csv"
          multiple
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
  nav,
  canUpload,
}: {
  data: ScheduledRevenueData;
  uploadedAt: string;
  today: string;
  nav: Nav;
  canUpload: boolean;
}) {
  // The three piles stay mutually exclusive — parked wins over hold, which is
  // what makes firm + hold + parked reconcile with the export's grand total. A
  // held job with no real date belongs in Parked, where someone looking for it
  // would go; the hold view says how many of those there are.
  const heldJobs = data.jobs
    .filter((j) => j.status === 'hold' && !j.parked)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const heldAndParked = data.jobs.filter(
    (j) => j.status === 'hold' && j.parked,
  ).length;
  const parkedJobs = data.jobs
    .filter((j) => j.parked)
    .sort((a, b) => b.subtotal - a.subtotal);

  return (
    <>
      <nav className="mt-8 mb-6 flex flex-wrap gap-x-3 gap-y-2 border-b-2 border-paper-edge pb-4 sm:gap-x-6">
        <ViewTab nav={nav} to="calendar" label="Calendar" />
        <ViewTab nav={nav} to="hold" label={`On hold (${heldJobs.length})`} />
        <ViewTab nav={nav} to="parked" label={`Parked (${parkedJobs.length})`} />
      </nav>

      {nav.view === 'hold' && (
        <ListView
          nav={nav}
          jobs={heldJobs}
          title="On hold"
          blurb={`Jobs sitting at status Hold — most of them waiting on a customer’s approval. None of this is in any calendar figure. Sorted by the day each one is currently sitting on.${
            heldAndParked > 0
              ? ` A further ${heldAndParked} held ${heldAndParked === 1 ? 'job has' : 'jobs have'} no date at all — those are in Parked.`
              : ''
          }`}
          showDate
          placeholder="Job #, type, salesperson, city…"
        />
      )}

      {nav.view === 'parked' && (
        <ListView
          nav={nav}
          jobs={parkedJobs}
          title="Parked"
          blurb={`Sold work parked on ${shortDate(PARKED_FROM)} because it has no real date yet. Biggest first — every one of these is a day on the calendar waiting to happen.`}
          placeholder="Job #, type, salesperson, city…"
        />
      )}

      {nav.view === 'calendar' && (
        <CalendarView
          data={data}
          uploadedAt={uploadedAt}
          today={today}
          nav={nav}
          canUpload={canUpload}
          heldCount={heldJobs.length}
          parkedCount={parkedJobs.length}
        />
      )}
    </>
  );
}

function ViewTab({ nav, to, label }: { nav: Nav; to: View; label: string }) {
  const isActive = nav.view === to;
  return (
    <Link
      // Switching views drops the text filter and the open day: they belong to
      // the list you were looking at, and carrying them across would land you on
      // an empty screen with no obvious reason why.
      href={linkTo(nav, { view: to, q: '', day: null })}
      className={`font-headline text-[10px] font-extrabold uppercase tracking-wider transition-colors sm:text-xs sm:tracking-ribbon ${
        isActive ? 'text-orange' : 'text-fg-2 hover:text-orange-press'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      {label}
    </Link>
  );
}

/** The hold and parked views: one heading, one filter, one table. */
function ListView({
  nav,
  jobs,
  title,
  blurb,
  showDate,
  placeholder,
}: {
  nav: Nav;
  jobs: ScheduledJob[];
  title: string;
  blurb: string;
  showDate?: boolean;
  placeholder: string;
}) {
  const shown = jobs.filter((j) => jobMatches(j, nav.q));
  return (
    <section className="rounded-card border-[3px] border-paper-edge bg-white p-4 sm:p-6">
      <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
        {title} &mdash; {shown.length} {shown.length === 1 ? 'job' : 'jobs'},{' '}
        {fmtUsd(sumOf(shown))}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-fg-2">{blurb}</p>
      <FilterBox
        nav={nav}
        placeholder={placeholder}
        showing={shown.length}
        total={jobs.length}
      />
      <JobTable jobs={shown} showDate={showDate} />
    </section>
  );
}

function CalendarView({
  data,
  uploadedAt,
  today,
  nav,
  canUpload,
  heldCount,
  parkedCount,
}: {
  data: ScheduledRevenueData;
  uploadedAt: string;
  today: string;
  nav: Nav;
  canUpload: boolean;
  heldCount: number;
  parkedCount: number;
}) {
  const { year, month, unit, day: selectedDay } = nav;
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

  const allDayJobs = selectedDay
    ? data.jobs
        .filter((j) => j.date === selectedDay && !j.parked)
        .sort((a, b) => b.subtotal - a.subtotal)
    : [];
  const dayJobs = allDayJobs.filter((j) => jobMatches(j, nav.q));
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

      {/* ---- parked, then hold ------------------------------------------
          Parked leads because it's the one that turns into schedulable work.
          Hold is deliberately the quiet one: it's mostly jobs waiting on a
          customer's approval, and a loud number invites a question the number
          can't answer on its own. It's here to be looked up, not noticed. */}
      <section className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2 border-2 border-paper-edge bg-white p-4">
          <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Parked &mdash; sold, no real date
          </p>
          <p className="mt-1 font-headline text-2xl font-black text-ink">
            {fmtUsd(data.totals.parkedRevenue)}{' '}
            <span className="text-sm font-extrabold text-fg-2">
              · {parkedCount} jobs
            </span>
          </p>
          <p className="mt-1 text-xs text-fg-2">
            Sitting on ServiceTitan&apos;s {shortDate(PARKED_FROM)} placeholder.
            Real money, nowhere to put it on a calendar yet.{' '}
            <Link
              href={linkTo(nav, { view: 'parked', q: '', day: null })}
              className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange hover:underline"
            >
              See the list &rarr;
            </Link>
          </p>
        </div>
        <div className="rounded-2 border border-paper-edge bg-paper/60 p-4">
          <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            On hold &mdash; not counted anywhere
          </p>
          <p className="mt-1 font-headline text-lg font-extrabold text-fg-2">
            {fmtUsd(data.totals.holdRevenue)}{' '}
            <span className="text-xs font-extrabold text-fg-3">
              · {heldCount} jobs
            </span>
          </p>
          <p className="mt-1 text-xs text-fg-3">
            Mostly waiting on a customer&apos;s approval. Kept out of every figure
            on this page on purpose.{' '}
            <Link
              href={linkTo(nav, { view: 'hold', q: '', day: null })}
              className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-2 hover:text-orange hover:underline"
            >
              See the list &rarr;
            </Link>
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
          <Chip href={linkTo(nav, { unit: null })} active={unit === null}>
            All
          </Chip>
          {presentUnits.map((u) => (
            <Chip key={u} href={linkTo(nav, { unit: u })} active={unit === u}>
              {UNIT_LABELS[u]}
            </Chip>
          ))}
        </nav>
      )}

      {/* ---- month ------------------------------------------------------- */}
      <section className="mt-6 rounded-card border-[3px] border-paper-edge bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <MonthNav nav={nav} />
          <div className="text-right">
            <p className="font-headline text-3xl font-black text-ink">
              {fmtUsd(
                unit ? (thisMonth?.byUnit[unit] ?? 0) : (thisMonth?.firmRevenue ?? 0),
              )}
            </p>
            <p className="text-xs text-fg-2">
              {thisMonth ? (
                <>
                  {unit ? (thisMonth.jobsByUnit?.[unit] ?? 0) : thisMonth.firmJobs} jobs
                  across {thisMonth.workingDays} working days
                  {!unit && (
                    <>
                      {' '}
                      · {fmtUsd(treeTotal(thisMonth.byUnit))} tree ·{' '}
                      {fmtUsd(phcTotal(thisMonth.byUnit))} PHC
                    </>
                  )}
                </>
              ) : (
                'Nothing scheduled this month'
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
            hrefForDay={(d) => linkTo(nav, { day: d, q: '' })}
          />
        </div>

        <p className="mt-4 text-xs text-fg-3">
          Each square: tree work on top, PHC underneath, both added up below the
          rule. Held work is a footnote, never part of the figure. Tap a day for
          the job list.
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
              href={linkTo(nav, { day: null, q: '' })}
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
          </p>
          <p className="mt-1 text-xs text-fg-2">
            {fmtUsdCents(treeTotal(dayTotals?.byUnit))} tree work ·{' '}
            {fmtUsdCents(phcTotal(dayTotals?.byUnit))} PHC
            {dayTotals && dayTotals.holdRevenue > 0 && (
              <span className="text-fg-3">
                {' '}
                · {fmtUsdCents(dayTotals.holdRevenue)} held, not counted
              </span>
            )}
          </p>
          <FilterBox
            nav={nav}
            placeholder="Job #, type, salesperson, crew…"
            showing={dayJobs.length}
            total={allDayJobs.length}
          />
          <JobTable jobs={dayJobs} />
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
          nav={nav}
        />
      </section>

      {/* ---- provenance --------------------------------------------------- */}
      <section className="mt-8 rounded-card border-[3px] border-paper-edge bg-paper p-4 sm:p-6">
        <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
          Where this comes from
        </p>
        <p className="mt-2 text-sm text-fg-2">
          Last updated <strong>{fmtDateTime(uploadedAt)}</strong>
          {data.meta.sourceDate && <> · report dated {shortDate(data.meta.sourceDate)}</>}
          {data.meta.uploadedBy && <> · by {data.meta.uploadedBy}</>}.{' '}
          {data.totals.allJobs} jobs read, worth {fmtUsd(data.totals.allRevenue)} in
          total &mdash; {compactUsd(data.totals.firmRevenue)} scheduled,{' '}
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
        <SourceList data={data} />
        <p className="mt-2 text-xs text-fg-3">
          Refreshes automatically twice a day, at 6:30am and 7:30pm Central.
        </p>
        {canUpload && <UploadForm />}
      </section>
    </>
  );
}

/**
 * Which reports built this snapshot.
 *
 * Worth its own line because the board normally needs TWO: ServiceTitan won't
 * schedule a report looking out past 365 days, so the parked work arrives
 * separately. If only one report landed, this is where you'd see it — the
 * checksums would all have passed regardless.
 */
function SourceList({ data }: { data: ScheduledRevenueData }) {
  const sources = data.meta.sources ?? [];
  if (sources.length === 0) return null;
  return (
    <p className="mt-2 text-xs text-fg-3">
      Built from {sources.length} {sources.length === 1 ? 'report' : 'reports'}:{' '}
      {sources.map((s, i) => (
        <span key={`${s.label}-${i}`}>
          {i > 0 && ' · '}
          <span className="text-fg-2">{s.label}</span> ({s.rowCount} rows)
        </span>
      ))}
      {sources.length === 1 && (
        <span className="text-status-warn">
          {' '}
          — only one. If the parked work looks light, the second report
          didn&apos;t arrive.
        </span>
      )}
    </p>
  );
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
 * its own `?year=&month=` and would drop the view, unit filter and open day
 * every time you changed month.
 */
function MonthNav({ nav }: { nav: Nav }) {
  const prev = new Date(Date.UTC(nav.year, nav.month - 2, 1));
  const next = new Date(Date.UTC(nav.year, nav.month, 1));
  const arrow =
    'inline-flex h-8 w-8 items-center justify-center rounded-full text-cream/70 transition-colors hover:bg-lime hover:text-ink';

  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-bark px-2 py-1.5 text-cream shadow-sh-1">
      <Link
        href={linkTo(nav, {
          year: prev.getUTCFullYear(),
          month: prev.getUTCMonth() + 1,
          day: null,
          q: '',
        })}
        aria-label="Previous month"
        className={arrow}
      >
        ←
      </Link>
      <span className="min-w-[9rem] px-1 text-center font-headline text-xs font-extrabold uppercase tracking-ribbon">
        {monthLabel(nav.year, nav.month)}
      </span>
      <Link
        href={linkTo(nav, {
          year: next.getUTCFullYear(),
          month: next.getUTCMonth() + 1,
          day: null,
          q: '',
        })}
        aria-label="Next month"
        className={arrow}
      >
        →
      </Link>
    </div>
  );
}

/**
 * Every month on the board, as bars.
 *
 * This is the "how far out are we booked" view — the calendar answers "what is
 * next Tuesday worth", and this answers "what does spring look like". Months
 * with nothing in them are skipped rather than drawn empty: the board is lumpy
 * by nature and a row of zeros pushes the real months off the screen.
 */
function MonthOutlook({
  months,
  unit,
  currentMonth,
  today,
  nav,
}: {
  months: ScheduledRevenueData['months'];
  unit: BusinessUnit | null;
  currentMonth: string;
  today: string;
  nav: Nav;
}) {
  const thisMonthKey = today.slice(0, 7);
  const rows = months
    .map((m) => ({
      month: m.month,
      revenue: unit ? (m.byUnit[unit] ?? 0) : m.firmRevenue,
      jobs: unit ? (m.jobsByUnit?.[unit] ?? 0) : m.firmJobs,
      tree: treeTotal(m.byUnit),
      phc: phcTotal(m.byUnit),
    }))
    .filter((r) => r.revenue > 0);

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
        // The tree/PHC split inside each bar, so the outlook carries the same
        // separation the calendar squares do.
        const treePct = r.revenue > 0 ? (r.tree / r.revenue) * 100 : 0;
        return (
          <li key={r.month}>
            <Link
              href={linkTo(nav, { year: y, month: m, day: null, q: '' })}
              className={`flex items-center gap-3 rounded-2 border-2 px-3 py-2 transition-colors ${
                isCurrent
                  ? 'border-orange bg-orange/[0.06]'
                  : 'border-transparent hover:border-paper-edge hover:bg-paper/60'
              } ${isPast ? 'opacity-60' : ''}`}
            >
              <span className="w-24 shrink-0 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
                {monthLabel(y, m)}
              </span>
              {/* Full-width track, with the fill sized inside it. The fill
                  can't take flex-1 itself — two flex-1 siblings split the row
                  evenly and cap a big month at half the bar it earned. */}
              <span className="h-4 flex-1 overflow-hidden rounded-full bg-paper">
                <span
                  className="flex h-full"
                  style={{ width: `${Math.max(2, (r.revenue / peak) * 100)}%` }}
                >
                  <span
                    className={isPast ? 'bg-sand' : 'bg-green'}
                    style={{ width: `${unit ? 100 : treePct}%` }}
                  />
                  <span
                    className={isPast ? 'bg-sand/50' : 'bg-teal'}
                    style={{ width: `${unit ? 0 : 100 - treePct}%` }}
                  />
                </span>
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
