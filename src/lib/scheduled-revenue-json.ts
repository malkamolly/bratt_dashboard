// ============================================================================
// Scheduled Revenue — the JSON intake
// ============================================================================
// Validation only. This module touches no database and imports nothing that
// does, which is the property that makes every rejection below provably
// non-destructive: the previous snapshot cannot have been altered, because no
// write is reachable until the body has passed.
//
// WHY JSON EXISTS AT ALL
// The scheduled job that refreshes this twice a day reads the exports out of a
// mail or drive connector, which exposes a spreadsheet's CONTENTS but not its
// bytes. Rebuilding an .xlsx to satisfy a file upload would be a lot of
// machinery to produce a file nobody looks at.
//
// WHY THERE IS MORE THAN ONE REPORT
// ServiceTitan will only SCHEDULE a report that looks out 365 days. The
// far-future parked work (everything sitting on 01/01/2030) therefore cannot be
// in the same scheduled report as the next twelve months — it needs a second
// one. So a body may carry either a single report or several `parts`, each with
// its OWN checksum taken from its OWN grand-total row.
//
// THE CHECKSUM IS THE POINT
// A half-read spreadsheet has nothing to fail against: it quietly imports fewer
// jobs and the calendar shows a lighter November. A half-read extraction fails
// its checksum and is refused. Per-part checksums matter more here, not less: a
// single combined total would still pass if one whole report never arrived and
// the sender totalled only what it had.
// ============================================================================

import { isIsoDay, type RawJob, type SourcePart } from '@/lib/scheduled-revenue';

/** Vercel's request-body ceiling is ~4.5 MB; both reports together are well
 *  under 400 KB as JSON. A guardrail, not a limit anyone meets. */
export const JSON_MAX_BYTES = 2 * 1024 * 1024;

/** More rows than the company could plausibly have on the board. Stops a
 *  runaway extraction before it becomes a 30 MB payload. */
const MAX_ROWS = 20_000;

/** More reports than anyone should be stitching together by hand. */
const MAX_PARTS = 6;

export type JsonOutcome =
  | {
      ok: true;
      rows: RawJob[];
      sourceDate: string;
      rowsRead: number;
      sources: SourcePart[];
      /** Jobs that appeared in more than one report. The later one wins. */
      duplicatesDropped: number;
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

/** An optional free-text field, trimmed. Absent reads as empty, not as an
 *  error — none of these decide a number. */
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Parse and validate a JSON import body.
 *
 * Accepts either shape:
 *   { sourceDate, checksum, jobs }            one report
 *   { sourceDate, parts: [{ label?, checksum, jobs }, ...] }   several
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

  // Normalise both shapes into a list of parts before validating anything, so
  // there is exactly one validation path rather than two that can drift.
  let rawParts: unknown[];
  if (body.parts !== undefined) {
    if (body.jobs !== undefined) {
      return bad('Send either "parts" or a single "jobs" + "checksum" — not both.');
    }
    if (!Array.isArray(body.parts) || body.parts.length === 0) {
      return bad('parts must be a non-empty array.');
    }
    if (body.parts.length > MAX_PARTS) {
      return bad(`parts holds ${body.parts.length} reports; the limit is ${MAX_PARTS}.`);
    }
    rawParts = body.parts;
  } else {
    rawParts = [{ label: 'report', checksum: body.checksum, jobs: body.jobs }];
  }

  const sources: SourcePart[] = [];
  // Keyed by job number so a job appearing in two reports lands once. The later
  // part wins, which is the useful direction: the parked report is normally
  // sent second and is the more specific claim about a job with no real date.
  const merged = new Map<string, RawJob>();
  let rowsRead = 0;
  let duplicatesDropped = 0;

  for (let pi = 0; pi < rawParts.length; pi++) {
    const part = rawParts[pi];
    const single = rawParts.length === 1;
    if (!isObj(part)) return bad(`parts[${pi}]: expected an object.`);

    const label = str(part.label) || (single ? 'report' : `part ${pi + 1}`);
    const where = single ? '' : `parts[${pi}] (${label}) `;

    const parsed = onePart(part, label, where);
    if (!parsed.ok) return parsed;

    rowsRead += parsed.rows.length;
    for (const r of parsed.rows) {
      if (merged.has(r.jobNumber)) duplicatesDropped++;
      merged.set(r.jobNumber, r);
    }
    sources.push(parsed.source);
  }

  const rows = [...merged.values()];
  if (rows.length === 0) return bad('No jobs were sent.');
  if (rows.length > MAX_ROWS) {
    return bad(`${rows.length} jobs were sent; the limit is ${MAX_ROWS}.`);
  }

  return { ok: true, rows, sourceDate, rowsRead, sources, duplicatesDropped };
}

