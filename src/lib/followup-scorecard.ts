// ============================================================================
// Follow-Through Scorecard — types, aggregation, and presentation helpers
// ============================================================================
// Pure logic only: no database, no xlsx imports. The upload action parses a
// spreadsheet into RawOpportunity rows and hands them to computeScorecard();
// the page renders whatever ScorecardData it gets. Keeping the maths here means
// the numbers can be unit-checked without a file or a session.
//
// TWO POPULATION RULES decide what every figure on the page means. Both are
// deliberate, and changing either one silently changes the story:
//
//  1. The export is filtered by NEXT FOLLOW UP DATE, so it is only the records
//     due in that window — never the whole book. Totals here are not season
//     sales, and the page says so.
//  2. Rows with ZERO logged follow-ups are excluded from every figure. In the
//     original export all 363 of them also had no last-follow-up date at all:
//     they sold at the appointment and never needed a call, so counting them
//     buries the thing this page exists to show. `excludedNoFollowup` reports
//     how many were held out.
// ============================================================================

/** One row of the "Open Opportunities" export, already coerced to JS types. */
export type RawOpportunity = {
  technician: string;
  status: string;
  /** The Follow-Ups count on the record. */
  calls: number;
  /** Total Amount of Estimate(s) Sold — only meaningful on a Won row. */
  sold: number;
  /** Highest Estimate Value — what the opportunity is worth if it lands. */
  estimate: number;
  nextFollowUp: Date | null;
  lastFollowUp: Date | null;
};

export type CallDepth = 'c1' | 'c2' | 'c34' | 'c5';

export const CALL_DEPTH_LABELS: Record<CallDepth, string> = {
  c1: 'Won on call 1',
  c2: 'Won on call 2',
  c34: 'Won on calls 3–4',
  c5: 'Won on call 5+',
};

export const CALL_DEPTH_ORDER: CallDepth[] = ['c1', 'c2', 'c34', 'c5'];

// The ordinal ramp for "how many calls" — one warm-brown hue, light to dark, so
// it reads as a scale rather than four unrelated categories. These steps are
// checked for monotonic lightness, visible step gaps, and contrast against the
// cream page background; don't swap them for arbitrary browns.
export const CALL_DEPTH_COLORS: Record<CallDepth, string> = {
  c1: '#CFA96C',
  c2: '#AE8244',
  c34: '#875B28',
  c5: '#5A3812',
};

export type RecencyBucket = 'neverTouched' | 'd31plus' | 'd30' | 'd14' | 'd7';

export const RECENCY_LABELS: Record<RecencyBucket, string> = {
  neverTouched: 'Never touched',
  d31plus: '31+ days',
  d30: '15–30 days',
  d14: '8–14 days',
  d7: '0–7 days',
};

// Same ramp reused for recency so the whole page speaks one visual language:
// coldest on the left, freshest on the right. `neverTouched` is deliberately not
// on the ramp — nothing happened at all, a different kind of fact than "a while
// ago" — so the component gives it a hatched fill instead.
export const RECENCY_COLORS: Record<Exclude<RecencyBucket, 'neverTouched'>, string> = {
  d31plus: '#CFA96C',
  d30: '#AE8244',
  d14: '#875B28',
  d7: '#5A3812',
};

/** What calling back earned one arborist, and how deep the calls went. */
export type FollowupRevenue = {
  name: string;
  followed: number;
  won: number;
  sold: number;
  winRate: number;
  maxCalls: number;
  byDepth: Record<CallDepth, number>;
  jobsByDepth: Record<CallDepth, number>;
  /** Sold value from call three onward — the calls easiest to skip. */
  deep: number;
  deepJobs: number;
};

/** One arborist's still-open board. */
export type OpenBoard = {
  name: string;
  /**
   * Shown last and set apart in the charts, because raw call counts would rank
   * this person unfairly. The rule is `droppedAfterOne === 0`: nothing on the
   * board was given up on, so a high "under 2 calls" share can only mean the
   * work is new, not abandoned. (In the Aug 2026 data that was Alex P.)
   */
  pinned: boolean;
  open: number;
  avgCalls: number;
  calls: { never: number; one: number; two: number; threeFour: number; fivePlus: number };
  underTwo: number;
  underTwoPct: number;
  droppedAfterOne: number;
  onTheTable: number;
  recency: Record<RecencyBucket, number>;
  cold30: number;
  medianDaysSinceCall: number;
  medianDaysPastDue: number;
  calledAfterDue: number;
};

