// ============================================================================
// Collections list — types, parsing, and aging
// ============================================================================
// Pure logic only: no database, no xlsx imports. The upload action parses a
// spreadsheet into RawInvoice rows and hands them to computeReceivables(); the
// pages render whatever ReceivablesData they get. Keeping the maths here means
// the numbers can be reasoned about without a file or a session.
//
// WHAT "AGE" MEANS HERE, because it decides the whole sort order:
// the Job Completed Detail export carries a COMPLETION DATE, not an invoice
// date and not a due date, and it carries no payment terms. So age is measured
// as days since the job was completed. For a tree service that invoices on
// completion the two are usually the same day, but they are not the same field,
// and a customer 40 days past completion on net-30 terms is only 10 days past
// due. Every label in the UI says "since completion" for that reason — don't
// relabel these as days past due without a real due date to back it up.
// ============================================================================

// Pure formatting helper only — keeps this module free of data-layer imports.
import { fmtUsdCents } from '@/lib/format';

/** One row of the "Job Completed Detail" export, already coerced to JS types. */
export type RawInvoice = {
  invoiceNumber: string;
  customer: string;
  /** Invoice total, before payments. */
  total: number;
  /** What's still owed. Rows where this is 0 never reach the report. */
  balance: number;
  completedOn: Date | null;
  phone: string;
  email: string;
  /** The "Sold By" column — a full name, e.g. "Dave Anderson". */
  soldBy: string;
  /**
   * The "Customer Type" column: 'Residential' or 'Commercial'. Older exports
   * didn't carry this column at all, so it can be null — every consumer has to
   * cope with not knowing, rather than guessing a default. Commercial AP runs
   * on its own 60-90 day cycle, so mixing the two hides which balances are
   * genuinely late and which are just how that customer pays.
   */
  segment: Segment | null;
};

/** Residential vs commercial, straight from the export's Customer Type. */
export type Segment = 'residential' | 'commercial';

/** Split of a balance by customer type. `unknown` covers exports taken before
 *  the Customer Type column existed, so the three always sum to the total. */
export type SegmentSplit = Record<
  'residential' | 'commercial' | 'unknown',
  { count: number; balance: number }
>;

/**
 * A balance at or below this isn't worth an arborist's phone call — it's a
 * rounding artifact from a partial payment. These rows stay in the report
 * (they're real money and someone may want to write them off) but they're
 * flagged so they can be shown apart from the actual call list. Without this a
 * 15-cent balance sitting 339 days out lands at the top of someone's list.
 */
export const TRIVIAL_BALANCE = 5;

export const REQUIRED_COLUMNS = [
  'Customer Name',
  'Balance',
  'Completion Date',
] as const;

/** Aging buckets, oldest first — the order they're shown in. */
export type AgeBucket = 'd180plus' | 'd91to180' | 'd61to90' | 'd31to60' | 'd0to30';

export const AGE_BUCKET_ORDER: AgeBucket[] = [
  'd180plus',
  'd91to180',
  'd61to90',
  'd31to60',
  'd0to30',
];

export const AGE_BUCKET_LABELS: Record<AgeBucket, string> = {
  d180plus: '180+ days',
  d91to180: '91–180 days',
  d61to90: '61–90 days',
  d31to60: '31–60 days',
  d0to30: '0–30 days',
};

// A single warm-brown ramp, oldest = darkest, so the aging reads as one scale
// rather than five unrelated categories. Same ramp language as the Follow-Up
// Scorecard; don't swap these for arbitrary browns.
export const AGE_BUCKET_COLORS: Record<AgeBucket, string> = {
  d180plus: '#5A3812',
  d91to180: '#875B28',
  d61to90: '#AE8244',
  d31to60: '#CFA96C',
  d0to30: '#E4CDA2',
};

/**
 * How urgent is this invoice? Drives the badge on each row. The thresholds are
 * deliberately coarse — an arborist needs "call this one today" vs "keep an eye
 * on it", not five shades of worry.
 */
export type Urgency = 'critical' | 'overdue' | 'watch' | 'current';

export function urgencyOf(daysOld: number): Urgency {
  if (daysOld >= 91) return 'critical';
  if (daysOld >= 61) return 'overdue';
  if (daysOld >= 31) return 'watch';
  return 'current';
}