type PartOutcome =
  | { ok: true; rows: RawJob[]; source: SourcePart }
  | { ok: false; status: 422; reason: string };

/** One report: its rows, checked against its own grand-total row. */
function onePart(
  part: Record<string, unknown>,
  label: string,
  where: string,
): PartOutcome {
  const fail = (reason: string): PartOutcome => ({
    ok: false,
    status: 422,
    reason: `${where}${reason}`,
  });

  if (!Array.isArray(part.jobs)) {
    return fail('jobs is required and must be an array.');
  }
  const raw = part.jobs;
  if (raw.length === 0) return fail('jobs must not be empty.');
  if (raw.length > MAX_ROWS) {
    return fail(`jobs holds ${raw.length} rows; the limit is ${MAX_ROWS}.`);
  }

  const checksum = part.checksum;
  if (!isObj(checksum)) {
    return fail(
      'checksum is required: { rowCount, subtotalSum }, taken from that report’s own grand-total row.',
    );
  }
  const expectedCount = checksum.rowCount;
  const expectedSum = checksum.subtotalSum;
  if (typeof expectedCount !== 'number' || !Number.isInteger(expectedCount)) {
    return fail('checksum.rowCount is required and must be a whole number.');
  }
  if (typeof expectedSum !== 'number' || !Number.isFinite(expectedSum)) {
    return fail('checksum.subtotalSum is required and must be a number.');
  }

  const rows: RawJob[] = [];
  let sum = 0;

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const at = `jobs[${i}]`;
    if (!isObj(r)) return fail(`${at}: expected an object.`);

    const jobNumber = r.jobNumber;
    // A string, not a number: JSON numbers silently drop a leading zero, and a
    // job number is an identifier, not a quantity.
    if (typeof jobNumber !== 'string' || !jobNumber.trim()) {
      return fail(`${at}.jobNumber is required and must be a non-empty string.`);
    }

    const status = r.status;
    if (typeof status !== 'string' || !status.trim()) {
      return fail(`${at}.status is required (e.g. "Scheduled", "Hold").`);
    }

    const unit = r.businessUnit;
    if (typeof unit !== 'string') {
      return fail(`${at}.businessUnit must be a string.`);
    }

    const subtotal = money(r.subtotal, `${at}.subtotal`);
    if (typeof subtotal !== 'number') return fail(subtotal.err);

    const scheduledDate = day(r.scheduledDate, `${at}.scheduledDate`);
    if (scheduledDate != null && typeof scheduledDate !== 'string') {
      return fail(scheduledDate.err);
    }
    const nextApptDate = day(r.nextApptDate, `${at}.nextApptDate`);
    if (nextApptDate != null && typeof nextApptDate !== 'string') {
      return fail(nextApptDate.err);
    }
    const soldOn = day(r.soldOn, `${at}.soldOn`);
    if (soldOn != null && typeof soldOn !== 'string') return fail(soldOn.err);

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
      soldBy: str(r.soldBy),
      soldOn,
    });
  }

  // Compared in cents, with a cent of tolerance for float summation. The whole
  // part is validated first so a mismatch names a real total, not a partial one.
  if (rows.length !== expectedCount) {
    return fail(
      `checksum.rowCount says ${expectedCount} but ${rows.length} rows were sent.`,
    );
  }
  if (Math.abs(Math.round(sum * 100) - Math.round(expectedSum * 100)) > 1) {
    return fail(
      `checksum.subtotalSum says ${expectedSum.toFixed(2)} but the rows add up to ${sum.toFixed(2)}.`,
    );
  }

  return {
    ok: true,
    rows,
    source: {
      label,
      rowCount: rows.length,
      subtotal: Math.round(sum * 100) / 100,
    },
  };
}
