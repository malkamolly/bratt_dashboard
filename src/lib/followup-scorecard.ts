// ============================================================================
// Follow-Through Scorecard data
// ============================================================================
// A point-in-time snapshot, not a live query. Source: the "Open Opportunities"
// export run Aug 17, 2026, filtered to opportunities whose NEXT FOLLOW UP DATE
// fell between Jul 1 and Aug 7, 2026.
//
// Two things about that population matter for reading any number here:
//
//  1. It is NOT the whole book. The follow-up-date filter means these are the
//     records that happened to be due in that five-week window. Totals here are
//     not season sales.
//  2. Of the 916 rows in the export, 363 had ZERO logged follow-ups and no last-
//     follow-up date at all — they sold at the appointment and never needed a
//     call. They are excluded, because including them buries the thing this page
//     is about. Everything below is the 553 records that actually got called back.
//
// When this gets refreshed from a newer export, regenerate the numbers rather
// than editing them by hand, and keep the exclusion rule above the same or the
// figures stop being comparable.
// ============================================================================

/** How many follow-up calls it took to land the job. */
export type CallDepth = 'c1' | 'c2' | 'c34' | 'c5';

export const CALL_DEPTH_LABELS: Record<CallDepth, string> = {
  c1: 'Won on call 1',
  c2: 'Won on call 2',
  c34: 'Won on calls 3–4',
  c5: 'Won on call 5+',
};

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

/** Days since a record was last actually touched, coldest bucket first. */
export type RecencyBucket = 'neverTouched' | 'd31plus' | 'd30' | 'd14' | 'd7';

export const RECENCY_LABELS: Record<RecencyBucket, string> = {
  neverTouched: 'Never touched',
  d31plus: '31+ days',
  d30: '15–30 days',
  d14: '8–14 days',
  d7: '0–7 days',
};

// Same ramp, reused for recency so the whole page speaks one visual language:
// coldest on the left, freshest on the right. `neverTouched` is deliberately not
// on the ramp — nothing happened at all, which is a different kind of fact than
// "a while ago" — so it gets a hatched fill in the component instead.
export const RECENCY_COLORS: Record<Exclude<RecencyBucket, 'neverTouched'>, string> = {
  d31plus: '#CFA96C',
  d30: '#AE8244',
  d14: '#875B28',
  d7: '#5A3812',
};

/** What calling back earned one arborist, and how deep the calls went. */
export type FollowupRevenue = {
  name: string;
  /** Records of theirs that got at least one follow-up. */
  followed: number;
  won: number;
  /** Sold value of those wins, in whole dollars. */
  sold: number;
  /** won / followed, as a whole percent. */
  winRate: number;
  /** Most follow-ups on any single job they won. */
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
   * Shown last and set apart in the charts. Alex P's board is the newest in the
   * company, so his low call counts mean "reached them early", not "gave up" —
   * ranking him against the others on raw counts would read as the opposite.
   */
  pinned: boolean;
  open: number;
  avgCalls: number;
  calls: { never: number; one: number; two: number; threeFour: number; fivePlus: number };
  underTwo: number;
  underTwoPct: number;
  /** Marked Unreachable with one call or fewer on the record. */
  droppedAfterOne: number;
  /** Highest estimate value sitting on those dropped records. */
  onTheTable: number;
  recency: Record<RecencyBucket, number>;
  cold30: number;
  medianDaysSinceCall: number;
  medianDaysPastDue: number;
  /** Records called AFTER their follow-up date passed, without the date moving. */
  calledAfterDue: number;
};

/** Outcome rates by how many calls a record got. */
export type DepthOutcome = {
  label: string;
  records: number;
  won: number;
  winRate: number;
  unreachable: number;
  unreachableRate: number;
};

export const FOLLOWUP_TOTALS = {
  /** Records that got at least one follow-up. The denominator for this page. */
  followed: 553,
  won: 186,
  sold: 547674,
  /** won / followed. Roughly one in three. */
  winRate: 34,
  avgWin: 2944,
  won3Plus: 66,
  sold3Plus: 197046,
  maxCalls: 14,
  /** Zero-follow-up records held out of every figure on this page. */
  excluded: 363,

  // The still-open board (includes the handful never called, since those need a
  // first call rather than a follow-up).
  openBoard: 231,
  droppedAfterOne: 67,
  onTheTable: 284630,
  /** droppedAfterOne × winRate × avgWin, rounded. An estimate, labelled as one. */
  recoverableEstimate: 66000,

  // Follow-up date health.
  medianDaysPastDue: 23,
  minDaysPastDue: 9,
  maxDaysPastDue: 46,
  calledAfterDue: 150,
  cold30: 38,
  cold30Value: 192727,

  windowLabel: 'Jul 1 – Aug 7, 2026',
  runLabel: 'Aug 17, 2026',
} as const;