/** Outcome rates by how many calls a record got. */
export type DepthOutcome = {
  key: CallDepth;
  label: string;
  records: number;
  won: number;
  winRate: number;
  unreachable: number;
  unreachableRate: number;
  sold: number;
};

export type ScorecardTotals = {
  followed: number;
  won: number;
  sold: number;
  winRate: number;
  avgWin: number;
  won3Plus: number;
  sold3Plus: number;
  maxCalls: number;
  excludedNoFollowup: number;
  openBoard: number;
  droppedAfterOne: number;
  onTheTable: number;
  recoverableEstimate: number;
  medianDaysPastDue: number;
  minDaysPastDue: number;
  maxDaysPastDue: number;
  calledAfterDue: number;
  cold30: number;
  cold30Value: number;
};

export type ScorecardMeta = {
  /** Earliest / latest Next Follow Up Date in the export — the filter window. */
  windowStart: string | null;
  windowEnd: string | null;
  /** When the numbers were computed; all "days ago" maths is relative to this. */
  asOf: string;
  sourceFilename: string | null;
  uploadedBy: string | null;
  totalRows: number;
};

export type ScorecardData = {
  meta: ScorecardMeta;
  totals: ScorecardTotals;
  depthOutcomes: DepthOutcome[];
  revenue: FollowupRevenue[];
  openBoards: OpenBoard[];
};

// ---------------------------------------------------------------------------
// Spreadsheet parsing
// ---------------------------------------------------------------------------
// Takes a plain 2-D grid (row 0 = headers) so it stays free of any xlsx import
// and can be tested without a file. The upload action turns the workbook into
// that grid and hands it over.

/** Columns the aggregation genuinely needs; a missing one refuses the upload. */
export const REQUIRED_COLUMNS = [
  'Technician',
  'Opportunity Status',
  'Follow-Ups',
  'Next Follow Up Date',
] as const;

/** Read but tolerated as absent — they only affect some figures. */
export const OPTIONAL_COLUMNS = [
  'Last Follow Up Date',
  'Highest Estimate Value',
  'Total Amount of Estimate(s) Sold',
] as const;

// Excel counts days from 1899-12-30 (its 1900 leap-year bug included).
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** A cell that should be a date: Date, Excel serial, ISO-ish string, or blank. */
export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && v > 0) {
    return new Date(EXCEL_EPOCH_MS + Math.round(v * 86_400_000));
  }
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** A cell that should be a number. Tolerates `$1,234.50`, blanks, and text. */
export function toNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Turn a spreadsheet grid into opportunity rows.
 *
 * Returns `missingColumns` rather than throwing so the caller can tell the user
 * exactly which header it couldn't find — silently computing zeros off a wrong
 * export is the failure mode worth engineering against here.
 */
export function parseOpportunityGrid(grid: unknown[][]): {
  rows: RawOpportunity[];
  missingColumns: string[];
} {
  if (grid.length < 2) {
    return { rows: [], missingColumns: [...REQUIRED_COLUMNS] };
  }
  const header = (grid[0] ?? []).map((h) => String(h ?? '').trim());
  const colOf = new Map<string, number>();
  header.forEach((h, i) => {
    if (h && !colOf.has(h)) colOf.set(h, i);
  });

  const missingColumns = REQUIRED_COLUMNS.filter((c) => !colOf.has(c));
  if (missingColumns.length) return { rows: [], missingColumns };

  const at = (row: unknown[], name: string): unknown => {
    const i = colOf.get(name);
    return i == null ? '' : row[i];
  };

  const rows: RawOpportunity[] = [];
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const technician = String(at(row, 'Technician') ?? '').trim();
    const status = String(at(row, 'Opportunity Status') ?? '').trim();
    // Neither a person nor a status means padding, not data.
    if (!technician && !status) continue;
    rows.push({
      technician,
      status,
      calls: Math.max(0, Math.round(toNumber(at(row, 'Follow-Ups')))),
      sold: toNumber(at(row, 'Total Amount of Estimate(s) Sold')),
      estimate: toNumber(at(row, 'Highest Estimate Value')),
      nextFollowUp: toDate(at(row, 'Next Follow Up Date')),
      lastFollowUp: toDate(at(row, 'Last Follow Up Date')),
    });
  }
  return { rows, missingColumns: [] };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const OPEN_STATUSES = new Set(['Unreachable', 'Contacted', 'NotAttempted']);
const DAY_MS = 86_400_000;

/**
 * First Name + Last Initial, per the company naming convention — never a full
 * last name. Multi-person rows (the export comma-joins them) collapse to
 * 'Shared', which is then held out of the per-person charts because it isn't
 * one person's work.
 */
