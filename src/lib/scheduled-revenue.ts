// ============================================================================
// Scheduled Revenue — the maths
// ============================================================================
// Pure functions only. No Supabase, no Next.js, no I/O — so the numbers on the
// calendar can be reasoned about (and tested) without a session or a database.
// The I/O lives in scheduled-revenue-import.ts and scheduled-revenue-data.ts.
//
// WHAT THIS IS FOR
// ServiceTitan will happily show you what's on the schedule. It will not tell
// you what a day is WORTH. This turns the "(Claude) Scheduled Revenue" export
// (one row per job: subtotal + scheduled date) into a per-day, per-month view
// of booked production revenue we can look forward into.
//
// THREE PILES, AND WHY THEY ARE SEPARATE
//   FIRM    — everything that isn't on hold. This is the number on the
//             calendar. Scheduled and In Progress both mean the truck is
//             going.
//   HOLD    — jobs sitting at status "Hold". Deliberately NOT in any daily
//             revenue figure: a held job is on the board but not committed, and
//             folding it into a forecast quietly inflates every day it touches.
//             It is surfaced as its own list so it can be worked, not hidden.
//   PARKED  — jobs dated on the far-future placeholder date (see PARKED_FROM).
//             Sold work with no real date on it. Left off the calendar because
//             one square holding six figures is noise, not information.
// Nothing is dropped. Every dollar in the export lands in exactly one pile, and
// the three sum to the export's grand total.
// ============================================================================

/** 'YYYY-MM-DD'. */
export type IsoDay = string;

/**
 * Jobs scheduled on or after this date are treated as PARKED rather than
 * calendar work.
 *
 * ServiceTitan has no "someday" state, so work with no real date gets an
 * appointment far in the future — in our data, 01/01/2030, which is also the
 * far end of the report's own date range. Ninety-nine jobs and $157K sat on
 * that one square in the first export we looked at.
 *
 * This is a convention, not a law. If the placeholder date ever moves, this
 * constant is the only line to change.
 */
export const PARKED_FROM: IsoDay = '2030-01-01';

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export type JobStatus = 'scheduled' | 'in_progress' | 'hold' | 'other';

export const STATUS_LABELS: Record<JobStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  hold: 'Hold',
  other: 'Other',
};

/**
 * Map the export's Status text onto ours.
 *
 * Anything unrecognised becomes 'other' and still counts as FIRM. That is the
 * deliberate direction to fail in: if ServiceTitan adds a status like
 * "Dispatched" tomorrow, a day silently losing revenue is far worse than a day
 * counting something it shouldn't. Hold is the only carve-out, because it's the
 * only one we were asked to hold back.
 */
export function toStatus(raw: unknown): JobStatus {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'hold' || s.startsWith('hold')) return 'hold';
  if (s === 'scheduled') return 'scheduled';
  if (s.startsWith('in progress') || s === 'inprogress') return 'in_progress';
  return 'other';
}

/**
 * Cancelled work is dropped from the report entirely rather than piled
 * anywhere. It isn't revenue under any reading, and leaving it in would make a
 * day's total disagree with what dispatch sees on the board.
 */
export function isCancelled(raw: unknown): boolean {
  return /cancel/i.test(String(raw ?? ''));
}

/** Does this status count toward a day's revenue? Everything except Hold. */
export function isFirm(status: JobStatus): boolean {
  return status !== 'hold';
}

// ---------------------------------------------------------------------------
// Business units
// ---------------------------------------------------------------------------

export type BusinessUnit =
  | 'residential'
  | 'commercial'
  | 'municipal'
  | 'phc'
  | 'other';

export const UNIT_ORDER: readonly BusinessUnit[] = [
  'residential',
  'commercial',
  'municipal',
  'phc',
  'other',
] as const;

export const UNIT_LABELS: Record<BusinessUnit, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  municipal: 'Municipal',
  phc: 'Plant Health Care',
  other: 'Other',
};

/** Short enough for a filter chip. */
export const UNIT_SHORT: Record<BusinessUnit, string> = {
  residential: 'Res',
  commercial: 'Comm',
  municipal: 'Muni',
  phc: 'PHC',
  other: 'Other',
};

/** Split-bar fills, taken from the brand palette (tailwind.config.ts) so the
 *  legend sits inside the design system rather than beside it. Orange is left
 *  out on purpose — it's the call-to-action colour everywhere else. */