export const URGENCY_LABELS: Record<Urgency, string> = {
  critical: 'Call today',
  overdue: 'Overdue',
  watch: 'Watch',
  current: 'Recent',
};

/** One open invoice as the pages render it. */
export type OpenInvoice = {
  invoiceNumber: string;
  customer: string;
  total: number;
  balance: number;
  /** Completion date as 'YYYY-MM-DD', or null when the export omitted it. */
  completedOn: string | null;
  /** Days between completion and the as-of date. Null-date rows get -1. */
  daysOld: number;
  bucket: AgeBucket;
  urgency: Urgency;
  phone: string;
  email: string;
  /** Display name, First + Last initial, e.g. "Dave A". */
  soldBy: string;
  /** Lowercased first name, the key that matches salespeople.name. */
  soldByKey: string;
  /** Balance at or under TRIVIAL_BALANCE — real, but not worth a call. */
  trivial: boolean;
  /** The export named no salesperson, so UNASSIGNED_OWNER took it on. */
  unassignedInSource: boolean;
  /** Residential or commercial; null when the export omitted Customer Type. */
  segment: Segment | null;
};

/** Everything owed to one arborist. */
export type ArboristBook = {
  /** Display name, e.g. "Dave A". */
  name: string;
  /** Lowercased first name — matches salespeople.name for roster lookup. */
  key: string;
  invoices: OpenInvoice[];
  totalBalance: number;
  invoiceCount: number;
  customerCount: number;
  /**
   * Days since completion on their oldest invoice WORTH CALLING ABOUT —
   * trivial balances are ignored here on purpose. A stray 15-cent remainder
   * from a partial payment would otherwise crown someone the worst collector on
   * the team, which is both wrong and the kind of thing that makes people stop
   * trusting the page.
   */
  oldestDays: number;
  /** Balance sitting 61+ days out — the part that actually needs calls. */
  over60Balance: number;
  /** Invoices at or under TRIVIAL_BALANCE, held out of the call list. */
  trivialCount: number;
  trivialBalance: number;
  byBucket: Record<AgeBucket, { count: number; balance: number }>;
  /** Residential vs commercial within this book. */
  bySegment: SegmentSplit;
};

/**
 * What changed between the previous upload and this one.
 *
 * Computed once, at upload time, against whichever report was active when the
 * new one landed — so it describes exactly those two files and never shifts
 * afterwards. An invoice is matched by invoice number: gone from the list means
 * paid off, a smaller balance means a partial payment, and a number that wasn't
 * there before is newly completed work.
 *
 * `null` on the very first upload, when there is nothing to compare against.
 */
export type SinceLastUpload = {
  /** When the report this is measured against was uploaded. */
  prevUploadedAt: string;
  prevSourceFilename: string | null;
  /** Days between the two uploads, for the "since Tuesday" style label. */
  daysBetween: number;

  /** Invoices that were owing and are now gone from the report entirely. */
  paidInFullCount: number;
  paidInFullAmount: number;
  /** Invoices still listed, but for less than before. */
  partialCount: number;
  /** Only the amount that came IN on those partials, not their balances. */
  partialAmount: number;
  /** paidInFullAmount + partialAmount — the money actually collected. */
  collected: number;

  /** Invoices in the new report that weren't in the old one. */
  newlyBilledCount: number;
  newlyBilledAmount: number;

  /** Invoices whose balance went UP without being new — a correction or an
   *  added charge. Rare, and worth surfacing rather than hiding in the net. */
  increasedCount: number;
  increasedAmount: number;

  /** Invoices that changed hands between arborists. */
  reassignedCount: number;

  /** Invoice count in the previous report, so a caller can state the change in
   *  count as well as in money. */
  previousInvoiceCount: number;
  /** Total outstanding then and now, and the difference. */
  previousBalance: number;
  currentBalance: number;
  netChange: number;

  /** Who collected what, biggest first. Empty when nothing was collected. */
  byArborist: { name: string; key: string; collected: number; count: number }[];

  /** The individual wins, biggest first, capped for display. */
  topPaid: { customer: string; invoiceNumber: string; amount: number; name: string }[];
};

