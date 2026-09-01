// ============================================================================
// Scheduled Revenue — the one import path
// ============================================================================
// Both ways a report arrives go through here: the uploader on
// /production/revenue-calendar and POST /api/scheduled-revenue/import. That is the
// whole point of this file — two callers that "should behave the same" drift
// the moment each holds its own copy of the logic.
//
// It stays I/O-shaped: get rows, hand them to the pure maths in
// lib/scheduled-revenue.ts, write one row. No arithmetic is repeated here.
//
//   rowsFromSpreadsheet()          bytes -> RawJob[]   (file upload, UI + API)
//   rowsFromJsonBody()             JSON  -> RawJob[]   (scheduled-revenue-json)
//   persistScheduledRevenueReport() rows -> the active report
//
// Everything that decides a NUMBER lives in the last stage, which both intakes
// share, so the two routes cannot report different figures from the same data.
//
// The Supabase client is passed IN rather than created here, because the two
// callers legitimately differ: the UI runs as a signed-in user and should be
// held to that user's RLS policy, while the API route has no session and needs
// the service-role client.
// ============================================================================

import * as XLSX from 'xlsx';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeScheduledRevenue,
  compareScheduledRevenue,
  hydrateScheduledRevenue,
  parseJobGrid,
  round2,
  type RawJob,
  type ScheduledRevenueData,
  type SourcePart,
} from '@/lib/scheduled-revenue';

/**
 * Vercel caps a serverless request body at ~4.5 MB, so the API path cannot
 * honour the 15 MB the UI allows — a bigger file fails at the platform before
 * our code runs, which surfaces as a confusing 500 rather than a clean 413.
 * The real export is ~80 KB, so this is a guardrail, not a limit anyone meets.
 */
export const API_MAX_BYTES = 4 * 1024 * 1024;

/** The UI posts through a server action, which has no such body cap. */
export const UI_MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_EXTENSIONS = ['.xlsx', '.xlsm', '.csv'];

/** Refresh every page that reads the active report, so neither import path can
 *  forget one. Lives here because a 'use server' module may only export async
 *  functions. */
export function revalidateScheduledRevenue(): void {
  revalidatePath('/production/revenue-calendar');
}

export type ImportOutcome =
  | {
      ok: true;
      data: ScheduledRevenueData;
      rowsRead: number;
      sourceDate: string;
      importedAt: string;
    }
  | {
      ok: false;
      /** Maps straight onto the HTTP status the API returns. The UI ignores it
       *  and shows `reason`. */
      status: 415 | 413 | 422 | 500;
      reason: string;
    };

export function looksLikeSpreadsheet(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((e) => lower.endsWith(e));
}

/** Today in America/Chicago as 'YYYY-MM-DD'. The business is in the Twin
 *  Cities, and a UTC "today" is already tomorrow for a 7:30pm run. */
export function centralToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which saves reassembling the parts.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export type RowsOutcome =
  | {
      ok: true;
      rows: RawJob[];
      cancelledDropped: number;
      source: SourcePart;
    }
  | { ok: false; status: 415 | 413 | 422; reason: string };

/**
 * Spreadsheet bytes to rows. Stage one of the file path.
 *
 * Reads and writes nothing in the database, so every rejection here is
 * inherently safe: the previous report is untouched because no write is
 * reachable from this function.
 */