export const UNIT_COLORS: Record<BusinessUnit, string> = {
  residential: '#72BB32', // green
  commercial: '#005679', // teal navy
  municipal: '#A35817', // wood warm
  phc: '#0096AA', // teal
  other: '#BE9A64', // sand
};

export function toUnit(raw: unknown): BusinessUnit {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'other';
  if (s.includes('plant health') || s.includes('phc')) return 'phc';
  if (s.includes('commercial')) return 'commercial';
  if (s.includes('municipal')) return 'municipal';
  if (s.includes('residential')) return 'residential';
  return 'other';
}

export function isBusinessUnit(v: unknown): v is BusinessUnit {
  return typeof v === 'string' && (UNIT_ORDER as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Row + report shapes
// ---------------------------------------------------------------------------

/** One job as it comes out of the export (or the JSON intake), pre-aggregation. */
export type RawJob = {
  jobNumber: string;
  status: string;
  jobType: string;
  campaign: string;
  businessUnit: string;
  subtotal: number;
  /** 'YYYY-MM-DD', or null when the export left it blank. */
  scheduledDate: IsoDay | null;
  nextApptDate: IsoDay | null;
  appointments: number;
  /** Verbatim from the export — full names. Shortened at compute time. */
  technicians: string;
  address: string;
  zip: string;
  /** Verbatim from the export — a full name. Shortened at compute time. */
  soldBy: string;
  /** 'YYYY-MM-DD', or null when the export left it blank. */
  soldOn: IsoDay | null;
};

/** One job as the page reads it. Names are already house-style. */
export type ScheduledJob = {
  jobNumber: string;
  status: JobStatus;
  /** The export's own wording, kept so an unfamiliar status is still legible. */
  statusRaw: string;
  jobType: string;
  campaign: string;
  unit: BusinessUnit;
  subtotal: number;
  date: IsoDay | null;
  appointments: number;
  /** First name + last initial, house rule. Never a full surname. */
  crew: string[];
  /** The salesperson, first name + last initial. Never a full surname. */
  soldBy: string;
  /** The day it was sold. How long a job has been waiting is often the whole
   *  story on a held or parked one. */
  soldOn: IsoDay | null;
  city: string;
  zip: string;
  /** True when this job sits on the far-future placeholder date. */
  parked: boolean;
};

export type UnitTotals = Record<BusinessUnit, number>;

export function emptyUnitTotals(): UnitTotals {
  return { residential: 0, commercial: 0, municipal: 0, phc: 0, other: 0 };
}

/** One square on the calendar. */
export type DayTotals = {
  date: IsoDay;
  /** Everything that isn't on hold. This is the number shown on the square. */
  firmRevenue: number;
  firmJobs: number;
  /** Held work landing on this day. Shown as a footnote, never added in. */
  holdRevenue: number;
  holdJobs: number;
  /** Firm revenue split by business unit. Sums to firmRevenue. */
  byUnit: UnitTotals;
  /** Job counts to match byUnit. Kept alongside the dollars rather than
   *  derived on the page, so a unit-filtered square can say "6 jobs" instead of
   *  the whole day's count — which is the wrong number under a filter. */
  jobsByUnit: UnitTotals;
};

export type MonthTotals = {
  /** 'YYYY-MM'. */
  month: string;
  firmRevenue: number;
  firmJobs: number;
  holdRevenue: number;
  holdJobs: number;
  byUnit: UnitTotals;
  jobsByUnit: UnitTotals;
  /** Calendar days in the month with firm revenue on them. */
  workingDays: number;
};

export type ScheduledRevenueTotals = {
  firmRevenue: number;
  firmJobs: number;
  holdRevenue: number;
  holdJobs: number;
  parkedRevenue: number;
  parkedJobs: number;
  /** firm + hold + parked. Reconciles with the export's grand total. */
  allRevenue: number;
  allJobs: number;
  /** Jobs carrying no dollars — sign posting, clam pick-ups, and the like. */
  zeroDollarJobs: number;
  /** Jobs the export left with no scheduled date at all. */
  undatedJobs: number;
  undatedRevenue: number;
  /** Cancelled rows dropped on the way in. */
  cancelledDropped: number;
};

/** Day-over-day movement against the previous snapshot. */
export type SinceLast = {
  prevSourceDate: IsoDay | null;
  prevUploadedAt: string | null;
  firmRevenueChange: number;
  holdRevenueChange: number;
  /** Jobs on the board now that weren't on the previous snapshot. */
  addedJobs: number;
  addedRevenue: number;
  /** Jobs on the previous snapshot that are gone now (done, or cancelled). */
  removedJobs: number;
  removedRevenue: number;
};

export type ScheduledRevenueMeta = {
  generatedAt: string;
  sourceFilename: string | null;
  uploadedBy: string | null;
  /** The day the report is FOR. */
  sourceDate: IsoDay | null;
  /** Earliest / latest real (non-parked) scheduled date in the export. */
  windowStart: IsoDay | null;
  windowEnd: IsoDay | null;
  /** Rows read before cancelled rows were dropped. */
  rowsRead: number;
  /**
   * The reports this snapshot was built from, in the order they arrived.
   *
   * There is normally more than one. ServiceTitan will only SCHEDULE a report
   * that looks out 365 days, so the far-future parked work has to come from a
   * second report — and a snapshot missing half its input should say so on the
   * page rather than quietly showing a lighter board.
   */
  sources: SourcePart[];
};

/** One report that fed a snapshot. */
export type SourcePart = {
  label: string;
  rowCount: number;
  subtotal: number;
};

export type ScheduledRevenueData = {
  meta: ScheduledRevenueMeta;
  jobs: ScheduledJob[];
  days: DayTotals[];
  months: MonthTotals[];
  totals: ScheduledRevenueTotals;
  sinceLast: SinceLast | null;
};

// ---------------------------------------------------------------------------
// Cell coercion
// ---------------------------------------------------------------------------

export function toNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  if (!s) return 0;
  // Accounting-style negatives: "(1,234.00)" means -1234.
  const paren = /^\((.*)\)$/.exec(s);
  const n = Number(paren ? `-${paren[1]}` : s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * A spreadsheet cell to 'YYYY-MM-DD'.
 *
 * SheetJS is read with cellDates, so a real date arrives as a Date and we take
 * its calendar day exactly as the export wrote it — no timezone shifting, which
 * would move a job to the wrong square for anyone west of the server.
 *
 * A string is only accepted in the two shapes ServiceTitan actually emits.
 * Handing an unknown format to `new Date()` produces a confidently wrong day
 * rather than an error, and a wrong day is exactly the failure this tool exists
 * to prevent — so anything else reads as "no date".
 */
export function toIsoDay(v: unknown): IsoDay | null {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const s = String(v ?? '').trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (us) {
    const p = (n: string) => n.padStart(2, '0');
    return `${us[3]}-${p(us[1])}-${p(us[2])}`;
  }
  return null;
}

export function isIsoDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * First name + last initial, per the house naming rule in CLAUDE.md — we never
 * render a full surname anywhere. The export writes full names
 * ("Sean-Paul McCutchen" → "Sean-Paul M"), and its unassigned bucket arrives as
 * "**Unassigned Tree Crew", which is not a person and collapses to
 * "Unassigned" so a job with no crew reads as work needing an owner.
 */
export function shortName(raw: string): string {
  const name = (raw ?? '').replace(/^\*+/, '').trim();
  if (!name) return 'Unassigned';
  if (/unassigned/i.test(name)) return 'Unassigned';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts.slice(0, -1).join(' ')} ${last.charAt(0).toUpperCase()}`;
}

/** "2189 Mississippi Circle, New Brighton, MN 55112 USA" → "New Brighton". */
export function cityOf(address: string): string {
  const parts = (address ?? '').split(',').map((p) => p.trim());
  return parts.length >= 2 ? parts[1] : '';
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Parsing the export
// ---------------------------------------------------------------------------

/** Columns the report is useless without. */
export const REQUIRED_COLUMNS = [
  'Job #',
  'Status',
  'Business Unit',
  'Jobs Subtotal',
  'Scheduled Date',
] as const;

/**
 * The grand-total row ServiceTitan writes at the bottom of the export, if it's
 * there. Genuinely dangerous to parse as data: it carries the SUM of every row
 * above it in the subtotal column and the ROW COUNT in the Job # column, so
 * reading it as a job doubles the company's booked revenue in one go.
 *
 * It's also the best checksum we get for free, so it's returned rather than
 * silently skipped — see rowsFromSpreadsheet.
 */
export type GrandTotal = { rowCount: number | null; subtotal: number };

export function parseJobGrid(grid: unknown[][]): {
  rows: RawJob[];
  missingColumns: string[];
  grandTotal: GrandTotal | null;
  cancelledDropped: number;
  /** Dollars on the cancelled rows. The export's footer totals them, so the
   *  checksum has to add them back to reconcile. */
  cancelledSubtotal: number;
} {
  if (grid.length < 2) {
    return {
      rows: [],
      missingColumns: [...REQUIRED_COLUMNS],
      grandTotal: null,
      cancelledDropped: 0,
      cancelledSubtotal: 0,
    };
  }

  const header = (grid[0] ?? []).map((h) => String(h ?? '').trim());
  const colOf = new Map<string, number>();
  header.forEach((h, i) => {
    if (h && !colOf.has(h)) colOf.set(h, i);
  });

  const missingColumns = REQUIRED_COLUMNS.filter((c) => !colOf.has(c));
  if (missingColumns.length) {
    return {
      rows: [],
      missingColumns,
      grandTotal: null,
      cancelledDropped: 0,
      cancelledSubtotal: 0,
    };
  }

  const at = (row: unknown[], name: string): unknown => {
    const i = colOf.get(name);
    return i == null ? '' : row[i];
  };

  const rows: RawJob[] = [];
  let grandTotal: GrandTotal | null = null;
  let cancelledDropped = 0;
  let cancelledSubtotal = 0;

  for (let i = 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const status = String(at(row, 'Status') ?? '').trim();
    const unit = String(at(row, 'Business Unit') ?? '').trim();
    const date = toIsoDay(at(row, 'Scheduled Date'));
    const subtotal = toNumber(at(row, 'Jobs Subtotal'));

    // The grand-total row: no status, no business unit, no date, but a number
    // in the subtotal column. Every real job carries a status, so this test
    // can't swallow one.
    if (!status && !unit && !date) {
      if (subtotal !== 0) {
        const count = toNumber(at(row, 'Job #'));
        grandTotal = {
          rowCount: Number.isInteger(count) && count > 0 ? count : null,
          subtotal,
        };
      }
      continue;
    }

    if (isCancelled(status)) {
      cancelledDropped++;
      cancelledSubtotal += subtotal;
      continue;
    }

    rows.push({
      jobNumber: String(at(row, 'Job #') ?? '').trim(),
      status,
      jobType: String(at(row, 'Job Type') ?? '').trim(),
      campaign: String(at(row, 'Job Campaign') ?? '').trim(),
      businessUnit: unit,
      subtotal,
      scheduledDate: date,
      nextApptDate: toIsoDay(at(row, 'Next Appt Start Date')),
      appointments: Math.max(1, Math.round(toNumber(at(row, 'Total Appointments'))) || 1),
      technicians: String(at(row, 'Assigned Technicians') ?? '').trim(),
      address: String(at(row, 'Location Address') ?? '').trim(),
      zip: String(at(row, 'Location Zip') ?? '').trim(),
      // Optional columns: absent in exports taken before they were added, so a
      // missing header reads as blank rather than failing the whole import.
      soldBy: String(at(row, 'Sold By') ?? '').trim(),
      soldOn: toIsoDay(at(row, 'Sold On')),
    });
  }

  return {
    rows,
    missingColumns: [],
    grandTotal,
    cancelledDropped,
    cancelledSubtotal: round2(cancelledSubtotal),
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Raw rows to the report the page reads.
 *
 * One pass builds the job list; a second folds the firm and held jobs into days
 * and months. Parked jobs are in `jobs` (so the parked panel can list them) but
 * are deliberately absent from `days` and `months` — they have no real date to
 * sit on.
 */
export function computeScheduledRevenue(
  rows: RawJob[],
  generatedAt: Date,
  opts: {
    sourceFilename?: string | null;
    uploadedBy?: string | null;
    sourceDate?: IsoDay | null;
    cancelledDropped?: number;
    rowsRead?: number;
    sources?: SourcePart[];
  } = {},
): ScheduledRevenueData {
  const jobs: ScheduledJob[] = rows.map((r) => {
    const date = r.scheduledDate;
    return {
      jobNumber: r.jobNumber,
      status: toStatus(r.status),
      statusRaw: r.status,
      jobType: r.jobType,
      campaign: r.campaign,
      unit: toUnit(r.businessUnit),
      subtotal: round2(r.subtotal),
      date,
      appointments: r.appointments,
      crew: crewList(r.technicians),
      soldBy: r.soldBy ? shortName(r.soldBy) : '',
      soldOn: r.soldOn ?? null,
      city: cityOf(r.address),
      zip: r.zip,
      parked: date != null && date >= PARKED_FROM,
    };
  });

  const dayMap = new Map<IsoDay, DayTotals>();
  const monthMap = new Map<string, MonthTotals & { dayset: Set<IsoDay> }>();

  const totals: ScheduledRevenueTotals = {
    firmRevenue: 0,
    firmJobs: 0,
    holdRevenue: 0,
    holdJobs: 0,
    parkedRevenue: 0,
    parkedJobs: 0,
    allRevenue: 0,
    allJobs: jobs.length,
    zeroDollarJobs: 0,
    undatedJobs: 0,
    undatedRevenue: 0,
    cancelledDropped: opts.cancelledDropped ?? 0,
  };

  let windowStart: IsoDay | null = null;
  let windowEnd: IsoDay | null = null;

  for (const j of jobs) {
    totals.allRevenue += j.subtotal;
    if (j.subtotal === 0) totals.zeroDollarJobs++;

    if (j.parked) {
      totals.parkedJobs++;
      totals.parkedRevenue += j.subtotal;
      continue;
    }

    if (!j.date) {
      totals.undatedJobs++;
      totals.undatedRevenue += j.subtotal;
      continue;
    }

    if (!windowStart || j.date < windowStart) windowStart = j.date;
    if (!windowEnd || j.date > windowEnd) windowEnd = j.date;

    const day =
      dayMap.get(j.date) ??
      {
        date: j.date,
        firmRevenue: 0,
        firmJobs: 0,
        holdRevenue: 0,
        holdJobs: 0,
        byUnit: emptyUnitTotals(),
        jobsByUnit: emptyUnitTotals(),
      };
    const monthKey = j.date.slice(0, 7);
    const month =
      monthMap.get(monthKey) ??
      {
        month: monthKey,
        firmRevenue: 0,
        firmJobs: 0,
        holdRevenue: 0,
        holdJobs: 0,
        byUnit: emptyUnitTotals(),
        jobsByUnit: emptyUnitTotals(),
        workingDays: 0,
        dayset: new Set<IsoDay>(),
      };

    if (isFirm(j.status)) {
      day.firmRevenue += j.subtotal;
      day.firmJobs++;
      day.byUnit[j.unit] += j.subtotal;
      day.jobsByUnit[j.unit]++;
      month.firmRevenue += j.subtotal;
      month.firmJobs++;
      month.byUnit[j.unit] += j.subtotal;
      month.jobsByUnit[j.unit]++;
      totals.firmRevenue += j.subtotal;
      totals.firmJobs++;
      if (j.subtotal > 0) month.dayset.add(j.date);
    } else {
      day.holdRevenue += j.subtotal;
      day.holdJobs++;
      month.holdRevenue += j.subtotal;
      month.holdJobs++;
      totals.holdRevenue += j.subtotal;
      totals.holdJobs++;
    }

    dayMap.set(j.date, day);
    monthMap.set(monthKey, month);
  }

  // Round once, at the end. Rounding each addition compounds the error; leaving
  // it unrounded surfaces float noise like 384430.80000000005 on the page.
  for (const d of dayMap.values()) {
    d.firmRevenue = round2(d.firmRevenue);
    d.holdRevenue = round2(d.holdRevenue);
    for (const u of UNIT_ORDER) d.byUnit[u] = round2(d.byUnit[u]);
  }
  const months: MonthTotals[] = [...monthMap.values()]
    .map(({ dayset, ...m }) => ({
      ...m,
      firmRevenue: round2(m.firmRevenue),
      holdRevenue: round2(m.holdRevenue),
      byUnit: Object.fromEntries(
        UNIT_ORDER.map((u) => [u, round2(m.byUnit[u])]),
      ) as UnitTotals,
      jobsByUnit: m.jobsByUnit,
      workingDays: dayset.size,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  for (const k of [
    'firmRevenue',
    'holdRevenue',
    'parkedRevenue',
    'allRevenue',
    'undatedRevenue',
  ] as const) {
    totals[k] = round2(totals[k]);
  }

  return {
    meta: {
      generatedAt: generatedAt.toISOString(),
      sourceFilename: opts.sourceFilename ?? null,
      uploadedBy: opts.uploadedBy ?? null,
      sourceDate: opts.sourceDate ?? null,
      windowStart,
      windowEnd,
      rowsRead: opts.rowsRead ?? rows.length,
      sources: opts.sources ?? [],
    },
    jobs,
    days: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    months,
    totals,
    sinceLast: null,
  };
}

/** "Taylor Mueller, Shay Spritzer" → ["Taylor M", "Shay S"]. */
export function crewList(raw: string): string[] {
  const names = (raw ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)
    .map(shortName);
  // The export sometimes repeats a name across appointments on the same job.
  return [...new Set(names)];
}

// ---------------------------------------------------------------------------
// Tree work vs. Plant Health Care
// ---------------------------------------------------------------------------
// The split that matters day to day: PHC runs on its own techs and its own
// trucks, so a $30k day made of tree work and a $30k day made of PHC are two
// completely different days for the people building the schedule. Everything
// that isn't PHC is "tree work" — residential, commercial, municipal, and
// whatever unit ServiceTitan invents next, which is the right default: a new
// unit showing up under tree work is a mild mislabel, whereas one silently
// vanishing from the day's total is a wrong number.

/** Everything that isn't Plant Health Care. */
export function treeTotal(byUnit: UnitTotals | undefined): number {
  if (!byUnit) return 0;
  let n = 0;
  for (const u of UNIT_ORDER) {
    if (u === 'phc') continue;
    n += byUnit[u] ?? 0;
  }
  return round2(n);
}

/** The PHC half of the same split. */
export function phcTotal(byUnit: UnitTotals | undefined): number {
  return round2(byUnit?.phc ?? 0);
}

// ---------------------------------------------------------------------------
// Filtering a list
// ---------------------------------------------------------------------------

/**
 * Does this job match a free-text filter?
 *
 * One box across everything someone would plausibly type: a job number, a job
 * type, a salesperson, a crew member, a city, a zip, a status. Deliberately not
 * a set of dropdowns — the lists are worked by people looking for one thing
 * they can already name, and a dropdown per field is five clicks to do what
 * typing "stump" does.
 *
 * Multiple words must ALL match (somewhere), so "stump edina" narrows rather
 * than widens.
 */
export function jobMatches(j: ScheduledJob, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = [
    j.jobNumber,
    j.jobType,
    j.campaign,
    j.statusRaw,
    j.soldBy,
    j.city,
    j.zip,
    UNIT_LABELS[j.unit],
    ...j.crew,
  ]
    .join(' ')
    .toLowerCase();
  return terms.every((t) => hay.includes(t));
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * What moved between two snapshots.
 *
 * Jobs are matched on job number, so "added" means genuinely new to the board
 * rather than merely re-dated. A job that moved from October to November is in
 * neither list — its money never left, and reporting it as both added and
 * removed would double-count the movement.
 */
export function compareScheduledRevenue(
  prev: ScheduledRevenueData,
  next: ScheduledRevenueData,
): SinceLast {
  const prevJobs = new Map(prev.jobs.map((j) => [j.jobNumber, j]));
  const nextJobs = new Map(next.jobs.map((j) => [j.jobNumber, j]));

  let addedJobs = 0;
  let addedRevenue = 0;
  for (const [num, j] of nextJobs) {
    if (!prevJobs.has(num)) {
      addedJobs++;
      addedRevenue += j.subtotal;
    }
  }

  let removedJobs = 0;
  let removedRevenue = 0;
  for (const [num, j] of prevJobs) {
    if (!nextJobs.has(num)) {
      removedJobs++;
      removedRevenue += j.subtotal;
    }
  }

  return {
    prevSourceDate: prev.meta.sourceDate ?? null,
    prevUploadedAt: prev.meta.generatedAt ?? null,
    firmRevenueChange: round2(next.totals.firmRevenue - prev.totals.firmRevenue),
    holdRevenueChange: round2(next.totals.holdRevenue - prev.totals.holdRevenue),
    addedJobs,
    addedRevenue: round2(addedRevenue),
    removedJobs,
    removedRevenue: round2(removedRevenue),
  };
}

// ---------------------------------------------------------------------------
// Reading the report
// ---------------------------------------------------------------------------

/**
 * Firm revenue in the window [from, from + days), for one unit or all.
 *
 * Computed on READ rather than baked into the payload, on purpose: a horizon is
 * relative to today, and a "next 30 days" figure frozen at import time is
 * quietly wrong by the following morning.
 */
export function horizon(
  data: ScheduledRevenueData,
  from: IsoDay,
  days: number,
  unit?: BusinessUnit | null,
): { revenue: number; jobs: number } {
  const to = addDays(from, days);
  let revenue = 0;
  let jobs = 0;
  for (const d of data.days) {
    if (d.date < from || d.date >= to) continue;
    revenue += unit ? d.byUnit[unit] : d.firmRevenue;
    jobs += unit ? (d.jobsByUnit?.[unit] ?? 0) : d.firmJobs;
  }
  return { revenue: round2(revenue), jobs };
}

/**
 * The same window as horizon(), split into tree work and PHC.
 *
 * Separate from horizon() rather than folded into it because most callers want
 * one number, and a function that always returns four invites reading the wrong
 * one. Unfiltered by unit on purpose: the split IS the filter.
 */
export function horizonSplit(
  data: ScheduledRevenueData,
  from: IsoDay,
  days: number,
): { revenue: number; jobs: number; tree: number; phc: number } {
  const to = addDays(from, days);
  let revenue = 0;
  let jobs = 0;
  let tree = 0;
  let phc = 0;
  for (const d of data.days) {
    if (d.date < from || d.date >= to) continue;
    revenue += d.firmRevenue;
    jobs += d.firmJobs;
    tree += treeTotal(d.byUnit);
    phc += phcTotal(d.byUnit);
  }
  return {
    revenue: round2(revenue),
    jobs,
    tree: round2(tree),
    phc: round2(phc),
  };
}

/** Calendar arithmetic on 'YYYY-MM-DD' strings, in UTC so DST can't shift it. */
export function addDays(iso: IsoDay, n: number): IsoDay {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Firm revenue already on the board for days before `from` — work that was
 *  scheduled and hasn't been closed out. Worth seeing; not a forecast. */
export function pastDated(
  data: ScheduledRevenueData,
  from: IsoDay,
): { revenue: number; jobs: number } {
  let revenue = 0;
  let jobs = 0;
  for (const d of data.days) {
    if (d.date >= from) continue;
    revenue += d.firmRevenue;
    jobs += d.firmJobs;
  }
  return { revenue: round2(revenue), jobs };
}

/**
 * Fill in fields a payload written before they existed is missing.
 *
 * Snapshots are stored as JSON, so an old row is frozen in the shape it had
 * when it was written. Every read goes through here so a page added later can
 * rely on its fields being present rather than crashing on a stored report.
 */
export function hydrateScheduledRevenue(
  raw: ScheduledRevenueData,
): ScheduledRevenueData {
  return {
    ...raw,
    jobs: raw.jobs ?? [],
    days: (raw.days ?? []).map((d) => ({
      ...d,
      jobsByUnit: d.jobsByUnit ?? emptyUnitTotals(),
    })),
    months: (raw.months ?? []).map((m) => ({
      ...m,
      jobsByUnit: m.jobsByUnit ?? emptyUnitTotals(),
    })),
    totals: { ...blankTotals(), ...(raw.totals ?? {}) },
    sinceLast: raw.sinceLast ?? null,
    meta: { ...raw.meta, sources: raw.meta?.sources ?? [] },
  };
}

function blankTotals(): ScheduledRevenueTotals {
  return {
    firmRevenue: 0,
    firmJobs: 0,
    holdRevenue: 0,
    holdJobs: 0,
    parkedRevenue: 0,
    parkedJobs: 0,
    allRevenue: 0,
    allJobs: 0,
    zeroDollarJobs: 0,
    undatedJobs: 0,
    undatedRevenue: 0,
    cancelledDropped: 0,
  };
}
