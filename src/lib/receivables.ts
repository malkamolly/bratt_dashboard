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
};

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
};

export type ReceivablesData = {
  meta: {
    asOf: string;
    sourceFilename: string | null;
    uploadedBy: string | null;
    windowStart: string | null;
    windowEnd: string | null;
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
  /** One book per arborist, biggest 61+ balance first. */
  books: ArboristBook[];
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
  opts: { sourceFilename?: string | null; uploadedBy?: string | null } = {},
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
      daysOld,
      bucket,
      urgency: daysOld < 0 ? 'critical' : urgencyOf(daysOld),
      phone: r.phone,
      email: r.email,
      soldBy: displayNameOf(r.soldBy),
      soldByKey: soldByKeyOf(r.soldBy),
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
      `${i.customer} — $${i.balance.toFixed(2)} (${age})`,
      `  invoice ${i.invoiceNumber || '—'}${i.completedOn ? `, completed ${i.completedOn}` : ''}`,
    ];
    if (i.phone) parts.push(`  ${i.phone}`);
    if (i.email) parts.push(`  ${i.email}`);
    return parts.join('\n');
  });
  const callableTotal = callable.reduce((s, i) => s + i.balance, 0);
  return [
    `Open balances — ${book.name}`,
    `${callable.length} invoices, $${callableTotal.toFixed(2)} outstanding`,
    '',
    ...lines,
  ].join('\n');
}
