// ============================================================================
// Scheduled Revenue — the JSON intake
// ============================================================================
// Validation only. This module touches no database and imports nothing that
// does, which is the property that makes every rejection below provably
// non-destructive: the previous snapshot cannot have been altered, because no
// write is reachable until the body has passed.
//
// WHY JSON EXISTS AT ALL
// The scheduled job that refreshes this twice a day reads the export out of a
// mail or drive connector, which exposes a spreadsheet's CONTENTS but not its
// bytes. Rebuilding an .xlsx just to satisfy a file upload would be a lot of
// machinery to produce a file nobody looks at. Sending the rows directly is
// both simpler and safer — see the checksum note below.
//
// THE CHECKSUM IS THE POINT
// A half-read spreadsheet has nothing to fail against: it just quietly imports
// fewer jobs, and the calendar shows a lighter November than reality. A
// half-read extraction fails the checksum and is refused. That is the entire
// reason this path is preferred over uploading a file.
// ============================================================================

import { isIsoDay, type RawJob } from '@/lib/scheduled-revenue';

/** Vercel's request-body ceiling is ~4.5 MB; a day's export is ~300 KB as
 *  JSON. This is a guardrail, not a limit anyone meets. */
export const JSON_MAX_BYTES = 2 * 1024 * 1024;

/** More rows than the company could plausibly have on the board. Stops a
 *  runaway extraction before it becomes a 30 MB payload. */
const MAX_ROWS = 20_000;

export type JsonOutcome =
  | {
      ok: true;
      rows: RawJob[];
      sourceDate: string;
      rowsRead: number;
    }
  | { ok: false; status: 413 | 422; reason: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function bad(reason: string): JsonOutcome {
  return { ok: false, status: 422, reason };
}

/** Money in, as a number. Strings are refused rather than coerced: "1,817.45"
 *  parses to NaN and "1817" to a different figure than intended, and a silent
 *  coercion here is a wrong number on the calendar. */
function money(v: unknown, where: string): number | { err: string } {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v == null || v === '') return 0;
  return { err: `${where}: expected a number, got ${JSON.stringify(v)}` };
}

/**
 * A date field, strictly.
 *
 * An Excel serial (45890) or "09/03/2026" handed to `new Date()` produces a
 * confidently wrong day rather than an error — and a wrong day moves a job to
 * the wrong square, which is the one failure this whole tool exists to prevent.
 * Convert to ISO before sending; anything else is refused.
 */
function day(v: unknown, where: string): string | null | { err: string } {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') {
    return { err: `${where}: expected "YYYY-MM-DD" or null, got ${JSON.stringify(v)}` };
  }
  if (!isIsoDay(v)) {
    return { err: `${where}: "${v}" is not a valid YYYY-MM-DD date` };
  }
  return v;
}

/**
 * Parse and validate a JSON import body.
 *
 * @param body     the already-parsed JSON
 * @param byteSize the raw body's size, measured before parsing so an oversized
 *                 body is a clean 413 rather than a parser blowing up
 */
export function rowsFromJsonBody(body: unknown, byteSize: number): JsonOutcome {
  if (byteSize > JSON_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      reason: `Body is ${(byteSize / 1024 / 1024).toFixed(1)} MB; the limit is ${JSON_MAX_BYTES / 1024 / 1024} MB.`,
    };
  }
  if (!isObj(body)) return bad('Body must be a JSON object.');

  const sourceDate = body.sourceDate;
  if (typeof sourceDate !== 'string' || !isIsoDay(sourceDate)) {
    return bad('sourceDate is required and must be "YYYY-MM-DD".');
  }

  if (!Array.isArray(body.jobs)) {
    return bad('jobs is required and must be an array.');
  }
  const raw = body.jobs;
  if (raw.length === 0) return bad('jobs must not be empty.');
  if (raw.length > MAX_ROWS) {
    return bad(`jobs holds ${raw.length} rows; the limit is ${MAX_ROWS}.`);
  }

  const checksum = body.checksum;
  if (!isObj(checksum)) {
    return bad(
      'checksum is required: { rowCount, subtotalSum }, taken from the export’s own grand-total row.',
    );
  }
  const expectedCount = checksum.rowCount;
  const expectedSum = checksum.subtotalSum;
  if (typeof expectedCount !== 'number' || !Number.isInteger(expectedCount)) {
    return bad('checksum.rowCount is required and must be a whole number.');
  }
  if (typeof expectedSum !== 'number' || !Number.isFinite(expectedSum)) {
    return bad('checksum.subtotalSum is required and must be a number.');
  }

  const rows: RawJob[] = [];
  let sum = 0;

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const where = `jobs[${i}]`;
    if (!isObj(r)) return bad(`${where}: expected an object.`);

    const jobNumber = r.jobNumber;
    // A string, not a number: JSON numbers silently drop a leading zero, and a
    // job number is an identifier, not a quantity.
    if (typeof jobNumber !== 'string' || !jobNumber.trim()) {
      return bad(`${where}.jobNumber is required and must be a non-empty string.`);
    }

    const status = r.status;
    if (typeof status !== 'string' || !status.trim()) {
      return bad(`${where}.status is required (e.g. "Scheduled", "Hold").`);
    }

    const unit = r.businessUnit;
    if (typeof unit !== 'string') {
      return bad(`${where}.businessUnit must be a string.`);
    }

    const subtotal = money(r.subtotal, `${where}.subtotal`);
    if (typeof subtotal !== 'number') return bad(subtotal.err);

    const scheduledDate = day(r.scheduledDate, `${where}.scheduledDate`);
    if (scheduledDate != null && typeof scheduledDate !== 'string') {
      return bad(scheduledDate.err);
    }
    const nextApptDate = day(r.nextApptDate, `${where}.nextApptDate`);
    if (nextApptDate != null && typeof nextApptDate !== 'string') {
      return bad(nextApptDate.err);
    }

    sum += subtotal;

    rows.push({
      jobNumber: jobNumber.trim(),
      status: status.trim(),
      jobType: str(r.jobType),
      campaign: str(r.campaign),
      businessUnit: unit.trim(),
      subtotal,
      scheduledDate,
      nextApptDate,
      appointments: Math.max(
        1,
        typeof r.appointments === 'number' && Number.isFinite(r.appointments)
          ? Math.round(r.appointments)
          : 1,
      ),
      technicians: str(r.technicians),
      address: str(r.address),
      zip: str(r.zip),
    });
  }

  // Compared in cents, with a cent of tolerance for float summation. The whole
  // body is validated first so a mismatch names a real total rather than a
  // partial one.
  if (rows.length !== expectedCount) {
    return bad(
      `checksum.rowCount says ${expectedCount} but ${rows.length} rows were sent.`,
    );
  }
  if (Math.abs(Math.round(sum * 100) - Math.round(expectedSum * 100)) > 1) {
    return bad(
      `checksum.subtotalSum says ${expectedSum.toFixed(2)} but the rows add up to ${sum.toFixed(2)}.`,
    );
  }

  return { ok: true, rows, sourceDate, rowsRead: rows.length };
}

/** An optional free-text field, trimmed. Absent reads as empty, not as an
 *  error — none of these decide a number. */
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
