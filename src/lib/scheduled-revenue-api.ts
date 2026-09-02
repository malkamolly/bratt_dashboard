// ============================================================================
// Scheduled Revenue API — auth, rate limiting, logging, response shape
// ============================================================================
// Shared by POST /api/scheduled-revenue/import and
// GET /api/scheduled-revenue/summary. Both are token-only: no session cookie is
// accepted, so a stolen browser session can't reach them and the token is the
// single thing to rotate.
//
// THE TOKEN
// SCHEDULED_REVENUE_TOKEN if it's set, otherwise RECEIVABLES_IMPORT_TOKEN.
// The fallback is deliberate and is the reason this shipped without a Vercel
// change: the collections token already exists and already belongs to the same
// scheduled automation. Setting SCHEDULED_REVENUE_TOKEN later splits the two
// with no code change, which is worth doing if the two jobs ever stop being run
// by the same person.
// ============================================================================

import { createHash, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  UNIT_ORDER,
  UNIT_LABELS,
  STATUS_LABELS,
  PARKED_FROM,
  horizonSplit,
  pastDated,
  addDays,
  workTotal,
  WORK_ORDER,
  round2,
  type BusinessUnit,
  type ScheduledRevenueData,
  type SourcePart,
} from '@/lib/scheduled-revenue';

/** Requests per hour, per caller IP, across both endpoints. The scheduled job
 *  needs two a day; the headroom is for retries and manual checks. */
export const RATE_LIMIT_PER_HOUR = 12;

export type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; body: { error: string } };

/** The token this endpoint expects, or null when neither variable is set. */
export function expectedToken(): string | null {
  return (
    process.env.SCHEDULED_REVENUE_TOKEN ||
    process.env.RECEIVABLES_IMPORT_TOKEN ||
    null
  );
}

/**
 * Bearer-token check, in constant time.
 *
 * Both values are SHA-256'd first, then compared. timingSafeEqual throws when
 * the buffers differ in length, so comparing raw tokens would leak the token's
 * length through that exception. Hashing makes both sides exactly 32 bytes, so
 * one comparison covers every case in fixed time.
 *
 * A missing environment variable is 503, not 401: the endpoint is misconfigured
 * rather than the caller being wrong, and a 401 would send someone hunting for
 * a bad token that was never the problem.
 */
export function authorizeToken(req: NextRequest): AuthResult {
  const expected = expectedToken();
  if (!expected) {
    return { ok: false, status: 503, body: { error: 'endpoint_not_configured' } };
  }

  const header = req.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  if (!timingSafeEqual(a, b)) {
    return { ok: false, status: 401, body: { error: 'unauthorized' } };
  }
  return { ok: true };
}

/** Best-effort caller IP. Behind Vercel this is the client; locally it's
 *  unknown, which simply shares one rate-limit bucket. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export type LogEntry = {
  endpoint: 'import' | 'summary';
  outcome:
    | 'ok'
    | 'unauthorized'
    | 'rate_limited'
    | 'bad_request'
    | 'unsupported'
    | 'too_large'
    | 'unprocessable'
    | 'error';
  statusCode: number;
  clientIp: string;
  sourceDate?: string | null;
  sourceFilename?: string | null;
  rowsRead?: number | null;
  jobCount?: number | null;
  firmRevenue?: number | null;
  reason?: string | null;
  actor?: string | null;
};

/** Record one call. Never throws: a logging failure must not turn a successful
 *  import into a 500, or mask the real error on a failing one. */
export async function logCall(
  supabase: SupabaseClient,
  entry: LogEntry,
): Promise<void> {
  try {
    await supabase.from('scheduled_revenue_import_log').insert({
      endpoint: entry.endpoint,
      outcome: entry.outcome,
      status_code: entry.statusCode,
      client_ip: entry.clientIp,
      source_date: entry.sourceDate ?? null,
      source_filename: entry.sourceFilename ?? null,
      rows_read: entry.rowsRead ?? null,
      job_count: entry.jobCount ?? null,
      firm_revenue: entry.firmRevenue ?? null,
      reason: entry.reason ?? null,
      actor: entry.actor ?? null,
    });
  } catch {
    // Deliberately swallowed — see above.
  }
}