export type ReceivablesData = {
  meta: {
    asOf: string;
    sourceFilename: string | null;
    uploadedBy: string | null;
    windowStart: string | null;
    windowEnd: string | null;
    /**
     * Which day's report this is, 'YYYY-MM-DD' — supplied by the caller, not
     * read from the file. The export carries no "run date", so an automated job
     * re-pulling yesterday's report needs a way to say so. Null on uploads made
     * before this existed.
     */
    sourceDate?: string | null;
    /** Rows read from the file, including the fully-paid ones we dropped. */
    rowsRead: number;
    /** Rows dropped because nothing was owed on them. */
    excludedPaid: number;
    /** Rows dropped because they had no completion date at all. */
    missingDate: number;
  };
  totals: {
    balance: number;
    invoiceCount: number;
    customerCount: number;
    over60Balance: number;
    over90Balance: number;
    /** Oldest invoice worth calling about — trivial balances excluded. */
    oldestDays: number;
    trivialCount: number;
    trivialBalance: number;
  };
  byBucket: Record<AgeBucket, { count: number; balance: number }>;
  /** Residential vs commercial across everything owed. */
  bySegment: SegmentSplit;
  /** One book per arborist, biggest 61+ balance first. */
  books: ArboristBook[];
  /** Movement since the previous upload; null on the first one. */
  sinceLast?: SinceLastUpload | null;
};

// ---------------------------------------------------------------------------
// Coercion helpers
// ---------------------------------------------------------------------------

function toNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  if (!s) return 0;
  // Accounting-style negatives: "(1,234.00)" means -1234.
  const paren = /^\((.*)\)$/.exec(s);
  const n = Number(paren ? `-${paren[1]}` : s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Read the Customer Type cell. Anything not clearly one of the two known values
 * becomes null: an unrecognised segment shown as a confident "Residential" is
 * worse than showing nothing, because someone would act on it.
 */
function toSegment(v: unknown): Segment | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith('resid')) return 'residential';
  if (s.startsWith('comm')) return 'commercial';
  return null;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DD' from a Date, using its calendar day as the export wrote it. */
function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * First Name + Last Initial, per the house naming rule in CLAUDE.md — never a
 * full last name. The export writes full names ("Hayden Roberts-Siros" →
 * "Hayden R"). The service software's unassigned bucket arrives as
 * "1_Unassigned Sales" and similar, which is not a person; it collapses to
 * "Unassigned" so it can be shown as a pile of work needing an owner rather
 * than pretending to be someone's book.
 */