export function rowsFromSpreadsheet(opts: {
  bytes: Buffer;
  filename: string;
  maxBytes: number;
}): RowsOutcome {
  const { bytes, filename, maxBytes } = opts;

  if (bytes.byteLength === 0) {
    return { ok: false, status: 422, reason: 'The file is empty.' };
  }
  if (bytes.byteLength > maxBytes) {
    return {
      ok: false,
      status: 413,
      reason: `File is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB; the limit is ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
    };
  }
  if (!looksLikeSpreadsheet(filename)) {
    return {
      ok: false,
      status: 415,
      reason: `Unsupported file type. Expected one of ${ALLOWED_EXTENSIONS.join(', ')}.`,
    };
  }

  // SheetJS rather than exceljs: ServiceTitan's export is slightly non-standard
  // and exceljs refuses it (same reason as the PHC, Follow-Up and collections
  // uploads). cellDates gives a real Date for Scheduled Date, which every
  // square on the calendar rests on.
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: 'buffer', cellDates: true });
  } catch {
    return {
      ok: false,
      status: 422,
      reason:
        'Could not read that file — is it the (Claude) Scheduled Revenue export?',
    };
  }

  // The data is on the first sheet; the second sheet ("Filters") carries the
  // report parameters and is not what we want.
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    return { ok: false, status: 422, reason: 'That workbook has no sheets.' };
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  const { rows, missingColumns, grandTotal, cancelledDropped, cancelledSubtotal } =
    parseJobGrid(grid);

  if (missingColumns.length) {
    return {
      ok: false,
      status: 422,
      reason: `missing column${missingColumns.length === 1 ? '' : 's'}: ${missingColumns.join(', ')}`,
    };
  }
  if (rows.length === 0) {
    return { ok: false, status: 422, reason: 'No job rows found in that file.' };
  }

  // The export's own grand-total row is a free checksum, so use it. A partially
  // downloaded or hand-trimmed file will disagree with its own footer, and
  // catching that here is the difference between a refused import and a
  // calendar quietly missing a week's work. Absent footer -> nothing to check.
  if (grandTotal) {
    // Cancelled rows are dropped above but ARE counted in the footer, so they
    // are added back before comparing. One cent of tolerance for float
    // summation.
    const summed = round2(
      rows.reduce((s, r) => s + r.subtotal, 0) + cancelledSubtotal,
    );
    const expected = round2(grandTotal.subtotal);
    if (Math.abs(summed - expected) > 0.01) {
      return {
        ok: false,
        status: 422,
        reason: `The file's own total says $${expected.toFixed(2)} but its rows add up to $${summed.toFixed(2)}. That usually means a partial download — re-export and try again.`,
      };
    }
    const readCount = rows.length + cancelledDropped;
    if (grandTotal.rowCount != null && grandTotal.rowCount !== readCount) {
      return {
        ok: false,
        status: 422,
        reason: `The file's own total row counts ${grandTotal.rowCount} jobs but ${readCount} were read. That usually means a partial download — re-export and try again.`,
      };
    }
  }

  return {
    ok: true,
    rows,
    cancelledDropped,
    source: {
      label: filename,
      rowCount: rows.length,
      subtotal: round2(rows.reduce((s, r) => s + r.subtotal, 0)),
    },
  };
}

/**
 * Several spreadsheets, merged into one set of rows.
 *
 * There is normally more than one. ServiceTitan will only SCHEDULE a report
 * that looks out 365 days, so the far-future parked work has to come from a
 * second report. Each file is validated against its OWN grand-total row first,
 * then merged — a job appearing in two files lands once, with the later file
 * winning (the parked report is the more specific claim about a job that has no
 * real date).
 *
 * Still no database access, so a rejection anywhere leaves the previous
 * snapshot exactly where it was.
 */
export type MergedRowsOutcome =
  | {
      ok: true;
      rows: RawJob[];
      cancelledDropped: number;
      sources: SourcePart[];
      /** Jobs that appeared in more than one file. The later one wins. */
      duplicatesDropped: number;
    }
  | { ok: false; status: 415 | 413 | 422; reason: string };

export function rowsFromSpreadsheets(
  files: { bytes: Buffer; filename: string }[],
  maxBytes: number,
): MergedRowsOutcome {
  const merged = new Map<string, RawJob>();
  const sources: SourcePart[] = [];
  let cancelledDropped = 0;
  let duplicatesDropped = 0;

  for (const f of files) {
    const parsed = rowsFromSpreadsheet({
      bytes: f.bytes,
      filename: f.filename,
      maxBytes,
    });
    if (!parsed.ok) {
      // Name the file, or a two-file import fails with no clue which half.
      return files.length > 1
        ? { ok: false, status: parsed.status, reason: `${f.filename}: ${parsed.reason}` }
        : parsed;
    }
    cancelledDropped += parsed.cancelledDropped;
    for (const r of parsed.rows) {
      if (merged.has(r.jobNumber)) duplicatesDropped++;
      merged.set(r.jobNumber, r);
    }
    sources.push(parsed.source);
  }

  return {
    ok: true,
    rows: [...merged.values()],
    cancelledDropped,
    sources,
    duplicatesDropped,
  };
}

/**
 * Rows to the active report. Stage two, shared by EVERY intake.
 *
 * Nothing is written until the rows have passed every check, so a rejected
 * import leaves the previous snapshot exactly where it was.
 *
 * SNAPSHOTS AND WHY sourceDate DECIDES THE COMPARISON.
 *
 * Each import writes a whole new payload and retires the previous active row —
 * jobs live inside one JSON blob, never as appended rows — so re-running the
 * same data cannot double-count anything.
 *
 * The comparison is against the most recent snapshot for a DIFFERENT
 * sourceDate, and any existing snapshot for the same date is retired. That is
 * what makes twice-daily runs safe: the 7:30pm import replaces the 6:30am one
 * and both report movement against YESTERDAY. The trade-off is deliberate — you
 * do not get an intra-day delta, and a stable day-over-day figure is the more
 * useful of the two.
 *
 * Retired rows are kept rather than deleted: a mistaken import stays
 * recoverable by flipping is_active back, and nothing reads them meanwhile.
 */
