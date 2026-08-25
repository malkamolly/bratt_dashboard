// ============================================================================
// Collections list — JSON intake
// ============================================================================
// Turns a JSON body into the SAME RawInvoice[] the spreadsheet parser produces,
// then hands it to the same persist step. Nothing about aging, comparison, or
// per-rep attribution is reimplemented here — this file only validates and
// converts.
//
// It exists because the automation reading the daily AR email can see the
// attachment's cell CONTENTS but never its bytes. Without this it has to rebuild
// an .xlsx purely to satisfy a multipart upload, and that round trip (data →
// spreadsheet → parsed back to data) invents failures — date serials, column
// order, sheet names — for no benefit.
//
// This path is strictly SAFER than the file path, because the client sends a
// checksum taken from the report's own grand-total row and we verify it here. A
// silent mis-parse of a spreadsheet has nothing to fail against; a silent
// mis-extraction of JSON fails the checksum and is rejected.
// ============================================================================

import type { RawInvoice } from '@/lib/receivables';

export type JsonIntakeResult =
  | { ok: true; rows: RawInvoice[]; sourceDate: string; rowsRead: number }
  | { ok: false; status: 413 | 422; reason: string };

/** A JSON body big enough to be a mistake. 260 rows is roughly 60 KB, so this
 *  is orders of magnitude of headroom and still well under Vercel's ~4.5 MB
 *  request cap. */
export const JSON_MAX_BYTES = 2 * 1024 * 1024;

/** Money compared in integer cents. Floats do not compare reliably: the client
 *  summing 260 values and us summing the same 260 can differ in the last bit
 *  while both being correct. One cent of slack absorbs that without hiding a
 *  real discrepancy — a genuinely wrong extraction is out by dollars, not by a
 *  hundredth. */
const CENT_TOLERANCE = 1;
const cents = (n: number) => Math.round(n * 100);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Strict ISO date. Deliberately strict: an Excel serial (45890) or a
 *  MM/DD/YYYY string handed to `new Date()` yields a confidently wrong year
 *  rather than an error, and a wrong year silently reshapes every aging bucket.
 *  Rejecting is the only safe answer. */
function strictIsoDate(v: unknown): { ok: true; date: Date | null } | { ok: false } {
  if (v == null || v === '') return { ok: true, date: null };
  if (typeof v !== 'string') return { ok: false };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false };
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { ok: false };
  // Round-trip guard: '2026-02-31' matches the pattern and parses, but to March.
  if (d.toISOString().slice(0, 10) !== v) return { ok: false };
  // Midday UTC so the date can't shift a day under any local-time reading.
  return { ok: true, date: new Date(`${v}T12:00:00Z`) };
}