export function displayNameOf(raw: string): string {
  const name = (raw ?? '').trim();
  if (!name) return 'Unassigned';
  if (/unassigned/i.test(name)) return 'Unassigned';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}`;
}

/**
 * The lowercased first name, which is what `salespeople.name` holds and so what
 * a roster lookup matches on. "Unassigned" gets an empty key: there is no
 * roster row to find, and an empty key can never collide with a real arborist.
 */
export function soldByKeyOf(raw: string): string {
  const display = displayNameOf(raw);
  if (display === 'Unassigned') return '';
  return display.split(/\s+/)[0].toLowerCase();
}

/**
 * Where an invoice with no salesperson goes.
 *
 * The service software leaves "Sold By" blank on some jobs, and writes
 * "1_Unassigned Sales" on others. Those invoices used to collect in an
 * "Unassigned" pile that appeared on nobody's personal page — so nobody called
 * them and they simply aged. They go to Brent's book instead: he runs sales, so
 * an orphan account is his by default until someone says otherwise.
 *
 * Expressed as First + Last initial and a roster key rather than a full name,
 * per the house naming rule — the key is what matches salespeople.name.
 *
 * The invoice still carries `unassignedInSource`, so the roll-up can point at
 * the rows the export failed to attribute. Routing them here gets them called;
 * it doesn't pretend the upstream data is right.
 */
export const UNASSIGNED_OWNER = { display: 'Brent B', key: 'brent' } as const;

function segmentSplit(list: OpenInvoice[]): SegmentSplit {
  const out: SegmentSplit = {
    residential: { count: 0, balance: 0 },
    commercial: { count: 0, balance: 0 },
    unknown: { count: 0, balance: 0 },
  };
  for (const i of list) {
    const k = i.segment ?? 'unknown';
    out[k].count += 1;
    out[k].balance += i.balance;
  }
  for (const k of Object.keys(out) as (keyof SegmentSplit)[]) {
    out[k].balance = round2(out[k].balance);
  }
  return out;
}

function emptyBuckets(): Record<AgeBucket, { count: number; balance: number }> {
  return {
    d180plus: { count: 0, balance: 0 },
    d91to180: { count: 0, balance: 0 },
    d61to90: { count: 0, balance: 0 },
    d31to60: { count: 0, balance: 0 },
    d0to30: { count: 0, balance: 0 },
  };
}

export function bucketOf(daysOld: number): AgeBucket {
  if (daysOld >= 181) return 'd180plus';
  if (daysOld >= 91) return 'd91to180';
  if (daysOld >= 61) return 'd61to90';
  if (daysOld >= 31) return 'd31to60';
  return 'd0to30';
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Read the export's grid (row 0 = headers) into typed rows. Returns the
 * required columns it couldn't find, so the upload can refuse a wrong file
 * instead of publishing a page of zeroes.
 */
export function parseInvoiceGrid(grid: unknown[][]): {
  rows: RawInvoice[];
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

  const rows: RawInvoice[] = [];
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const customer = String(at(row, 'Customer Name') ?? '').trim();
    const invoiceNumber = String(at(row, 'Invoice #') ?? '').trim();
    // A row with no customer is not an invoice. This is the guard that drops
    // the export's GRAND TOTAL row, which is genuinely dangerous: it carries a
    // Balance (the sum of every row above it) and puts the row COUNT in the
    // Invoice # column, so parsing it as data silently doubles every figure on
    // the page and invents a giant unassigned account. Every real invoice names
    // a customer, so requiring one is both the simplest and the safest test.
    if (!customer) continue;
    rows.push({
      invoiceNumber,
      customer,
      total: toNumber(at(row, 'Total')),
      balance: toNumber(at(row, 'Balance')),
      completedOn: toDate(at(row, 'Completion Date')),
      phone: String(at(row, 'Customer Phone') ?? '').trim(),
      email: String(at(row, 'Customer Email') ?? '').trim(),
      soldBy: String(at(row, 'Sold By') ?? '').trim(),
      // Optional column: absent in exports taken before it was added, so a
      // missing header reads as null rather than failing the whole upload.
      segment: toSegment(at(row, 'Customer Type')),
    });
  }
  return { rows, missingColumns: [] };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** Whole days between two calendar days, ignoring clock time. */
function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

/**
 * Turn raw export rows into the report both pages read.
 *
 * Rows with a zero (or negative) balance are dropped: the export includes
 * fully-paid jobs, and a collections list that shows them buries the work. The
 * count of what was dropped is reported in meta so the page can say so.
 */
export function computeReceivables(
  rows: RawInvoice[],
  asOf: Date,
  opts: {
    sourceFilename?: string | null;
    uploadedBy?: string | null;
    sourceDate?: string | null;
  } = {},
): ReceivablesData {
  const owing = rows.filter((r) => r.balance > 0.005);
  const excludedPaid = rows.length - owing.length;
  const missingDate = owing.filter((r) => r.completedOn == null).length;

  const invoices: OpenInvoice[] = owing.map((r) => {
    // No completion date means we can't age it. -1 sorts it to the very top
    // rather than hiding it at the bottom: an invoice we can't age is a data
    // problem someone should look at, not a low priority.
    const daysOld = r.completedOn ? Math.max(0, daysBetween(r.completedOn, asOf)) : -1;
    const bucket = daysOld < 0 ? 'd180plus' : bucketOf(daysOld);
    return {
      invoiceNumber: r.invoiceNumber,
      customer: r.customer || '(no customer name)',
      total: r.total,
      balance: r.balance,
      completedOn: r.completedOn ? isoDay(r.completedOn) : null,
      segment: r.segment,
      daysOld,
      bucket,
      urgency: daysOld < 0 ? 'critical' : urgencyOf(daysOld),
      phone: r.phone,
      email: r.email,
      // An empty key is soldByKeyOf's signal that the export named nobody.
      ...(soldByKeyOf(r.soldBy) === ''
        ? {
            soldBy: UNASSIGNED_OWNER.display,
            soldByKey: UNASSIGNED_OWNER.key,
            unassignedInSource: true,
          }
        : {
            soldBy: displayNameOf(r.soldBy),
            soldByKey: soldByKeyOf(r.soldBy),
            unassignedInSource: false,
          }),
      trivial: r.balance <= TRIVIAL_BALANCE,
    };
  });

  // THE sort that the whole request hangs on: oldest at the top. Ties break on
  // the larger balance, so of two invoices the same age the costlier one is
  // called first.
  const byOldest = (a: OpenInvoice, b: OpenInvoice) => {
    if (a.daysOld !== b.daysOld) {
      // -1 (undateable) outranks everything.
      if (a.daysOld < 0) return -1;
      if (b.daysOld < 0) return 1;
      return b.daysOld - a.daysOld;
    }
    return b.balance - a.balance;
  };
  invoices.sort(byOldest);

  const byBucket = emptyBuckets();
  for (const inv of invoices) {
    byBucket[inv.bucket].count += 1;
    byBucket[inv.bucket].balance += inv.balance;
  }

  // Group into one book per arborist. Keyed on display name so "Unassigned"
  // stays its own pile.
  const grouped = new Map<string, OpenInvoice[]>();
  for (const inv of invoices) {
    const list = grouped.get(inv.soldBy);
    if (list) list.push(inv);
    else grouped.set(inv.soldBy, [inv]);
  }

  const books: ArboristBook[] = [...grouped.entries()].map(([name, list]) => {
    const bucketed = emptyBuckets();
    for (const inv of list) {
      bucketed[inv.bucket].count += 1;
      bucketed[inv.bucket].balance += inv.balance;
    }
    return {
      name,
      key: list[0].soldByKey,
      invoices: list, // already oldest-first, inherited from the global sort
      totalBalance: round2(list.reduce((s, i) => s + i.balance, 0)),
      invoiceCount: list.length,
      customerCount: new Set(list.map((i) => i.customer.toLowerCase())).size,
      oldestDays: oldestWorthCalling(list),
      over60Balance: round2(
        list.filter((i) => i.daysOld >= 61 || i.daysOld < 0).reduce((s, i) => s + i.balance, 0),
      ),
      trivialCount: list.filter((i) => i.trivial).length,
      trivialBalance: round2(
        list.filter((i) => i.trivial).reduce((s, i) => s + i.balance, 0),
      ),
      byBucket: roundBuckets(bucketed),
      bySegment: segmentSplit(list),
    };
  });

  // Managers read this list to decide where to spend a collections push, so
  // rank by the money that's actually aged, not by headline total.
  books.sort((a, b) => b.over60Balance - a.over60Balance || b.totalBalance - a.totalBalance);

  const dated = invoices.filter((i) => i.completedOn != null).map((i) => i.completedOn!);

  return {
    meta: {
      asOf: asOf.toISOString(),
      sourceFilename: opts.sourceFilename ?? null,
      uploadedBy: opts.uploadedBy ?? null,
      sourceDate: opts.sourceDate ?? null,
      windowStart: dated.length ? dated.reduce((a, b) => (a < b ? a : b)) : null,
      windowEnd: dated.length ? dated.reduce((a, b) => (a > b ? a : b)) : null,
      rowsRead: rows.length,
      excludedPaid,
      missingDate,
    },
    totals: {
      balance: round2(invoices.reduce((s, i) => s + i.balance, 0)),
      invoiceCount: invoices.length,
      customerCount: new Set(invoices.map((i) => i.customer.toLowerCase())).size,
      over60Balance: round2(
        invoices.filter((i) => i.daysOld >= 61 || i.daysOld < 0).reduce((s, i) => s + i.balance, 0),
      ),
      over90Balance: round2(
        invoices.filter((i) => i.daysOld >= 91 || i.daysOld < 0).reduce((s, i) => s + i.balance, 0),
      ),
      oldestDays: oldestWorthCalling(invoices),
      trivialCount: invoices.filter((i) => i.trivial).length,
      trivialBalance: round2(
        invoices.filter((i) => i.trivial).reduce((s, i) => s + i.balance, 0),
      ),
    },
    byBucket: roundBuckets(byBucket),
    bySegment: segmentSplit(invoices),
    books,
  };
}

/**
 * The oldest age among invoices worth calling about. Falls back to the whole
 * set when every invoice is trivial, so a book of nothing but pennies still
 * reports an honest age rather than 0.
 */
function oldestWorthCalling(list: OpenInvoice[]): number {
  if (list.length === 0) return 0;
  const real = list.filter((i) => !i.trivial);
  const from = real.length ? real : list;
  return Math.max(...from.map((i) => i.daysOld));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundBuckets(
  b: Record<AgeBucket, { count: number; balance: number }>,
): Record<AgeBucket, { count: number; balance: number }> {
  for (const k of AGE_BUCKET_ORDER) b[k].balance = round2(b[k].balance);
  return b;
}

/** The book for one arborist, matched on their roster first name. */
export function bookForKey(
  data: ReceivablesData,
  key: string,
): ArboristBook | null {
  const k = key.trim().toLowerCase();
  if (!k) return null;
  return data.books.find((b) => b.key === k) ?? null;
}

/**
 * Compare two reports and describe what moved.
 *
 * Matching is by invoice number, which is the only stable identifier in the
 * export — customer names get edited and re-typed. An invoice with no number
 * can't be matched at all, so it's ignored here rather than guessed at; those
 * are rare and would otherwise show up as a phantom payment plus a phantom new
 * charge every single upload.
 *
 * Both sides only ever contain invoices that were OWING, since that's what
 * computeReceivables keeps. So "missing from the new report" genuinely means
 * paid off (or voided) — not merely absent.
 */
export function compareReceivables(
  prev: ReceivablesData,
  next: ReceivablesData,
): SinceLastUpload {
  const index = (d: ReceivablesData) => {
    const m = new Map<string, OpenInvoice>();
    for (const b of d.books) {
      for (const i of b.invoices) {
        if (i.invoiceNumber) m.set(i.invoiceNumber, i);
      }
    }
    return m;
  };
  const before = index(prev);
  const after = index(next);

  // Who the EXPORT named, not who ended up holding it.
  //
  // UNASSIGNED_OWNER routes an unattributed invoice into Brent's book, so
  // comparing the final owner reports a reassignment for every orphan the first
  // time that rule is applied to a report predating it — 27 phantom moves on
  // the upload after it shipped, when the export had said the same thing both
  // times. Comparing the source attribution asks the only question that
  // matters: did the service software change its mind about who sold this job?
  //
  // Older payloads have no unassignedInSource flag, but they carried the empty
  // key for the Unassigned pile, so both eras collapse to '' here.
  const sourceOwner = (i: OpenInvoice) =>
    i.unassignedInSource ? '' : i.soldByKey;

  const paid: OpenInvoice[] = [];
  const partials: { inv: OpenInvoice; paid: number }[] = [];
  const increased: { inv: OpenInvoice; added: number }[] = [];
  let reassignedCount = 0;

  for (const [num, was] of before) {
    const now = after.get(num);
    if (!now) {
      paid.push(was);
      continue;
    }
    if (sourceOwner(now) !== sourceOwner(was)) reassignedCount++;
    const delta = was.balance - now.balance;
    if (delta > 0.005) partials.push({ inv: was, paid: delta });
    else if (delta < -0.005) increased.push({ inv: now, added: -delta });
  }

  const newly = [...after.entries()]
    .filter(([num]) => !before.has(num))
    .map(([, inv]) => inv);

  const paidInFullAmount = paid.reduce((s, i) => s + i.balance, 0);
  const partialAmount = partials.reduce((s, p) => s + p.paid, 0);

  // Credit each collection to whoever held the invoice BEFORE it was paid —
  // crediting the new holder would hand a reassigned invoice's win to the wrong
  // person on the one day it changed hands.
  const perArborist = new Map<string, { name: string; key: string; collected: number; count: number }>();
  const credit = (inv: OpenInvoice, amount: number) => {
    const row = perArborist.get(inv.soldByKey) ?? {
      name: inv.soldBy,
      key: inv.soldByKey,
      collected: 0,
      count: 0,
    };
    row.collected += amount;
    row.count += 1;
    perArborist.set(inv.soldByKey, row);
  };
  for (const i of paid) credit(i, i.balance);
  for (const p of partials) credit(p.inv, p.paid);

  const prevBalance = prev.totals.balance;
  const currBalance = next.totals.balance;
  const prevAt = prev.meta.asOf;

  // Every money figure is rounded to cents before it leaves here. Summing
  // floats leaves values like -1746.350000000035, which fmtUsd hides in the UI
  // but the API returns verbatim — and a caller posting that to Slack shows the
  // noise. Round once, at the boundary.
  return {
    prevUploadedAt: prevAt,
    prevSourceFilename: prev.meta.sourceFilename,
    daysBetween: Math.max(
      0,
      daysBetween(new Date(prevAt), new Date(next.meta.asOf)),
    ),
    paidInFullCount: paid.length,
    paidInFullAmount: round2(paidInFullAmount),
    partialCount: partials.length,
    partialAmount: round2(partialAmount),
    collected: round2(paidInFullAmount + partialAmount),
    newlyBilledCount: newly.length,
    newlyBilledAmount: round2(newly.reduce((s, i) => s + i.balance, 0)),
    increasedCount: increased.length,
    increasedAmount: round2(increased.reduce((s, i) => s + i.added, 0)),
    reassignedCount,
    previousInvoiceCount: prev.totals.invoiceCount,
    previousBalance: round2(prevBalance),
    currentBalance: round2(currBalance),
    netChange: round2(currBalance - prevBalance),
    byArborist: [...perArborist.values()]
      .map((a) => ({ ...a, collected: round2(a.collected) }))
      .sort((a, b) => b.collected - a.collected),
    topPaid: paid
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5)
      .map((i) => ({
        customer: i.customer,
        invoiceNumber: i.invoiceNumber,
        amount: round2(i.balance),
        name: i.soldBy,
      })),
  };
}

/**
 * Fill in fields a stored payload predates.
 *
 * Payloads are written once at upload time and read back for as long as they
 * stay active, so a report uploaded before a field existed will be missing that
 * field forever — until someone re-uploads. Reading it then throws, which is
 * exactly what happened when bySegment shipped: the parser handled a missing
 * Customer Type column fine, but nothing handled a stored payload that had no
 * bySegment key at all.
 *
 * So every read goes through here. Adding a field to ReceivablesData means
 * adding its fallback here too — that is the price of storing computed JSON,
 * and it is cheaper than a migration over every historical row.
 */
export function hydrateReceivables(data: ReceivablesData): ReceivablesData {
  const fixInvoice = (i: OpenInvoice): OpenInvoice => ({
    ...i,
    segment: i.segment ?? null,
    unassignedInSource: i.unassignedInSource ?? false,
  });

  const books = (data.books ?? []).map((b) => {
    const invoices = (b.invoices ?? []).map(fixInvoice);
    return {
      ...b,
      invoices,
      bySegment: b.bySegment ?? segmentSplit(invoices),
    };
  });

  return {
    ...data,
    books,
    bySegment: data.bySegment ?? segmentSplit(books.flatMap((b) => b.invoices)),
    sinceLast: data.sinceLast ?? null,
    meta: { ...data.meta, sourceDate: data.meta?.sourceDate ?? null },
  };
}

/** The invoices worth a call, oldest first. */
export function callableInvoices(book: ArboristBook): OpenInvoice[] {
  return book.invoices.filter((i) => !i.trivial);
}

/** The pennies — real balances too small to chase, newest-value first. */
export function trivialInvoices(book: ArboristBook): OpenInvoice[] {
  return book.invoices.filter((i) => i.trivial);
}

/**
 * A plain-text version of one arborist's list, for the "copy all" button — the
 * same affordance the PHC renewals panel offers, so a list can be pasted into a
 * text or an email without retyping it.
 */
export function buildCallListText(book: ArboristBook): string {
  const callable = callableInvoices(book);
  const lines = callable.map((i) => {
    const age = i.daysOld < 0 ? 'no completion date' : `${i.daysOld} days`;
    const parts = [
      `${i.customer} — ${fmtUsdCents(i.balance)} (${age})`,
      `  invoice ${i.invoiceNumber || '—'}${i.completedOn ? `, completed ${i.completedOn}` : ''}`,
    ];
    if (i.unassignedInSource) parts.push('  (no salesperson on the invoice)');
    if (i.phone) parts.push(`  ${i.phone}`);
    if (i.email) parts.push(`  ${i.email}`);
    return parts.join('\n');
  });
  const callableTotal = callable.reduce((s, i) => s + i.balance, 0);
  return [
    `Open balances — ${book.name}`,
    `${callable.length} invoices, ${fmtUsdCents(callableTotal)} outstanding`,
    '',
    // Blank line between records. Pasted into a text or an email, a solid block
    // of names and phone numbers is unreadable; the gap is what makes each
    // customer scannable as its own entry.
    lines.join('\n\n'),
  ].join('\n');
}
