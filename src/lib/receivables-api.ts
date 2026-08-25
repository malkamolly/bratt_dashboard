// ============================================================================
// Collections API — auth, rate limiting, logging, response shape
// ============================================================================
// Shared by POST /api/receivables/import and GET /api/receivables/summary.
// Both are token-only: no session cookie is accepted, so a stolen browser
// session can't reach them and the token is the single thing to rotate.
//
// The token lives in the RECEIVABLES_IMPORT_TOKEN environment variable and is
// never read from the repo. Rotating it is a Vercel env change and a redeploy,
// with no code edit.
// ============================================================================

import { createHash, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AGE_BUCKET_ORDER,
  UNASSIGNED_OWNER,
  type ReceivablesData,
  type AgeBucket,
  type OpenInvoice,
} from '@/lib/receivables';

/** Requests per hour, per caller IP, across both endpoints. A daily job needs
 *  one; the headroom is for retries and manual checks. */
export const RATE_LIMIT_PER_HOUR = 12;

export type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; body: { error: string } };

/**
 * Bearer-token check, in constant time.
 *
 * Both values are SHA-256'd first, then compared. timingSafeEqual throws if the
 * two buffers differ in length, so comparing raw tokens would leak the token's
 * length through that exception — and would need a length check that itself
 * short-circuits. Hashing makes both sides exactly 32 bytes, so one comparison
 * covers every case in fixed time.
 *
 * A missing environment variable is 503, not 401: the endpoint is misconfigured
 * rather than the caller being wrong, and returning 401 would send someone
 * hunting for a bad token that was never the problem. It reveals nothing — an
 * attacker learns only that the endpoint isn't set up.
 */
export function authorizeToken(req: NextRequest): AuthResult {
  const expected = process.env.RECEIVABLES_IMPORT_TOKEN;
  if (!expected) {
    return {
      ok: false,
      status: 503,
      body: { error: 'endpoint_not_configured' },
    };
  }

  const header = req.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  // An empty presented token still hashes to 32 bytes, so this is a real
  // comparison rather than a short-circuit — no separate "is it missing" branch.
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
  invoiceCount?: number | null;
  totalBalance?: number | null;
  reason?: string | null;
  actor?: string | null;
};

/**
 * Record one call. Never throws: a logging failure must not turn a successful
 * import into a 500, and must not mask the real error on a failing one.
 */
export async function logCall(
  supabase: SupabaseClient,
  entry: LogEntry,
): Promise<void> {
  try {
    await supabase.from('receivables_import_log').insert({
      endpoint: entry.endpoint,
      outcome: entry.outcome,
      status_code: entry.statusCode,
      client_ip: entry.clientIp,
      source_date: entry.sourceDate ?? null,
      source_filename: entry.sourceFilename ?? null,
      rows_read: entry.rowsRead ?? null,
      invoice_count: entry.invoiceCount ?? null,
      total_balance: entry.totalBalance ?? null,
      reason: entry.reason ?? null,
      actor: entry.actor ?? null,
    });
  } catch {
    // Deliberately swallowed — see above.
  }
}

/**
 * True when this caller has already used its hourly allowance.
 *
 * Counted from the log table rather than process memory: serverless instances
 * don't share memory, so an in-process counter resets at unpredictable moments
 * and enforces nothing. Fails OPEN — if the count can't be read, the request is
 * allowed, because a database hiccup shouldn't stop the daily job from landing.
 */
export async function isRateLimited(
  supabase: SupabaseClient,
  ip: string,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('receivables_import_log')
      .select('id', { count: 'exact', head: true })
      .eq('client_ip', ip)
      .gte('created_at', since);
    if (error) return false;
    return (count ?? 0) >= RATE_LIMIT_PER_HOUR;
  } catch {
    return false;
  }
}

/**
 * The age at which a balance is treated as past due in these responses.
 *
 * Bratt Tree's terms are DUE ON COMPLETION, so the export's completion date is
 * the due date and this really is days past due — no hedge needed. The response
 * still states its basis and terms explicitly, because a figure that lands in a
 * public channel should carry its own definition rather than rely on whoever
 * reads it remembering the terms.
 */
const PAST_DUE_DAYS = 30;

function allInvoices(data: ReceivablesData): OpenInvoice[] {
  return (data.books ?? []).flatMap((b) => b.invoices ?? []);
}

/** Invoices more than PAST_DUE_DAYS past due. An invoice with no completion
 *  date has daysOld -1 and is NOT counted — with no completion date there is no
 *  due date either, so it can't be aged. Reported separately, not dropped. */