/** Ordered by sold value, highest first. */
export const FOLLOWUP_REVENUE: readonly FollowupRevenue[] = [
  { name: 'Clayton T', followed: 24, won: 23, sold: 83528, winRate: 96, maxCalls: 9,
    byDepth: { c1: 14085, c2: 24540, c34: 26932, c5: 17972 },
    jobsByDepth: { c1: 5, c2: 5, c34: 7, c5: 6 },
    deep: 44904, deepJobs: 13 },
  { name: 'Ian F', followed: 87, won: 36, sold: 79052, winRate: 41, maxCalls: 8,
    byDepth: { c1: 45318, c2: 9802, c34: 13004, c5: 10927 },
    jobsByDepth: { c1: 16, c2: 10, c34: 6, c5: 4 },
    deep: 23931, deepJobs: 10 },
  { name: 'Dave A', followed: 97, won: 20, sold: 68475, winRate: 21, maxCalls: 6,
    byDepth: { c1: 31630, c2: 14229, c34: 6692, c5: 15923 },
    jobsByDepth: { c1: 11, c2: 4, c34: 3, c5: 2 },
    deep: 22615, deepJobs: 5 },
  { name: 'Hayden R', followed: 29, won: 28, sold: 61788, winRate: 97, maxCalls: 14,
    byDepth: { c1: 12896, c2: 17613, c34: 21408, c5: 9870 },
    jobsByDepth: { c1: 6, c2: 8, c34: 7, c5: 7 },
    deep: 31278, deepJobs: 14 },
  { name: 'Jake T', followed: 64, won: 21, sold: 61660, winRate: 33, maxCalls: 6,
    byDepth: { c1: 44120, c2: 0, c34: 16266, c5: 1274 },
    jobsByDepth: { c1: 14, c2: 0, c34: 5, c5: 2 },
    deep: 17540, deepJobs: 7 },
  { name: 'Patrick W', followed: 85, won: 23, sold: 59101, winRate: 27, maxCalls: 6,
    byDepth: { c1: 13798, c2: 5868, c34: 30625, c5: 8809 },
    jobsByDepth: { c1: 7, c2: 5, c34: 8, c5: 3 },
    deep: 39434, deepJobs: 11 },
  { name: 'Jacob S', followed: 63, won: 16, sold: 48115, winRate: 25, maxCalls: 8,
    byDepth: { c1: 9761, c2: 24012, c34: 11768, c5: 2573 },
    jobsByDepth: { c1: 8, c2: 4, c34: 3, c5: 1 },
    deep: 14341, deepJobs: 4 },
  { name: 'TJ C', followed: 86, won: 15, sold: 43222, winRate: 17, maxCalls: 5,
    byDepth: { c1: 25617, c2: 15399, c34: 0, c5: 2205 },
    jobsByDepth: { c1: 8, c2: 6, c34: 0, c5: 1 },
    deep: 2205, deepJobs: 1 },
  { name: 'Alex P', followed: 14, won: 3, sold: 36443, winRate: 21, maxCalls: 3,
    byDepth: { c1: 5446, c2: 30202, c34: 795, c5: 0 },
    jobsByDepth: { c1: 1, c2: 1, c34: 1, c5: 0 },
    deep: 795, deepJobs: 1 },
];

/**
 * Only the six arborists carrying open records. Clayton T, Hayden R and Jake T
 * have none — their work closes or gets cleared out — so they appear in the
 * revenue chart but have nothing to show on an open-board chart.
 */
export const FOLLOWUP_OPEN_BOARDS: readonly OpenBoard[] = [
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
];

/**
 * The load-bearing finding: the win rate holds roughly flat however many calls
 * a record gets, while the share written off as Unreachable falls by nearly
 * half. Quoted inline throughout the page, so keep these in sync with the copy.
 */
export const FOLLOWUP_DEPTH_OUTCOMES: readonly DepthOutcome[] = [
  { label: '1 call', records: 207, won: 77, winRate: 37, unreachable: 67, unreachableRate: 32 },
  { label: '2 calls', records: 124, won: 43, winRate: 35, unreachable: 34, unreachableRate: 27 },
  { label: '3–4 calls', records: 140, won: 40, winRate: 29, unreachable: 29, unreachableRate: 21 },
  { label: '5+ calls', records: 82, won: 26, winRate: 32, unreachable: 15, unreachableRate: 18 },
];

/** `$1,234` — whole dollars, no cents. Estimate values are never fractional here. */
export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** `$84k` for chart labels, where the exact figure lives in the tooltip. */
export function usdShort(n: number): string {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;
}