export function shortName(raw: string): string {
  const name = (raw ?? '').trim();
  if (!name) return 'Unassigned';
  if (name.includes(',')) return 'Shared';
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}`;
}

function depthOf(calls: number): CallDepth {
  if (calls <= 1) return 'c1';
  if (calls === 2) return 'c2';
  if (calls <= 4) return 'c34';
  return 'c5';
}

function recencyOf(daysSinceCall: number | null): RecencyBucket {
  if (daysSinceCall === null) return 'neverTouched';
  if (daysSinceCall > 30) return 'd31plus';
  if (daysSinceCall > 14) return 'd30';
  if (daysSinceCall > 7) return 'd14';
  return 'd7';
}

/** Whole days between two instants, floored — matches "N days ago" in the copy. */
function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);
}

/**
 * Median, averaging the two middle values on an even count. Matches the
 * convention the original analysis used, so figures stay comparable week to week.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(m * 10) / 10;
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const money = (n: number) => Math.round(n);

/**
 * Turn export rows into everything the page renders.
 *
 * @param rows   every data row from the spreadsheet, blank rows already dropped
 * @param asOf   the reference instant for all "days ago" maths (upload time)
 */
export function computeScorecard(
  rows: RawOpportunity[],
  asOf: Date,
  meta: { sourceFilename?: string | null; uploadedBy?: string | null } = {},
): ScorecardData {
  const withName = rows.map((r) => ({ ...r, tech: shortName(r.technician) }));

  // Rule 2: only records that actually got called back.
  const followedUp = withName.filter((r) => r.calls >= 1);
  const won = followedUp.filter((r) => r.status === 'Won');
  const open = withName.filter((r) => OPEN_STATUSES.has(r.status));

  // ---- per-arborist follow-up revenue -------------------------------------
  const revNames = [
    ...new Set(followedUp.filter((r) => r.tech !== 'Shared').map((r) => r.tech)),
  ];
  const revenue: FollowupRevenue[] = revNames
    .map((name) => {
      const mine = followedUp.filter((r) => r.tech === name);
      const myWins = mine.filter((r) => r.status === 'Won');
      const byDepth = { c1: 0, c2: 0, c34: 0, c5: 0 } as Record<CallDepth, number>;
      const jobsByDepth = { c1: 0, c2: 0, c34: 0, c5: 0 } as Record<CallDepth, number>;
      for (const w of myWins) {
        const d = depthOf(w.calls);
        byDepth[d] += w.sold;
        jobsByDepth[d] += 1;
      }
      for (const d of CALL_DEPTH_ORDER) byDepth[d] = money(byDepth[d]);
      return {
        name,
        followed: mine.length,
        won: myWins.length,
        sold: money(myWins.reduce((s, r) => s + r.sold, 0)),
        winRate: pct(myWins.length, mine.length),
        maxCalls: myWins.length ? Math.max(...myWins.map((r) => r.calls)) : 0,
        byDepth,
        jobsByDepth,
        deep: byDepth.c34 + byDepth.c5,
        deepJobs: jobsByDepth.c34 + jobsByDepth.c5,
      };
    })
    // Everyone who earned something by calling back, biggest first. People with
    // no follow-up wins still belong here — a zero bar is information.
    .sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name));

  // ---- per-arborist open board -------------------------------------------
  const openNames = [...new Set(open.filter((r) => r.tech !== 'Shared').map((r) => r.tech))];
  const openBoards: OpenBoard[] = openNames
    .map((name) => {
      const mine = open.filter((r) => r.tech === name);
      const calls = { never: 0, one: 0, two: 0, threeFour: 0, fivePlus: 0 };
      const recency: Record<RecencyBucket, number> = {
        neverTouched: 0, d31plus: 0, d30: 0, d14: 0, d7: 0,
      };
      const staleDays: number[] = [];
      const pastDueDays: number[] = [];
      let calledAfterDue = 0;
      let cold30 = 0;

      for (const r of mine) {
        if (r.calls === 0) calls.never += 1;
        else if (r.calls === 1) calls.one += 1;
        else if (r.calls === 2) calls.two += 1;
        else if (r.calls <= 4) calls.threeFour += 1;
        else calls.fivePlus += 1;

        const since = r.lastFollowUp ? daysBetween(asOf, r.lastFollowUp) : null;
        recency[recencyOf(since)] += 1;
        if (since !== null) {
          staleDays.push(since);
          if (since > 30) cold30 += 1;
        }
        if (r.nextFollowUp) pastDueDays.push(daysBetween(asOf, r.nextFollowUp));
        if (r.lastFollowUp && r.nextFollowUp && r.lastFollowUp > r.nextFollowUp) {
          calledAfterDue += 1;
        }
      }

      const dropped = mine.filter((r) => r.status === 'Unreachable' && r.calls < 2);
      const underTwo = mine.filter((r) => r.calls < 2).length;
      return {
        name,
        // See OpenBoard.pinned — nothing given up on means low call counts
        // can't mean giving up.
        pinned: dropped.length === 0,
        open: mine.length,
        avgCalls: Math.round((mine.reduce((s, r) => s + r.calls, 0) / mine.length) * 10) / 10,
        calls,
        underTwo,
        underTwoPct: pct(underTwo, mine.length),
        droppedAfterOne: dropped.length,
        onTheTable: money(dropped.reduce((s, r) => s + r.estimate, 0)),
        recency,
        cold30,
        medianDaysSinceCall: median(staleDays),
        medianDaysPastDue: median(pastDueDays),
        calledAfterDue,
      };
    })
    // Biggest board first, with any pinned board held to the end.
    .sort(
      (a, b) =>
        Number(a.pinned) - Number(b.pinned) ||
        b.open - a.open ||
        a.name.localeCompare(b.name),
    );

  // ---- outcome by call depth ---------------------------------------------
  const depthOutcomes: DepthOutcome[] = CALL_DEPTH_ORDER.map((key) => {
    const bucket = followedUp.filter((r) => depthOf(r.calls) === key);
    const bWon = bucket.filter((r) => r.status === 'Won');
    const bUnreach = bucket.filter((r) => r.status === 'Unreachable');
    return {
      key,
      label: key === 'c1' ? '1 call' : key === 'c2' ? '2 calls' : key === 'c34' ? '3–4 calls' : '5+ calls',
      records: bucket.length,
      won: bWon.length,
      winRate: pct(bWon.length, bucket.length),
      unreachable: bUnreach.length,
      unreachableRate: pct(bUnreach.length, bucket.length),
      sold: money(bWon.reduce((s, r) => s + r.sold, 0)),
    };
  });

  // ---- totals -------------------------------------------------------------
  const soldTotal = money(won.reduce((s, r) => s + r.sold, 0));
  const winRate = pct(won.length, followedUp.length);
  const avgWin = won.length ? money(soldTotal / won.length) : 0;
  const dropped = withName.filter((r) => r.status === 'Unreachable' && r.calls < 2);
  const wins3Plus = won.filter((r) => r.calls >= 3);
  const openStale = open
    .map((r) => (r.lastFollowUp ? daysBetween(asOf, r.lastFollowUp) : null))
    .filter((d): d is number => d !== null);
  const openPastDue = open
    .map((r) => (r.nextFollowUp ? daysBetween(asOf, r.nextFollowUp) : null))
    .filter((d): d is number => d !== null);
  const cold = open.filter(
    (r) => r.lastFollowUp && daysBetween(asOf, r.lastFollowUp) > 30,
  );

  const nextDates = withName
    .map((r) => r.nextFollowUp)
    .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const totals: ScorecardTotals = {
    followed: followedUp.length,
    won: won.length,
    sold: soldTotal,
    winRate,
    avgWin,
    won3Plus: wins3Plus.length,
    sold3Plus: money(wins3Plus.reduce((s, r) => s + r.sold, 0)),
    maxCalls: won.length ? Math.max(...won.map((r) => r.calls)) : 0,
    excludedNoFollowup: withName.length - followedUp.length,
    openBoard: open.length,
    droppedAfterOne: dropped.length,
    onTheTable: money(dropped.reduce((s, r) => s + r.estimate, 0)),
    // What the dropped pile is plausibly worth: our own conversion rate on
    // followed-up records × our own average follow-up win. Rounded hard to the
    // nearest $1k because it is an estimate and shouldn't read as a forecast.
    recoverableEstimate:
      Math.round((dropped.length * (winRate / 100) * avgWin) / 1000) * 1000,
    medianDaysPastDue: median(openPastDue),
    minDaysPastDue: openPastDue.length ? Math.min(...openPastDue) : 0,
    maxDaysPastDue: openPastDue.length ? Math.max(...openPastDue) : 0,
    calledAfterDue: open.filter(
      (r) => r.lastFollowUp && r.nextFollowUp && r.lastFollowUp > r.nextFollowUp,
    ).length,
    cold30: cold.length,
    cold30Value: money(cold.reduce((s, r) => s + r.estimate, 0)),
  };
  void openStale; // medians are computed per-board; the flat list is not needed

  return {
    meta: {
      windowStart: nextDates.length ? nextDates[0].toISOString() : null,
      windowEnd: nextDates.length ? nextDates[nextDates.length - 1].toISOString() : null,
      asOf: asOf.toISOString(),
      sourceFilename: meta.sourceFilename ?? null,
      uploadedBy: meta.uploadedBy ?? null,
      totalRows: withName.length,
    },
    totals,
    depthOutcomes,
    revenue,
    openBoards,
  };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** `$1,234` — whole dollars. Estimate values are never fractional here. */
export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** `$84k` for chart labels, where the exact figure lives in the tooltip. */
export function usdShort(n: number): string {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;
}

/** `Jul 1 – Aug 7, 2026` from the stored ISO window. */
export function windowLabel(meta: ScorecardMeta): string {
  if (!meta.windowStart || !meta.windowEnd) return 'the uploaded window';
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  };
  const a = new Date(meta.windowStart);
  const b = new Date(meta.windowEnd);
  const year = b.getUTCFullYear();
  return `${a.toLocaleDateString('en-US', opts)} – ${b.toLocaleDateString('en-US', opts)}, ${year}`;
}

export function asOfLabel(meta: ScorecardMeta): string {
  return new Date(meta.asOf).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Chicago',
  });
}

/** "1 in 3" from a win rate, so the headline tile survives a data refresh. */
export function oneInN(rate: number): string {
  if (rate <= 0) return '—';
  return `1 in ${Math.max(2, Math.round(100 / rate))}`;
}

function outcome(data: ScorecardData, key: CallDepth): DepthOutcome | undefined {
  return data.depthOutcomes.find((d) => d.key === key);
}

/**
 * The narrative numbers the page quotes in prose. Derived rather than written
 * down, because this data is re-uploaded weekly and hardcoded findings would
 * quietly go stale — the most dangerous kind of wrong on a page like this.
 */
export function narrative(data: ScorecardData) {
  const c1 = outcome(data, 'c1');
  const c2 = outcome(data, 'c2');
  const c34 = outcome(data, 'c34');
  const c5 = outcome(data, 'c5');

  // Whoever won a job off the longest chase — the "don't give up on call three"
  // proof, named.
  const chaser = [...data.revenue].sort((a, b) => b.maxCalls - a.maxCalls)[0];

  // People carrying no open records at all. Worth calling out so their absence
  // from the open-board charts doesn't read as an oversight.
  const openNames = new Set(data.openBoards.map((b) => b.name));
  const noOpenBoard = data.revenue
    .filter((r) => !openNames.has(r.name))
    .map((r) => r.name);

  const pinned = data.openBoards.filter((b) => b.pinned).map((b) => b.name);

  return {
    firstCallWinRate: c1?.winRate ?? 0,
    secondCallWinRate: c2?.winRate ?? 0,
    thirdCallWinRate: c34?.winRate ?? 0,
    deepCallWinRate: c5?.winRate ?? 0,
    firstCallDropRate: c1?.unreachableRate ?? 0,
    deepCallDropRate: c5?.unreachableRate ?? 0,
    /** Expected value of one record somebody gives up on early. */
    valuePerRecord: Math.round((data.totals.winRate / 100) * data.totals.avgWin),
    chaserName: chaser?.name ?? null,
    chaserCalls: chaser?.maxCalls ?? 0,
    noOpenBoard,
    pinned,
  };
}

/** `A, B and C` — for naming people in a sentence. */
export function listNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Board-by-board read-out
// ---------------------------------------------------------------------------
// One paragraph per arborist, ASSEMBLED FROM THEIR OWN FIGURES rather than
// written by hand. The first version of this report had hand-written commentary,
// which cannot survive a weekly re-upload: the prose would describe last week
// while the numbers described this week, on a page about named people. Every
// sentence and badge below is therefore earned by the data.
//
// Badges are superlatives within the current upload, capped at two per person so
// the strongest thing about each board is what reads first.

export type ReadoutBadge = { label: string; tone: 'good' | 'watch' };

export type BoardReadout = {
  name: string;
  badges: ReadoutBadge[];
  sentences: string[];
};

/** Index of the row holding the max of `pick`, or -1 when nothing qualifies. */
function argMax<T>(rows: readonly T[], pick: (r: T) => number): number {
  let best = -1;
  let bestVal = -Infinity;
  rows.forEach((r, i) => {
    const v = pick(r);
    if (v > bestVal) {
      bestVal = v;
      best = i;
    }
  });
  return bestVal > 0 ? best : -1;
}

export function boardReadouts(data: ScorecardData): BoardReadout[] {
  const rev = data.revenue;
  const boardOf = (name: string) => data.openBoards.find((b) => b.name === name);

  const topEarner = rev[argMax(rev, (r) => r.sold)]?.name;
  const mostWins = rev[argMax(rev, (r) => r.won)]?.name;
  const longestChase = rev[argMax(rev, (r) => r.maxCalls)]?.name;
  // Who earns the biggest SHARE of their money from call three onward — the
  // calls easiest to skip, so worth naming.
  const deepest = rev[argMax(rev, (r) => (r.sold > 0 ? r.deep / r.sold : 0))]?.name;
  const biggestUpside = data.openBoards[
    argMax(data.openBoards, (b) => b.onTheTable)
  ]?.name;
  const coldest = data.openBoards[argMax(data.openBoards, (b) => b.cold30)]?.name;

  return rev.map((r) => {
    const b = boardOf(r.name);
    const badges: ReadoutBadge[] = [];
    const room = () => badges.length < 2;
    // At most ONE flag per person. This page is read by the people it names, and
    // two flags on one board reads as piling on rather than informing.
    const flagged = () => badges.some((x) => x.tone === 'watch');

    if (r.name === topEarner) badges.push({ label: 'Top follow-up earner', tone: 'good' });
    if (r.name === mostWins && room()) {
      badges.push({ label: 'Most follow-up wins', tone: 'good' });
    }
    if (r.name === longestChase && room()) {
      badges.push({ label: 'Longest chase', tone: 'good' });
    }
    if (r.name === deepest && room()) {
      badges.push({ label: 'Wins in the later rounds', tone: 'good' });
    }
    if (!b && room()) {
      badges.push({ label: 'Nothing left open', tone: 'good' });
    }
    if (b?.pinned && room()) {
      badges.push({ label: 'Newest board', tone: 'good' });
    }
    if (r.name === biggestUpside && room() && !flagged()) {
      badges.push({ label: 'Biggest upside', tone: 'watch' });
    }
    if (r.name === coldest && room() && !flagged()) {
      badges.push({ label: 'Cold records to clear', tone: 'watch' });
    }
    // No OPEN record has reached a fifth call — the cadence stops short. Never
    // flagged on a pinned board: brand-new work hasn't had time to get there,
    // so it would be a criticism of the calendar, not the person.
    if (b && b.open > 0 && b.calls.fivePlus === 0 && !b.pinned && room() && !flagged()) {
      badges.push({ label: 'Stops before call five', tone: 'watch' });
    }

    const sentences: string[] = [];

    // 1. What calling back earned them.
    if (r.won > 0) {
      let s = `${usd(r.sold)} from ${r.won} follow-up win${r.won === 1 ? '' : 's'} — ${r.winRate}% of the ${r.followed} records ${r.name} called back.`;
      if (r.deep > 0) {
        s += ` ${usd(r.deep)} of it came on call three or later, across ${r.deepJobs} job${r.deepJobs === 1 ? '' : 's'}.`;
      } else {
        s += ` None of it came on call three or later — that's where the room is.`;
      }
      if (r.maxCalls >= 3) s += ` Longest chase that landed: ${r.maxCalls} calls.`;
      sentences.push(s);
    } else {
      sentences.push(
        `No follow-up wins yet out of ${r.followed} record${r.followed === 1 ? '' : 's'} called back.`,
      );
    }

    // 2. The state of their open board.
    if (!b) {
      sentences.push(
        `Nothing sitting open — the work closes or gets cleared out rather than waiting.`,
      );
    } else {
      sentences.push(
        `${b.open} still open, averaging ${b.avgCalls.toFixed(1)} calls.`,
      );

      // The flags, as one readable sentence rather than a comma-spliced list.
      const flags: string[] = [];
      if (b.underTwo > 0) flags.push(`${b.underTwo} sit under two calls`);
      if (b.droppedAfterOne > 0) {
        // Parenthesised, not comma'd: an internal comma would collide with the
        // list separator below and read as a fourth item.
        flags.push(
          `${b.droppedAfterOne} were dropped after one (${usd(b.onTheTable)} on the table)`,
        );
      }
      if (b.cold30 > 0) {
        flags.push(`${b.cold30} have had no contact in 30+ days`);
      }
      if (flags.length === 1) sentences.push(`${flags[0]}.`);
      else if (flags.length === 2) {
        sentences.push(`${flags[0]} and ${flags[1]}.`);
      } else if (flags.length > 2) {
        // Oxford comma — the items are long enough that it earns its keep.
        sentences.push(
          `${flags.slice(0, -1).join(', ')}, and ${flags[flags.length - 1]}.`,
        );
      }

      if (b.pinned) {
        sentences.push(
          `Nothing here was given up on, so the low call counts mean the work is new rather than abandoned — read this board separately from the others.`,
        );
      } else if (b.calls.fivePlus === 0) {
        sentences.push(
          `No open record on this board has reached a fifth call. Call five still converts at ${data.depthOutcomes.find((d) => d.key === 'c5')?.winRate ?? 0}%, so extending the cadence is the smallest change available.`,
        );
      }
    }

    return { name: r.name, badges, sentences };
  });
}