function pastDue(list: OpenInvoice[]) {
  const aged = list.filter((i) => i.daysOld > PAST_DUE_DAYS);
  return {
    count: aged.length,
    total: round2(aged.reduce((s, i) => s + i.balance, 0)),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type RepRow = {
  /**
   * Our roster key (lowercased first name), NOT a ServiceTitan user id — the
   * export has no id column, only a "Sold By" name. 'unassigned' is defined
   * here for completeness but is not currently emitted; see byRep below.
   */
  repId: string;
  /** First name + last initial, per the house naming rule. Deliberately not
   *  the full ServiceTitan name — see the note in the API docs. */
  repName: string;
  collectedCount: number;
  collectedTotal: number;
  openPastDue30Count: number;
  openPastDue30Total: number;
};

export type SummaryBody = {
  ok: true;
  sourceDate: string | null;
  importedAt: string;
  openInvoices: number;
  totalOutstanding: number;
  /**
   * Keyed by the hub's own aging brackets — see AGE_BUCKET_ORDER.
   *
   * `balance` and `total` are the same number under two names. The dashboard
   * calls it balance; callers of this API asked for total. Emitting both costs
   * nothing and removes a whole class of downstream mistake, which is worth
   * more here than avoiding one redundant key.
   */
  buckets: Record<AgeBucket, { count: number; balance: number; total: number }>;
  /** The headline figure for the Slack post: balances more than 30 days past
   *  due. Terms are due-on-completion, so this is genuine lateness. */
  pastDue30: { count: number; total: number };
  /** What the ages measure, and the terms that make it so. Stated in the
   *  response so the figure carries its own definition. */
  basis: 'days-past-due';
  terms: 'due-on-completion';
  /** Invoices with no completion date at all — excluded from pastDue30 because
   *  they can't be aged. Surfaced rather than dropped so totals reconcile. */
  undated: { count: number; total: number };
  /**
   * Invoices the export left without a salesperson. They are NOT bucketed under
   * a synthetic "unassigned" rep: the dashboard routes them into one book so
   * they actually get called, and the Slack post has to agree with what that
   * person sees on their own page. Reported here so the count is never hidden.
   */
  unassignedInSource: { count: number; total: number; routedTo: string };
  collectedSinceLast: {
    count: number;
    total: number;
    comparedTo: string | null;
    /** The count above includes partial payments. These split it, because
     *  "closed" and "paid something" are different claims. */
    paidInFullCount: number;
    partialCount: number;
  } | null;
  byRep: RepRow[];
  delta: {
    comparedTo: string | null;
    openInvoices: number;
    totalOutstanding: number;
    collected: number;
    paidInFull: number;
    partial: number;
    newlyBilled: number;
    newlyBilledAmount: number;
  } | null;
};

/**
 * The response body, identical for import and summary so a caller can verify a
 * job landed by re-reading it.
 *
 * `delta` is null when there is no prior report, never a set of zeros — zeros
 * say "nothing moved", which is a different and wrong claim.
 */
export function buildSummaryBody(
  data: ReceivablesData,
  importedAt: string,
): SummaryBody {
  const buckets = {} as Record<
    AgeBucket,
    { count: number; balance: number; total: number }
  >;
  for (const k of AGE_BUCKET_ORDER) {
    const bal = data.byBucket[k]?.balance ?? 0;
    buckets[k] = {
      count: data.byBucket[k]?.count ?? 0,
      balance: bal,
      total: bal,
    };
  }

  const s = data.sinceLast ?? null;
  const invoices = allInvoices(data);
  const undatedList = invoices.filter((i) => i.daysOld < 0);
  const orphans = invoices.filter((i) => i.unassignedInSource);

  // Per-rep rows are the union of "collected something" and "still holds aged
  // money" — a rep who collected but has nothing open still deserves the
  // shout-out, and one holding aged money with no collections still needs to
  // appear. Keyed on the roster key, which is the same key bookForKey uses to
  // put a book on that person's roster page, so the two cannot disagree.
  const byRepMap = new Map<string, RepRow>();
  for (const b of data.books ?? []) {
    const aged = pastDue(b.invoices ?? []);
    byRepMap.set(b.key || UNASSIGNED_OWNER.key, {
      repId: b.key || UNASSIGNED_OWNER.key,
      repName: b.name,
      collectedCount: 0,
      collectedTotal: 0,
      openPastDue30Count: aged.count,
      openPastDue30Total: aged.total,
    });
  }
  for (const a of s?.byArborist ?? []) {
    const id = a.key || UNASSIGNED_OWNER.key;
    const row = byRepMap.get(id) ?? {
      repId: id,
      repName: a.name,
      collectedCount: 0,
      collectedTotal: 0,
      openPastDue30Count: 0,
      openPastDue30Total: 0,
    };
    row.collectedCount = a.count;
    row.collectedTotal = a.collected;
    byRepMap.set(id, row);
  }

  return {
    ok: true,
    sourceDate: data.meta.sourceDate ?? null,
    importedAt,
    openInvoices: data.totals.invoiceCount,
    totalOutstanding: data.totals.balance,
    buckets,
    pastDue30: pastDue(invoices),
    basis: 'days-past-due',
    terms: 'due-on-completion',
    undated: {
      count: undatedList.length,
      total: round2(undatedList.reduce((acc, i) => acc + i.balance, 0)),
    },
    unassignedInSource: {
      count: orphans.length,
      total: round2(orphans.reduce((acc, i) => acc + i.balance, 0)),
      routedTo: UNASSIGNED_OWNER.display,
    },
    collectedSinceLast: s
      ? {
          count: s.paidInFullCount + s.partialCount,
          total: s.collected,
          // The day the previous snapshot was FOR, falling back to when it was
          // uploaded for reports predating sourceDate.
          comparedTo:
            s.prevSourceDate ??
            (s.prevUploadedAt ? s.prevUploadedAt.slice(0, 10) : null),
          paidInFullCount: s.paidInFullCount,
          partialCount: s.partialCount,
        }
      : null,
    byRep: [...byRepMap.values()],
    delta: s
      ? {
          comparedTo:
            s.prevSourceDate ??
            (s.prevUploadedAt ? s.prevUploadedAt.slice(0, 10) : null),
          openInvoices: data.totals.invoiceCount - s.previousInvoiceCount,
          totalOutstanding: s.netChange,
          collected: s.collected,
          paidInFull: s.paidInFullCount,
          partial: s.partialCount,
          newlyBilled: s.newlyBilledCount,
          newlyBilledAmount: s.newlyBilledAmount,
        }
      : null,
  };
}