/**
 * True when this caller has used its hourly allowance.
 *
 * Counted from the log table rather than process memory: serverless instances
 * don't share memory, so an in-process counter resets at unpredictable moments
 * and enforces nothing. Fails OPEN — if the count can't be read the request is
 * allowed, because a database hiccup shouldn't stop the scheduled job landing.
 */
export async function isRateLimited(
  supabase: SupabaseClient,
  ip: string,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('scheduled_revenue_import_log')
      .select('id', { count: 'exact', head: true })
      .eq('client_ip', ip)
      .gte('created_at', since);
    if (error) return false;
    return (count ?? 0) >= RATE_LIMIT_PER_HOUR;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The response body
// ---------------------------------------------------------------------------

export type UnitRow = {
  unit: BusinessUnit;
  label: string;
  revenue: number;
  jobs: number;
};

export type Window = {
  revenue: number;
  jobs: number;
  /** Tree crew work only — stump grinding is broken out separately. */
  tree: number;
  phc: number;
  stump: number;
};

export type WeekRow = Window & {
  /** Monday of the week, 'YYYY-MM-DD'. */
  weekOf: string;
};

export type SummaryBody = {
  ok: true;
  sourceDate: string | null;
  importedAt: string;
  /** The day every horizon below is measured from — today in Central, not the
   *  snapshot's own date, so a stale snapshot still reports honest horizons. */
  asOf: string;

  /** What "firm" means, stated in the response so the figure carries its own
   *  definition into whatever channel it gets posted in. */
  counts: 'firm-only';
  firmStatuses: string[];

  /**
   * Every horizon carries the tree-work / PHC split alongside its total.
   *
   * Tree crews, PHC techs and stump grinders are three different sets of
   * people and equipment, so a $30k day of each is nothing alike to whoever is
   * staffing them. `tree + phc + stump === revenue` on every window.
   *
   * NOTE `tree` now EXCLUDES stump grinding, which used to be folded into it.
   */
  /**
   * Capacity placed on calendar days. A multi-day job contributes ONE crew day
   * (subtotal ÷ appointments), so this is what the squares add up to — not the
   * full value of the work. The rest is in `otherCrewDays`.
   */
  onTheBoard: Window;
  next7: Window;
  next30: Window;
  next90: Window;

  /** Firm work still sitting on days that have already passed — scheduled and
   *  never closed out. Not a forecast; a to-do list. */
  pastDated: { revenue: number; jobs: number };

  /**
   * The crew days of multi-day jobs beyond the one date the export gives us.
   * Real sold work that will consume a crew day on a day nobody has told us
   * about. Roughly 8% of the board — worth naming rather than losing.
   */
  otherCrewDays: { revenue: number; jobs: number };
  /**
   * Work waiting on a customer's approval — ServiceTitan status Hold. Kept out
   * of every figure above by design.
   *
   * `onHold` is the same object under the name ServiceTitan uses. Prefer
   * `waitingApproval`: it's what the dashboard says, and a post that disagrees
   * with the screen sends people looking for a number that isn't there.
   */
  waitingApproval: { revenue: number; jobs: number };
  /** @deprecated Use `waitingApproval`. Same numbers. */
  onHold: { revenue: number; jobs: number };
  /**
   * Sold work with no real date, parked on ServiceTitan's far-future
   * placeholder. `parked` is the same object under ServiceTitan's name; prefer
   * `unscheduled`, which is what the dashboard says.
   */
  unscheduled: { revenue: number; jobs: number; parkedFrom: string };
  /** @deprecated Use `unscheduled`. Same numbers. */
  parked: { revenue: number; jobs: number; parkedFrom: string };

  byUnit: UnitRow[];
  byMonth: {
    month: string;
    revenue: number;
    jobs: number;
    tree: number;
    phc: number;
    stump: number;
    holdRevenue: number;
  }[];
  nextWeeks: WeekRow[];

  /**
   * The reports this snapshot was built from.
   *
   * There is normally more than one: ServiceTitan won't SCHEDULE a report that
   * looks out past 365 days, so the far-future parked work arrives separately.
   * One entry here where you expected two means half the board is missing —
   * every checksum would still have passed.
   */
  sources: SourcePart[];

  /** Movement against the previous DAY's snapshot. Null when there is no prior
   *  snapshot — never zeros, which would read as "nothing moved". */
  sinceLast: {
    comparedTo: string | null;
    firmRevenueChange: number;
    holdRevenueChange: number;
    addedJobs: number;
    addedRevenue: number;
    removedJobs: number;
    removedRevenue: number;
  } | null;
};

/** Monday of the week containing `iso`. Weeks start Monday because the crews
 *  do. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sunday
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

/**
 * The response, identical for import and summary so a caller can verify a job
 * landed by re-reading it.
 *
 * `asOf` is passed in rather than read from the clock here, so the two routes
 * and any test agree on what "today" means for one call.
 */
export function buildSummaryBody(
  data: ScheduledRevenueData,
  importedAt: string,
  asOf: string,
): SummaryBody {
  const byUnit: UnitRow[] = UNIT_ORDER.map((u) => {
    let revenue = 0;
    let jobs = 0;
    for (const j of data.jobs) {
      if (j.unit !== u || j.parked || j.status === 'hold') continue;
      // perDay, not subtotal: this has to add up to onTheBoard, which is what
      // the calendar squares add up to.
      revenue += j.perDay;
      jobs++;
    }
    return { unit: u, label: UNIT_LABELS[u], revenue: round2(revenue), jobs };
  }).filter((r) => r.jobs > 0);

  // Eight weeks out is what a production meeting can actually act on; beyond
  // that the month roll-up is the useful shape.
  const firstMonday = weekStart(asOf);
  const nextWeeks: WeekRow[] = [];
  for (let w = 0; w < 8; w++) {
    const from = addDays(firstMonday, w * 7);
    nextWeeks.push({ weekOf: from, ...horizonSplit(data, from, 7) });
  }

  const s = data.sinceLast;

  // Summed from the months rather than the jobs, so it can't drift from what
  // byMonth and the calendar say.
  const boardWork = { tree: 0, phc: 0, stump: 0 };
  for (const m of data.months) {
    for (const w of WORK_ORDER) boardWork[w] += workTotal(m.byWork, w);
  }
  for (const w of WORK_ORDER) boardWork[w] = round2(boardWork[w]);

  const waiting = {
    revenue: data.totals.holdRevenue,
    jobs: data.totals.holdJobs,
  };
  const unscheduled = {
    revenue: data.totals.parkedRevenue,
    jobs: data.totals.parkedJobs,
    parkedFrom: PARKED_FROM,
  };

  return {
    ok: true,
    sourceDate: data.meta.sourceDate ?? null,
    importedAt,
    asOf,

    counts: 'firm-only',
    firmStatuses: [STATUS_LABELS.scheduled, STATUS_LABELS.in_progress],

    onTheBoard: {
      revenue: data.totals.firmRevenue,
      jobs: data.totals.firmJobs,
      ...boardWork,
    },
    next7: horizonSplit(data, asOf, 7),
    next30: horizonSplit(data, asOf, 30),
    next90: horizonSplit(data, asOf, 90),
    pastDated: pastDated(data, asOf),

    // Emitted twice under both vocabularies. Two extra keys cost nothing and
    // remove a whole class of downstream mistake — same reasoning as the
    // balance/total pair on the collections summary.
    otherCrewDays: {
      revenue: data.totals.deferredRevenue,
      jobs: data.totals.deferredJobs,
    },
    waitingApproval: waiting,
    onHold: waiting,
    unscheduled,
    parked: unscheduled,

    byUnit,
    byMonth: data.months.map((m) => ({
      month: m.month,
      revenue: m.firmRevenue,
      jobs: m.firmJobs,
      tree: workTotal(m.byWork, 'tree'),
      phc: workTotal(m.byWork, 'phc'),
      stump: workTotal(m.byWork, 'stump'),
      holdRevenue: m.holdRevenue,
    })),
    nextWeeks,
    sources: data.meta.sources ?? [],

    sinceLast: s
      ? {
          comparedTo:
            s.prevSourceDate ??
            (s.prevUploadedAt ? s.prevUploadedAt.slice(0, 10) : null),
          firmRevenueChange: s.firmRevenueChange,
          holdRevenueChange: s.holdRevenueChange,
          addedJobs: s.addedJobs,
          addedRevenue: s.addedRevenue,
          removedJobs: s.removedJobs,
          removedRevenue: s.removedRevenue,
        }
      : null,
  };
}