// ---------------------------------------------------------------------------
// Fallback snapshot
// ---------------------------------------------------------------------------
// Shown when nothing has been uploaded yet, so the page is never blank on a
// fresh deploy. These are the verified figures from the Aug 17, 2026 export —
// the same ones the report was first written against. Once a spreadsheet is
// uploaded this is never read again.

export const FALLBACK_SCORECARD: ScorecardData = {
  meta: {
    windowStart: '2026-07-01T00:00:00.000Z',
    windowEnd: '2026-08-07T19:30:00.000Z',
    asOf: '2026-08-17T12:00:00.000Z',
    sourceFilename: null,
    uploadedBy: null,
    totalRows: 916,
  },
  totals: {
    followed: 553, won: 186, sold: 547674, winRate: 34, avgWin: 2944,
    won3Plus: 66, sold3Plus: 197046, maxCalls: 14, excludedNoFollowup: 363,
    openBoard: 231, droppedAfterOne: 67, onTheTable: 284630,
    // 67 × 34% × $2,944, using the same rounded rate the page shows, so a
    // reader can reproduce it by hand.
    recoverableEstimate: 67000,
    medianDaysPastDue: 23, minDaysPastDue: 9, maxDaysPastDue: 46,
    calledAfterDue: 150, cold30: 38, cold30Value: 192727,
  },
  depthOutcomes: [
    { key: 'c1', label: '1 call', records: 207, won: 77, winRate: 37, unreachable: 67, unreachableRate: 32, sold: 208963 },
    { key: 'c2', label: '2 calls', records: 124, won: 43, winRate: 35, unreachable: 34, unreachableRate: 27, sold: 141666 },
    { key: 'c34', label: '3–4 calls', records: 140, won: 40, winRate: 29, unreachable: 29, unreachableRate: 21, sold: 127492 },
    { key: 'c5', label: '5+ calls', records: 82, won: 26, winRate: 32, unreachable: 15, unreachableRate: 18, sold: 69555 },
  ],
  revenue: [
    { name: 'Clayton T', followed: 24, won: 23, sold: 83528, winRate: 96, maxCalls: 9,
      byDepth: { c1: 14085, c2: 24540, c34: 26932, c5: 17972 },
      jobsByDepth: { c1: 5, c2: 5, c34: 7, c5: 6 }, deep: 44904, deepJobs: 13 },
    { name: 'Ian F', followed: 87, won: 36, sold: 79052, winRate: 41, maxCalls: 8,
      byDepth: { c1: 45318, c2: 9802, c34: 13004, c5: 10927 },
      jobsByDepth: { c1: 16, c2: 10, c34: 6, c5: 4 }, deep: 23931, deepJobs: 10 },
    { name: 'Dave A', followed: 97, won: 20, sold: 68475, winRate: 21, maxCalls: 6,
      byDepth: { c1: 31630, c2: 14229, c34: 6692, c5: 15923 },
      jobsByDepth: { c1: 11, c2: 4, c34: 3, c5: 2 }, deep: 22615, deepJobs: 5 },
    { name: 'Hayden R', followed: 29, won: 28, sold: 61788, winRate: 97, maxCalls: 14,
      byDepth: { c1: 12896, c2: 17613, c34: 21408, c5: 9870 },
      jobsByDepth: { c1: 6, c2: 8, c34: 7, c5: 7 }, deep: 31278, deepJobs: 14 },
    { name: 'Jake T', followed: 64, won: 21, sold: 61660, winRate: 33, maxCalls: 6,
      byDepth: { c1: 44120, c2: 0, c34: 16266, c5: 1274 },
      jobsByDepth: { c1: 14, c2: 0, c34: 5, c5: 2 }, deep: 17540, deepJobs: 7 },
    { name: 'Patrick W', followed: 85, won: 23, sold: 59101, winRate: 27, maxCalls: 6,
      byDepth: { c1: 13798, c2: 5868, c34: 30625, c5: 8809 },
      jobsByDepth: { c1: 7, c2: 5, c34: 8, c5: 3 }, deep: 39434, deepJobs: 11 },
    { name: 'Jacob S', followed: 63, won: 16, sold: 48115, winRate: 25, maxCalls: 8,
      byDepth: { c1: 9761, c2: 24012, c34: 11768, c5: 2573 },
      jobsByDepth: { c1: 8, c2: 4, c34: 3, c5: 1 }, deep: 14341, deepJobs: 4 },
    { name: 'TJ C', followed: 86, won: 15, sold: 43222, winRate: 17, maxCalls: 5,
      byDepth: { c1: 25617, c2: 15399, c34: 0, c5: 2205 },
      jobsByDepth: { c1: 8, c2: 6, c34: 0, c5: 1 }, deep: 2205, deepJobs: 1 },
    { name: 'Alex P', followed: 14, won: 3, sold: 36443, winRate: 21, maxCalls: 3,
      byDepth: { c1: 5446, c2: 30202, c34: 795, c5: 0 },
      jobsByDepth: { c1: 1, c2: 1, c34: 1, c5: 0 }, deep: 795, deepJobs: 1 },
  ],
  openBoards: [
    { name: 'TJ C', pinned: false, open: 56, avgCalls: 1.4,
      calls: { never: 0, one: 41, two: 9, threeFour: 6, fivePlus: 0 },
      underTwo: 41, underTwoPct: 73, droppedAfterOne: 37, onTheTable: 172377,
      recency: { neverTouched: 0, d31plus: 25, d30: 30, d14: 1, d7: 0 },
      cold30: 25, medianDaysSinceCall: 25, medianDaysPastDue: 21.5, calledAfterDue: 2 },
    { name: 'Dave A', pinned: false, open: 53, avgCalls: 2.4,
      calls: { never: 0, one: 22, two: 11, threeFour: 15, fivePlus: 5 },
      underTwo: 22, underTwoPct: 42, droppedAfterOne: 20, onTheTable: 74053,
      recency: { neverTouched: 0, d31plus: 2, d30: 22, d14: 9, d7: 20 },
      cold30: 2, medianDaysSinceCall: 11, medianDaysPastDue: 24, calledAfterDue: 49 },
    { name: 'Ian F', pinned: false, open: 49, avgCalls: 4.7,
      calls: { never: 0, one: 5, two: 7, threeFour: 10, fivePlus: 27 },
      underTwo: 5, underTwoPct: 10, droppedAfterOne: 4, onTheTable: 17765,
      recency: { neverTouched: 0, d31plus: 0, d30: 3, d14: 13, d7: 33 },
      cold30: 0, medianDaysSinceCall: 5, medianDaysPastDue: 22, calledAfterDue: 49 },
    { name: 'Patrick W', pinned: false, open: 46, avgCalls: 2.5,
      calls: { never: 0, one: 8, two: 14, threeFour: 24, fivePlus: 0 },
      underTwo: 8, underTwoPct: 17, droppedAfterOne: 4, onTheTable: 16820,
      recency: { neverTouched: 0, d31plus: 3, d30: 4, d14: 28, d7: 11 },
      cold30: 3, medianDaysSinceCall: 12, medianDaysPastDue: 29, calledAfterDue: 40 },
    { name: 'Jacob S', pinned: false, open: 9, avgCalls: 3.8,
      calls: { never: 0, one: 2, two: 3, threeFour: 2, fivePlus: 2 },
      underTwo: 2, underTwoPct: 22, droppedAfterOne: 2, onTheTable: 3616,
      recency: { neverTouched: 0, d31plus: 4, d30: 0, d14: 1, d7: 4 },
      cold30: 4, medianDaysSinceCall: 12, medianDaysPastDue: 18, calledAfterDue: 4 },
    { name: 'Alex P', pinned: true, open: 15, avgCalls: 1.1,
      calls: { never: 4, one: 5, two: 6, threeFour: 0, fivePlus: 0 },
      underTwo: 9, underTwoPct: 60, droppedAfterOne: 0, onTheTable: 0,
      recency: { neverTouched: 4, d31plus: 3, d30: 2, d14: 6, d7: 0 },
      cold30: 3, medianDaysSinceCall: 13, medianDaysPastDue: 18, calledAfterDue: 5 },
  ],
};
