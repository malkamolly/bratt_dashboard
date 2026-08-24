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
  type ReceivablesData,
  type AgeBucket,
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

export type SummaryBody = {
  ok: true;
  sourceDate: string | null;
  importedAt: string;
  openInvoices: number;
  totalOutstanding: number;
  /** Keyed by the hub's own aging brackets — see AGE_BUCKET_ORDER. */
  buckets: Record<AgeBucket, { count: number; balance: number }>;
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
  const buckets = {} as Record<AgeBucket, { count: number; balance: number }>;
  for (const k of AGE_BUCKET_ORDER) {
    buckets[k] = {
      count: data.byBucket[k]?.count ?? 0,
      balance: data.byBucket[k]?.balance ?? 0,
    };
  }

  const s = data.sinceLast ?? null;

  return {
    ok: true,
    sourceDate: data.meta.sourceDate ?? null,
    importedAt,
    openInvoices: data.totals.invoiceCount,
    totalOutstanding: data.totals.balance,
    buckets,
    delta: s
      ? {
          // The day the report we're comparing against was for; its upload
          // timestamp is the fallback for reports predating sourceDate.
          comparedTo: s.prevUploadedAt ? s.prevUploadedAt.slice(0, 10) : null,
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