function finiteNumber(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

/**
 * Validate a JSON intake body and convert it to RawInvoice rows.
 *
 * Returns a failure rather than throwing, so the route can log the reason and
 * answer with the right status. Nothing is persisted by this function at all —
 * a rejected body cannot leave a partial write behind, because no write is
 * reachable from here.
 */
export function rowsFromJsonBody(
  body: unknown,
  bodyBytes: number,
): JsonIntakeResult {
  if (bodyBytes > JSON_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      reason: `Body is ${(bodyBytes / 1024 / 1024).toFixed(2)} MB; the limit is ${JSON_MAX_BYTES / 1024 / 1024} MB.`,
    };
  }
  if (!isPlainObject(body)) {
    return { ok: false, status: 422, reason: 'Body must be a JSON object.' };
  }

  // --- sourceDate: required here, unlike the file path -----------------------
  // The file path can default to today because a person is standing there
  // uploading. An automated job re-pulling yesterday's report has to say which
  // day it is for, or the whole snapshot model is guesswork.
  const sd = strictIsoDate(body.sourceDate);
  if (!sd.ok || sd.date == null) {
    return {
      ok: false,
      status: 422,
      reason: 'sourceDate is required and must be YYYY-MM-DD.',
    };
  }
  const sourceDate = String(body.sourceDate);

  // reportDateRange is accepted and ignored: the report's actual window is
  // derived from the completion dates in the rows, which cannot disagree with
  // itself the way a separately-supplied range can.

  if (!Array.isArray(body.rows)) {
    return { ok: false, status: 422, reason: 'rows must be an array.' };
  }
  if (body.rows.length === 0) {
    return { ok: false, status: 422, reason: 'rows is empty — nothing to import.' };
  }

  // --- rows -----------------------------------------------------------------
  const rows: RawInvoice[] = [];
  for (let i = 0; i < body.rows.length; i++) {
    const r = body.rows[i];
    const at = `rows[${i}]`;
    if (!isPlainObject(r)) {
      return { ok: false, status: 422, reason: `${at} is not an object.` };
    }

    const customer = String(r.customerName ?? '').trim();
    if (!customer) {
      return {
        ok: false,
        status: 422,
        reason: `${at}.customerName is required.`,
      };
    }

    const total = finiteNumber(r.total);
    if (total == null) {
      return {
        ok: false,
        status: 422,
        reason: `${at}.total must be a number, not a string or a formatted amount.`,
      };
    }
    const balance = finiteNumber(r.balance);
    if (balance == null) {
      return {
        ok: false,
        status: 422,
        reason: `${at}.balance must be a number, not a string or a formatted amount.`,
      };
    }

    const completed = strictIsoDate(r.completionDate);
    if (!completed.ok) {
      return {
        ok: false,
        status: 422,
        reason: `${at}.completionDate must be YYYY-MM-DD (got ${JSON.stringify(r.completionDate)}). Excel serials and MM/DD/YYYY are rejected rather than guessed at.`,
      };
    }

    // Accept a number or a string. JSON numbers would silently eat a leading
    // zero, so a string is preferable from the client, but coercing keeps both
    // working.
    const invoiceNumber =
      r.invoiceNumber == null ? '' : String(r.invoiceNumber).trim();

    rows.push({
      invoiceNumber,
      customer,
      total,
      balance,
      completedOn: completed.date,
      // Verbatim. Several comma-separated values in one string is normal here
      // and must not be split — downstream decides what to do with them.
      phone: String(r.customerPhone ?? '').trim(),
      email: String(r.customerEmail ?? '').trim(),
      // Verbatim too, including sentinels like '1_Unassigned Sales'. Mapping to
      // a rep happens downstream in computeReceivables, not at intake.
      soldBy: String(r.soldBy ?? '').trim(),
      segment: segmentOf(r.customerType),
    });
  }

  // --- checksum: the whole point of this path -------------------------------
  // Not advisory. The client reconciles its extraction against the report's own
  // grand-total row before sending; this enforces the same guarantee here, so a
  // half-read attachment is rejected instead of quietly becoming the active
  // report.
  const ck = body.checksum;
  if (!isPlainObject(ck)) {
    return {
      ok: false,
      status: 422,
      reason: 'checksum is required: { rowCount, totalSum, balanceSum }.',
    };
  }
  const expectedRowCount = finiteNumber(ck.rowCount);
  const expectedTotal = finiteNumber(ck.totalSum);
  const expectedBalance = finiteNumber(ck.balanceSum);
  if (expectedRowCount == null || expectedTotal == null || expectedBalance == null) {
    return {
      ok: false,
      status: 422,
      reason:
        'checksum.rowCount, checksum.totalSum and checksum.balanceSum must all be numbers.',
    };
  }

  if (expectedRowCount !== rows.length) {
    return {
      ok: false,
      status: 422,
      reason: `checksum.rowCount mismatch: expected ${expectedRowCount}, computed ${rows.length}.`,
    };
  }

  const computedTotal = rows.reduce((s, r) => s + cents(r.total), 0);
  if (Math.abs(computedTotal - cents(expectedTotal)) > CENT_TOLERANCE) {
    return {
      ok: false,
      status: 422,
      reason: `checksum.totalSum mismatch: expected ${expectedTotal.toFixed(2)}, computed ${(computedTotal / 100).toFixed(2)}.`,
    };
  }

  const computedBalance = rows.reduce((s, r) => s + cents(r.balance), 0);
  if (Math.abs(computedBalance - cents(expectedBalance)) > CENT_TOLERANCE) {
    return {
      ok: false,
      status: 422,
      reason: `checksum.balanceSum mismatch: expected ${expectedBalance.toFixed(2)}, computed ${(computedBalance / 100).toFixed(2)}.`,
    };
  }

  return { ok: true, rows, sourceDate, rowsRead: rows.length };
}

/** Same two values the spreadsheet's Customer Type column carries. Anything
 *  unrecognised is null rather than a guess — a wrong segment shown
 *  confidently is worse than none, because someone would act on it. */
function segmentOf(v: unknown): 'residential' | 'commercial' | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (s.startsWith('resid')) return 'residential';
  if (s.startsWith('comm')) return 'commercial';
  return null;
}
