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
// /api/scheduled-revenue/import four times a day.
//
// THE THREE PILES, because the whole page rests on them:
//   SCHEDULED    — on the calendar, split into tree work and PHC.
//   WAITING ON    ServiceTitan calls this status Hold; nobody here does. Mostly
//   APPROVAL      jobs sitting on a customer's go-ahead. Never in a daily
//                 figure, and kept deliberately quiet on the page: the number is
//                 there to be looked up, not to be the first thing anyone sees
//                 and asks about.
//   UNSCHEDULED — sold work sitting on ServiceTitan's far-future placeholder
//                 date. Real money, no real date, so it gets a list rather than
//                 a square.
// The code still says `hold` and `parked` where it's reading ServiceTitan's own
// data — renaming the field would only hide where the words came from. Every
// string a person reads uses ours. See lib/scheduled-revenue.ts.
//
// No client JavaScript. The view, month, unit filter, open day and the sort all
// live in the URL, so any of it can be pasted into Slack and land someone on
// exactly what you were looking at — the sortable column headers are plain
// <Link>s, not a grid component that needs a bundle.
// ============================================================================

import Link from 'next/link';
import {
  requireHubAccess,
  canUploadScheduledRevenue,
  canSeePastDated,
} from '@/lib/auth';
import { CopyButton } from '@/components/CopyButton';
import { loadActiveScheduledRevenue } from '@/lib/scheduled-revenue-data';
import {
  UNIT_ORDER,
  UNIT_LABELS,
  UNIT_SHORT,
  PARKED_FROM,
  isBusinessUnit,
  isSortKey,
  sortJobs,
  DEFAULT_DIR,
  treeTotal,
  phcTotal,
  horizon,
  pastDated,
  type BusinessUnit,
  type ScheduledJob,
  type ScheduledRevenueData,
  type SortKey,
  type SortDir,
} from '@/lib/scheduled-revenue';
import { RevenueCalendar, UnitSplitBar, compactUsd } from '@/components/RevenueCalendar';
import { fmtUsd, fmtUsdCents, fmtDateTime, monthLabel } from '@/lib/format';
import { businessToday, toIsoDate } from '@/lib/dates';
import { uploadScheduledRevenue } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Which of the two side lists is expanded, if either.
 *
 * They open in place under their card, the same way tapping a day opens its job
 * list under the calendar — not as separate tabs. Tabs put these one level away
 * from everything else on the page, and you lost your month and your place
 * getting back.
 *
 * Two of the names here are the SERVICETITAN ones ('hold', 'parked') because
 * that's what the data says; the page calls them "Waiting on approval" and
 * "Unscheduled", which is what people here call them.
 *
 * 'pastdated' is ours, and is only reachable by the people in PAST_DATED_EMAILS
 * — see the note on that list in lib/auth.ts.
 */
type OpenList = 'hold' | 'parked' | 'pastdated';

type Search = Promise<{
  list?: string;
  year?: string;
  month?: string;
  unit?: string;
  day?: string;
  sort?: string;
  dir?: string;
  saved?: string;
  error?: string;
}>;

/** Everything the page needs to rebuild its own URL. */
type Nav = {
  list: OpenList | null;
  year: number;
  month: number;
  unit: BusinessUnit | null;
  day: string | null;
  /** null means "whatever this list sorts by out of the box". */
  sort: SortKey | null;
  dir: SortDir | null;
};

/**
 * Every internal link rebuilds the WHOLE query, so changing month doesn't
 * quietly drop the unit filter and switching views doesn't drop the month.
 */