export async function persistScheduledRevenueReport(opts: {
  rows: RawJob[];
  sourceDate: string;
  uploadedBy: string;
  /** Filename for a file upload, or a label like 'json:cowork' for JSON. */
  sourceLabel: string;
  cancelledDropped?: number;
  /** The reports this snapshot was built from. Recorded so the page can say so
   *  when one of them is missing. */
  sources?: SourcePart[];
  supabase: SupabaseClient;
}): Promise<ImportOutcome> {
  const { rows, sourceDate, uploadedBy, sourceLabel, supabase } = opts;
  const importedAtDate = new Date();
  const data = computeScheduledRevenue(rows, importedAtDate, {
    sourceFilename: sourceLabel,
    uploadedBy,
    sourceDate,
    cancelledDropped: opts.cancelledDropped ?? 0,
    rowsRead: rows.length,
    sources: opts.sources ?? [
      {
        label: sourceLabel,
        rowCount: rows.length,
        subtotal: round2(rows.reduce((n, r) => n + r.subtotal, 0)),
      },
    ],
  });

  // A valid file with nothing on the board. Technically possible in February;
  // overwhelmingly likely to be the wrong export or one filtered to nothing.
  // Refusing here is also what catches a scheduled job quietly starting to send
  // empty files — the whole calendar would otherwise go blank on its own.
  if (data.totals.allJobs === 0) {
    return {
      ok: false,
      status: 422,
      reason: `Read ${rows.length} rows but found no jobs to schedule. Is this the right export?`,
    };
  }

  // Only the parked report arrived. Since ServiceTitan needs TWO reports to
  // cover the whole board (its scheduler won't look past 365 days), the failure
  // mode worth guarding is the 365-day half going missing: the checksums would
  // all still pass, and the calendar would silently empty out while the parked
  // pile stayed full. Nothing but the parked date is a clear enough signal.
  if (data.totals.firmJobs === 0 && data.totals.parkedJobs > 0) {
    return {
      ok: false,
      status: 422,
      reason: `Every job in this import is parked on ${data.jobs[0]?.date ?? 'the placeholder date'} — the 365-day scheduled report is missing. Send both reports.`,
    };
  }

  // Read the outgoing report BEFORE retiring it, and diff the new one against
  // it. Doing this at import time (rather than on every render) pins the
  // comparison to exactly these two files: a later import can't retroactively
  // change what this one reported.
  //
  // A NULL source_date counts as a different day, which is the honest reading —
  // we genuinely don't know what day such a row was for.
  const { data: prevRow } = await supabase
    .from('scheduled_revenue_uploads')
    .select('payload')
    .or(`source_date.is.null,source_date.neq.${sourceDate}`)
    .order('source_date', { ascending: false, nullsFirst: false })
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevPayload = prevRow?.payload
    ? hydrateScheduledRevenue(prevRow.payload as ScheduledRevenueData)
    : null;
  data.sinceLast = prevPayload
    ? compareScheduledRevenue(prevPayload, data)
    : null;

  // Retire the active row, and any other row already claiming this sourceDate,
  // so exactly one snapshot is active and exactly one is active for this day.
  const { error: retireErr } = await supabase
    .from('scheduled_revenue_uploads')
    .update({ is_active: false })
    .or(`is_active.eq.true,source_date.eq.${sourceDate}`);
  if (retireErr) return { ok: false, status: 500, reason: retireErr.message };

  const { error: insertErr } = await supabase
    .from('scheduled_revenue_uploads')
    .insert({
      uploaded_by: uploadedBy,
      source_filename: sourceLabel,
      is_active: true,
      source_date: sourceDate,
      job_count: data.totals.allJobs,
      firm_revenue: data.totals.firmRevenue,
      hold_revenue: data.totals.holdRevenue,
      parked_revenue: data.totals.parkedRevenue,
      window_start: data.meta.windowStart,
      window_end: data.meta.windowEnd,
      payload: data,
    });
  if (insertErr) return { ok: false, status: 500, reason: insertErr.message };

  return {
    ok: true,
    data,
    rowsRead: rows.length,
    sourceDate,
    importedAt: importedAtDate.toISOString(),
  };
}

/**
 * The file path end to end: bytes in, active report out.
 *
 * A two-line composition of the stages above — no logic of its own, so the JSON
 * path skipping it changes nothing.
 */
export async function importScheduledRevenueReport(opts: {
  /** One or more exports. Two is the normal case — see rowsFromSpreadsheets. */
  files: { bytes: Buffer; filename: string }[];
  uploadedBy: string;
  sourceDate: string;
  maxBytes: number;
  supabase: SupabaseClient;
}): Promise<ImportOutcome> {
  if (opts.files.length === 0) {
    return { ok: false, status: 422, reason: 'No file was sent.' };
  }

  const parsed = rowsFromSpreadsheets(opts.files, opts.maxBytes);
  if (!parsed.ok) return parsed;

  return persistScheduledRevenueReport({
    rows: parsed.rows,
    sourceDate: opts.sourceDate,
    uploadedBy: opts.uploadedBy,
    sourceLabel: opts.files.map((f) => f.filename).join(' + '),
    cancelledDropped: parsed.cancelledDropped,
    sources: parsed.sources,
    supabase: opts.supabase,
  });
}