function linkTo(nav: Nav, over: Partial<Nav>): string {
  const n = { ...nav, ...over };
  const q = new URLSearchParams();
  if (n.list) q.set('list', n.list);
  q.set('year', String(n.year));
  q.set('month', String(n.month));
  if (n.unit) q.set('unit', n.unit);
  if (n.day) q.set('day', n.day);
  if (n.sort) {
    q.set('sort', n.sort);
    if (n.dir) q.set('dir', n.dir);
  }
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
 * Every column sorts. Clicking a header you're already sorted by flips the
 * direction; clicking a new one opens it the way people mean that column —
 * biggest money first, oldest date first, text A-Z (see DEFAULT_DIR).
 *
 * The headers are plain <Link>s. That keeps the whole thing server-rendered
 * with no bundle, and it means a sorted view has its own URL you can paste to
 * someone: "here, sorted by what's oldest".
 */
function JobTable({
  jobs,
  nav,
  sort,
  dir,
  dates = 'both',
}: {
  jobs: ScheduledJob[];
  nav: Nav;
  sort: SortKey;
  dir: SortDir;
  /**
   * Which date columns to draw.
   *
   * 'both'  — Sched. (the first appointment) and Next appt.
   * 'first' — Sched. only, for the open-day panel. You already know the day
   *           from the heading, so a Next appt column would repeat it on every
   *           row; the first appointment is the one that tells you something —
   *           a job that started in February is a continuation, not new work.
   */
  dates?: 'both' | 'first';
}) {
  if (jobs.length === 0) {
    return <p className="mt-4 text-sm text-fg-2">Nothing here.</p>;
  }

  const head = (key: SortKey, label: string, right?: boolean) => (
    <SortTh key={key} nav={nav} sort={sort} dir={dir} col={key} right={right}>
      {label}
    </SortTh>
  );

  return (
    <div className="-mx-2 mt-4 overflow-x-auto px-2">
      <table className="w-full min-w-[46rem] text-left text-sm">
        <thead>
          <tr className="border-b-2 border-paper-edge">
            {head('date', 'Sched.')}
            {dates === 'both' && head('nextAppt', 'Next appt')}
            {head('job', 'Job')}
            {head('type', 'Type')}
            {head('unit', 'Unit')}
            {head('soldBy', 'Sold by')}
            {head('soldOn', 'Sold on')}
            {head('crew', 'Crew')}
            {head('city', 'City')}
            {head('subtotal', 'Subtotal', true)}
          </tr>
        </thead>
        <tbody>
          {sortJobs(jobs, sort, dir).map((j) => (
            <tr key={j.jobNumber} className="border-b border-paper-edge/70">
              <Td>
                <span className="whitespace-nowrap font-headline text-xs font-extrabold text-fg-2">
                  {j.scheduledDate ? shortDate(j.scheduledDate) : '—'}
                </span>
              </Td>
              {dates === 'both' && (
                <Td>
                  <span className="whitespace-nowrap font-headline text-xs font-extrabold text-fg-2">
                    {j.nextApptDate ? shortDate(j.nextApptDate) : '—'}
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

/** One clickable column header, with the arrow on the active one. */
function SortTh({
  nav,
  sort,
  dir,
  col,
  right,
  children,
}: {
  nav: Nav;
  sort: SortKey;
  dir: SortDir;
  col: SortKey;
  right?: boolean;
  children: React.ReactNode;
}) {
  const isActive = sort === col;
  const nextDir: SortDir = isActive
    ? dir === 'asc'
      ? 'desc'
      : 'asc'
    : DEFAULT_DIR[col];

  return (
    <th
      scope="col"
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`pb-2 ${right ? 'text-right' : ''}`}
    >
      <Link
        href={linkTo(nav, { sort: col, dir: nextDir })}
        scroll={false}
        className={`inline-flex items-center gap-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon transition-colors ${
          isActive ? 'text-orange' : 'text-fg-3 hover:text-orange'
        }`}
      >
        {children}
        <span aria-hidden className={isActive ? '' : 'opacity-0'}>
          {dir === 'asc' ? '↑' : '↓'}
        </span>
      </Link>
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
  const showPastDated = canSeePastDated(user.email);
  const sp = await searchParams;
  const active = await loadActiveScheduledRevenue();

  const today = toIsoDate(businessToday(new Date()));
  const [todayYear, todayMonth] = today.split('-').map(Number);

  const nav: Nav = {
    list: isOpenList(sp.list) ? sp.list : null,
    year: clampInt(sp.year, todayYear, 2020, 2099),
    month: clampInt(sp.month, todayMonth, 1, 12),
    unit: isBusinessUnit(sp.unit) ? sp.unit : null,
    day:
      typeof sp.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null,
    sort: isSortKey(sp.sort) ? sp.sort : null,
    dir: sp.dir === 'asc' || sp.dir === 'desc' ? sp.dir : null,
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
          showPastDated={showPastDated}
        />
      )}
    </main>
  );
}

function isOpenList(v: unknown): v is OpenList {
  return v === 'hold' || v === 'parked' || v === 'pastdated';
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
        unscheduled work parked out in 2030, because ServiceTitan won&apos;t
        schedule a report that looks out further than a year.
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
        unscheduled one). This replaces the calendar for everyone.
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

/**
 * One of the two side lists, expanded in place under its card.
 *
 * Same shape as the open-day panel below the calendar, deliberately: there is
 * one way this page shows you a list of jobs, and it's this.
 */
function ListPanel({
  nav,
  jobs,
  title,
  blurb,
  dates,
  defaultSort,
  copyText,
}: {
  nav: Nav;
  jobs: ScheduledJob[];
  title: string;
  blurb: string;
  dates?: 'both' | 'first';
  /** How this list opens before anyone touches a header. */
  defaultSort: { key: SortKey; dir: SortDir };
  /** When set, a Copy button putting this on the clipboard. Plain text, for
   *  pasting the list into a message. */
  copyText?: string;
}) {
  const sort = nav.sort ?? defaultSort.key;
  const dir = nav.dir ?? (nav.sort ? DEFAULT_DIR[sort] : defaultSort.dir);
  return (
    <section className="mt-3 rounded-card border-[3px] border-orange bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
          {title} &mdash; {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'},{' '}
          {fmtUsd(sumOf(jobs))}
        </h2>
        <div className="flex items-center gap-3">
          {copyText && <CopyButton text={copyText} label={`Copy ${jobs.length} jobs`} />}
          <Link
            href={linkTo(nav, { list: null, sort: null, dir: null })}
            scroll={false}
            className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3 hover:text-orange"
          >
            Close ✕
          </Link>
        </div>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-fg-2">{blurb}</p>
      <p className="mt-2 text-xs text-fg-3">
        Click any column heading to reorder the list; click it again to flip it.
      </p>
      <JobTable jobs={jobs} nav={nav} sort={sort} dir={dir} dates={dates} />
    </section>
  );
}

function Report({
  data,
  uploadedAt,
  today,
  nav,
  canUpload,
  showPastDated,
}: {
  data: ScheduledRevenueData;
  uploadedAt: string;
  today: string;
  nav: Nav;
  canUpload: boolean;
  /** The past-dated list is gated to specific people; everyone else doesn't
   *  see the tile at all. See PAST_DATED_EMAILS in lib/auth.ts. */
  showPastDated: boolean;
}) {
  const { year, month, unit, day: selectedDay } = nav;

  // The three piles stay mutually exclusive — unscheduled wins over waiting,
  // which is what makes scheduled + waiting + unscheduled reconcile with the
  // export's grand total. A job waiting on approval that ALSO has no real date
  // belongs under Unscheduled, where someone looking for it would go; the
  // waiting list says how many of those there are.
  const waitingJobs = data.jobs.filter((j) => j.status === 'hold' && !j.parked);
  const waitingAndUnscheduled = data.jobs.filter(
    (j) => j.status === 'hold' && j.parked,
  ).length;
  const unscheduledJobs = data.jobs.filter((j) => j.parked);
  // Firm work still sitting on a day that has gone by. Same definition
  // pastDated() sums, so the list and the tile can't disagree.
  const pastDatedJobs = data.jobs.filter(
    (j) => j.date && j.date < today && !j.parked && j.status !== 'hold',
  );
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

  const dayJobs = selectedDay
    ? data.jobs.filter((j) => j.date === selectedDay && !j.parked)
    : [];
  // A day opens grouped by crew, because that's how a day is actually read:
  // who is where, and what are they worth. The headers take it from there —
  // click Subtotal for the biggest jobs.
  const daySort = nav.sort ?? 'crew';
  const dayDir = nav.dir ?? (nav.sort ? DEFAULT_DIR[daySort] : 'asc');
  const dayTotals = selectedDay ? dayMap.get(selectedDay) : undefined;

  const s = data.sinceLast;

  return (
    <>
      {/* ---- headline figures ------------------------------------------- */}
      <section
        className={`grid grid-cols-2 gap-3 ${
          showPastDated ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        }`}
      >
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
        {showPastDated && (
          <PastDatedTile
            nav={nav}
            revenue={behind.revenue}
            jobs={behind.jobs}
            unitFiltered={unit !== null}
          />
        )}
      </section>

      {/* ---- unscheduled, then waiting ----------------------------------
          Unscheduled leads because it's the one that turns into schedulable
          work. Waiting is deliberately the quiet one: it's mostly jobs sitting
          on a customer's go-ahead, and a loud number invites a question the
          number can't answer on its own. It's here to be looked up, not
          noticed.

          Both cards are the whole click target, and both open their list in
          place below rather than navigating anywhere. */}
      <section className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PileCard
          nav={nav}
          list="parked"
          label="Unscheduled — sold, no date yet"
          amount={fmtUsd(data.totals.parkedRevenue)}
          jobs={unscheduledJobs.length}
          blurb={`Sitting on ServiceTitan's ${shortDate(PARKED_FROM)} placeholder. Real money, nowhere to put it on a calendar yet.`}
          tone="lead"
        />
        <PileCard
          nav={nav}
          list="hold"
          label="Waiting on approval — not counted anywhere"
          amount={fmtUsd(data.totals.holdRevenue)}
          jobs={waitingJobs.length}
          blurb="Jobs ServiceTitan has at Hold — mostly waiting on a customer's go-ahead. Kept out of every figure on this page on purpose."
          tone="quiet"
        />
      </section>

      {nav.list === 'parked' && (
        <ListPanel
          nav={nav}
          jobs={unscheduledJobs}
          title="Unscheduled"
          blurb={`Sold work with no real date yet — ServiceTitan parks it on ${shortDate(PARKED_FROM)}. Biggest first: every one of these is a day on the calendar waiting to happen.`}
          defaultSort={{ key: 'subtotal', dir: 'desc' }}
        />
      )}

      {showPastDated && nav.list === 'pastdated' && (
        <ListPanel
          nav={nav}
          jobs={pastDatedJobs}
          title="Past-dated"
          blurb="Jobs whose next appointment has already gone by — nothing further is booked and nobody closed them out. A job part-way through a multi-day run sits on its NEXT crew day instead, so anything in here is genuinely stranded. Normally empty."
          defaultSort={{ key: 'nextAppt', dir: 'asc' }}
          copyText={pastDatedMessage(pastDatedJobs, today)}
        />
      )}

      {nav.list === 'hold' && (
        <ListPanel
          nav={nav}
          jobs={waitingJobs}
          title="Waiting on approval"
          blurb={`Jobs ServiceTitan has at Hold — mostly waiting on a customer's go-ahead. None of it is in any calendar figure. Opens by the day each one is currently sitting on.${
            waitingAndUnscheduled > 0
              ? ` A further ${waitingAndUnscheduled} ${waitingAndUnscheduled === 1 ? 'job has' : 'jobs have'} no date at all — those are under Unscheduled.`
              : ''
          }`}
          defaultSort={{ key: 'nextAppt', dir: 'asc' }}
        />
      )}

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
            hrefForDay={(d) =>
              linkTo(nav, { day: d, list: null, sort: null, dir: null })
            }
          />
        </div>

        <p className="mt-4 text-xs text-fg-3">
          Each square: tree work on top, PHC underneath, both added up below the
          rule. Work waiting on approval is a footnote, never part of the
          figure. Tap a day for the job list.
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
              href={linkTo(nav, { day: null, list: null, sort: null, dir: null })}
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
                · {fmtUsdCents(dayTotals.holdRevenue)} waiting on approval, not
                counted
              </span>
            )}
          </p>
          <p className="mt-3 text-xs text-fg-3">
            Click any column heading to reorder the list; click it again to flip
            it.
          </p>
          <JobTable
            jobs={dayJobs}
            nav={nav}
            sort={daySort}
            dir={dayDir}
            dates="first"
          />
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
          {compactUsd(data.totals.holdRevenue)} waiting on approval,{' '}
          {compactUsd(data.totals.parkedRevenue)} unscheduled.
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
          Refreshes automatically four times a day &mdash; 6am, 11am, 3pm and
          7pm Central.
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
          — only one. If the unscheduled list looks light, the second report
          didn&apos;t arrive.
        </span>
      )}
    </p>
  );
}

/**
 * The past-dated tile, which is also a button.
 *
 * Same headline number as the other three tiles, but it opens its list — this
 * is the one figure on the page that's a to-do rather than a report, and the
 * only useful next move is seeing which jobs it's made of.
 *
 * The unit filter deliberately doesn't apply. Stale work is stale whichever
 * crew it belongs to, and a filtered version of this number would quietly
 * under-report what's outstanding.
 */
function PastDatedTile({
  nav,
  revenue,
  jobs,
  unitFiltered,
}: {
  nav: Nav;
  revenue: number;
  jobs: number;
  unitFiltered: boolean;
}) {
  const isOpen = nav.list === 'pastdated';
  const empty = jobs === 0;
  return (
    <Link
      href={linkTo(nav, {
        list: isOpen || empty ? null : 'pastdated',
        day: null,
        sort: null,
        dir: null,
      })}
      scroll={false}
      aria-expanded={isOpen}
      className={`block rounded-card border-[3px] p-4 transition-colors ${
        isOpen ? 'border-orange' : 'border-paper-edge hover:border-orange'
      } bg-white`}
    >
      <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
        Past-dated
      </p>
      <p
        className={`mt-1 font-headline text-3xl font-black ${
          empty ? 'text-fg-2' : 'text-status-behind'
        }`}
      >
        {fmtUsd(revenue)}
      </p>
      <p className="mt-1 text-xs text-fg-2">
        {empty ? (
          'Nothing stale on the board'
        ) : (
          <>
            {jobs} jobs still sitting on days that have gone by
            {unitFiltered && ' (all units)'}{' '}
            <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange">
              {isOpen ? 'Hide ▴' : 'Show ▾'}
            </span>
          </>
        )}
      </p>
    </Link>
  );
}

/**
 * The past-dated list as plain text, for pasting into a message.
 *
 * Written to be read by a person in Slack, not parsed: the header says what the
 * list IS and when it was taken, because a bare list of job numbers arriving in
 * someone's DMs is a puzzle rather than a request. Oldest first, which is the
 * order they need working in.
 */
function pastDatedMessage(jobs: ScheduledJob[], today: string): string {
  const ordered = sortJobs(jobs, 'date', 'asc');
  const total = sumOf(ordered);
  const lines = [
    `Past-dated jobs on the board — ${ordered.length} ${ordered.length === 1 ? 'job' : 'jobs'}, ${fmtUsd(total)}`,
    `As of ${longDate(today)}. These are scheduled on days that have already gone by and haven't been closed out — either the work happened and the job wasn't updated, or it slipped and nobody moved it.`,
    '',
  ];
  for (const j of ordered) {
    const money = j.subtotal > 0 ? fmtUsdCents(j.subtotal) : 'no $';
    lines.push(
      `• ${j.date ? shortDate(j.date) : '—'} · Job ${j.jobNumber} · ${j.jobType || 'Job'} (${UNIT_SHORT[j.unit]}) · ${money}`,
    );
    lines.push(
      `  ${j.city || 'no city'} · Crew: ${j.crew.length ? j.crew.join(', ') : 'Unassigned'} · Sold by: ${j.soldBy || '—'}`,
    );
  }
  return lines.join('\n');
}

/**
 * One of the two side piles, as a card that opens its own list.
 *
 * The whole card is the link — a big target on a phone, and it means the
 * "show the list" affordance isn't a second small thing to aim at.
 */
function PileCard({
  nav,
  list,
  label,
  amount,
  jobs,
  blurb,
  tone,
}: {
  nav: Nav;
  list: OpenList;
  label: string;
  amount: string;
  jobs: number;
  blurb: string;
  /** 'lead' is the one worth acting on; 'quiet' is there to be looked up. */
  tone: 'lead' | 'quiet';
}) {
  const isOpen = nav.list === list;
  const lead = tone === 'lead';
  return (
    <Link
      // Opening a pile closes the open day, and vice versa: they share the sort
      // in the URL, and two lists disagreeing about which column they're sorted
      // by is worse than only ever having one open.
      href={linkTo(nav, {
        list: isOpen ? null : list,
        day: null,
        sort: null,
        dir: null,
      })}
      scroll={false}
      aria-expanded={isOpen}
      className={`block rounded-2 p-4 transition-colors ${
        lead
          ? 'border-2 border-paper-edge bg-white hover:border-orange'
          : 'border border-paper-edge bg-paper/60 hover:border-fg-3'
      } ${isOpen ? '!border-orange' : ''}`}
    >
      <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
        {label}
      </p>
      <p
        className={
          lead
            ? 'mt-1 font-headline text-2xl font-black text-ink'
            : 'mt-1 font-headline text-lg font-extrabold text-fg-2'
        }
      >
        {amount}{' '}
        <span
          className={
            lead
              ? 'text-sm font-extrabold text-fg-2'
              : 'text-xs font-extrabold text-fg-3'
          }
        >
          · {jobs} jobs
        </span>
      </p>
      <p className={`mt-1 text-xs ${lead ? 'text-fg-2' : 'text-fg-3'}`}>
        {blurb}{' '}
        <span
          className={`font-headline text-[10px] font-extrabold uppercase tracking-ribbon ${
            lead ? 'text-orange' : 'text-fg-2'
          }`}
        >
          {isOpen ? 'Hide the list ▴' : 'Show the list ▾'}
        </span>
      </p>
    </Link>
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
        // Only the open day is closed. The sort is left alone: if one of the
        // side lists is open it isn't month-scoped, and resetting its column
        // every time you stepped a month would be maddening.
        href={linkTo(nav, {
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
        {monthLabel(nav.year, nav.month)}
      </span>
      <Link
        href={linkTo(nav, {
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
              href={linkTo(nav, { year: y, month: m, day: null })}
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
