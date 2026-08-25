// ============================================================================
// Collections list — the one import path
// ============================================================================
// Both ways of importing a report go through here: the UI uploader on
// /hub/receivables and POST /api/receivables/import. That is the whole point of
// this file existing — two callers that "should behave the same" drift the
// moment they hold their own copy of the logic.
//
// It stays I/O-shaped: get rows, hand them to the pure maths in
// lib/receivables.ts, write one row. The maths is not duplicated here.
//
// Two stages, because there are now two ways rows arrive:
//   rowsFromSpreadsheet()      bytes  -> RawInvoice[]   (file upload, UI + API)
//   rowsFromJsonBody()         JSON   -> RawInvoice[]   (see receivables-json.ts)
//   persistReceivablesReport() rows   -> the active report
// Everything that decides a NUMBER — aging, the prior-snapshot comparison, rep
// attribution — lives in the second stage, which both intakes share. That is
// what makes it impossible for the two routes to disagree.
//
// The Supabase client is passed IN rather than created here, because the two
// callers legitimately differ: the UI runs as a signed-in user and should be
// held to that user's RLS policy, while the API route has no session at all and
// needs the service-role client. Anything else about the import is identical.
// ============================================================================

import * as XLSX from 'xlsx';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeReceivables,
  parseInvoiceGrid,
  compareReceivables,
  hydrateReceivables,
  type ReceivablesData,
  type RawInvoice,
} from '@/lib/receivables';

/**
 * Vercel caps a serverless function's request body at ~4.5 MB, so the API path
 * cannot honour the 15 MB the UI allows — a bigger file fails at the platform
 * before any of our code runs, which would surface as a confusing 500 rather
 * than a clean 413. We check below that ceiling and say so plainly.
 *
 * The real exports are tens of kilobytes, so this is a guardrail, not a limit
 * anyone will meet.
 */
export const API_MAX_BYTES = 4 * 1024 * 1024;

/** The UI posts through a server action, which has no such body cap. */
export const UI_MAX_BYTES = 15 * 1024 * 1024;

/** Extensions we accept. The real export is .xlsx; .csv is accepted because
 *  SheetJS reads it and a caller may well have converted it. */
const ALLOWED_EXTENSIONS = ['.xlsx', '.xlsm', '.csv'];

/**
 * Refresh every page that reads the active report. Both import paths call this,
 * so neither can forget one. It lives here rather than in the server-action
 * file because a 'use server' module may only export async functions.
 */
export function revalidateReceivables(): void {
  revalidatePath('/hub/receivables');
  revalidatePath('/hub/arborists');
  revalidatePath('/hub/arborists/[slug]', 'page');
}

export type ImportOutcome =
  | {
      ok: true;
      data: ReceivablesData;
      /** Rows read from the file, before paid rows were dropped. */
      rowsRead: number;
      sourceDate: string;
      importedAt: string;
    }
  | {
      ok: false;
      /** Maps straight onto the HTTP status the API should return. The UI
       *  ignores it and shows `reason`. */
      status: 415 | 413 | 422 | 500;
      reason: string;
    };

export function looksLikeSpreadsheet(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((e) => lower.endsWith(e));
}

/** Today in America/Chicago as 'YYYY-MM-DD'. The business is in the Twin
 *  Cities, and a UTC "today" is the previous day for most of the evening. */
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
  | { ok: true; rows: RawInvoice[] }
  | { ok: false; status: 415 | 413 | 422; reason: string };

/**
 * Spreadsheet bytes to rows. Stage one of the file path.
 *
 * Reads nothing from the database and writes nothing, so every rejection here
 * is inherently safe: the previous report is untouched because no write is
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

  // SheetJS rather than exceljs: the service software's export is slightly
  // non-standard and exceljs refuses it (same reason as the PHC and Follow-Up
  // uploads). cellDates gives us a real Date for Completion Date, which the
  // whole aging calculation rests on.
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: 'buffer', cellDates: true });
  } catch {
    return {
      ok: false,
      status: 422,
      reason: 'Could not read that file — is it the Job Completed Detail export?',
    };
  }

  // The export's data is on the first sheet; a second "Filters" sheet carries
  // the report parameters and is not what we want.
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    return { ok: false, status: 422, reason: 'That workbook has no sheets.' };
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  const { rows, missingColumns } = parseInvoiceGrid(grid);

  if (missingColumns.length) {
    return {
      ok: false,
      status: 422,
      reason: `missing column${missingColumns.length === 1 ? '' : 's'}: ${missingColumns.join(', ')}`,
    };
  }
  if (rows.length === 0) {
    return { ok: false, status: 422, reason: 'No invoice rows found in that file.' };
  }

  return { ok: true, rows };
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
 * invoices are a snapshot inside one JSON blob, never appended rows — so
 * re-running the same data cannot double-count anything.
 *
 * The subtler failure is the comparison. It used to pick whichever report was
 * active before this one, so a second upload on the same day compared today
 * against THIS MORNING: collected read as roughly nothing, and the next day
 * then compared against the wrong baseline. It happened on 2026-08-24. The
 * previous snapshot is now the most recent one for a DIFFERENT sourceDate, and
 * any existing snapshot for the same date is retired, so exactly one is active
 * per day and re-importing a day is idempotent in the way that matters.
 *
 * Retired rows are kept rather than deleted: a mistaken import stays
 * recoverable by flipping is_active back, and nothing reads them meanwhile.
 */
export async function persistReceivablesReport(opts: {
  rows: RawInvoice[];
  sourceDate: string;
  uploadedBy: string;
  /** Filename for a file upload, or a label like 'json:ar-email' for JSON.
   *  Recorded so the log says where a report came from. */
  sourceLabel: string;
  supabase: SupabaseClient;
}): Promise<ImportOutcome> {
  const { rows, sourceDate, uploadedBy, sourceLabel, supabase } = opts;
  const filename = sourceLabel;
  const importedAtDate = new Date();
  const data: ReceivablesData = computeReceivables(rows, importedAtDate, {
    sourceFilename: filename,
    uploadedBy,
    sourceDate,
  });

  // A valid file where nothing is owed. Technically possible, overwhelmingly
  // likely to be the wrong export (or one filtered down to paid jobs), so
  // refuse instead of publishing an empty collections list to the whole team.
  // This is also the check that catches a daily job quietly starting to send
  // empty files.
  if (data.totals.invoiceCount === 0) {
    return {
      ok: false,
      status: 422,
      reason: `Read ${rows.length} invoices, but none had a balance owing — there would be nothing to chase. Is this the right export?`,
    };
  }

  // Read the outgoing report BEFORE retiring it, and diff the new one against
  // it. Doing this at import time (rather than on every page render) pins the
  // comparison to exactly these two files: a later import can't retroactively
  // change what this one reported, and the pages have no work to do.
  // The most recent snapshot for a DIFFERENT day. A NULL source_date (a row
  // uploaded before that column existed) counts as a different day, which is
  // the honest reading — we genuinely don't know what day it was for.
  const { data: prevRow } = await supabase
    .from('receivables_uploads')
    .select('payload')
    .or(`source_date.is.null,source_date.neq.${sourceDate}`)
    .order('source_date', { ascending: false, nullsFirst: false })
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Hydrated, because a payload stored before a field existed is missing it
  // permanently and compareReceivables reads those fields.
  const prevPayload = prevRow?.payload
    ? hydrateReceivables(prevRow.payload as ReceivablesData)
    : null;
  data.sinceLast = prevPayload ? compareReceivables(prevPayload, data) : null;

  // Retire the active row, and any other row already claiming this sourceDate,
  // so exactly one snapshot is active and exactly one is active for this day.
  const { error: retireErr } = await supabase
    .from('receivables_uploads')
    .update({ is_active: false })
    .or(`is_active.eq.true,source_date.eq.${sourceDate}`);
  if (retireErr) return { ok: false, status: 500, reason: retireErr.message };

  const { error: insertErr } = await supabase.from('receivables_uploads').insert({
    uploaded_by: uploadedBy,
    source_filename: filename,
    is_active: true,
    invoice_count: data.totals.invoiceCount,
    total_balance: data.totals.balance,
    window_start: data.meta.windowStart,
    window_end: data.meta.windowEnd,
    source_date: sourceDate,
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
 * Kept as a single call because both the UI action and the multipart branch of
 * the API route want exactly this. It is a two-line composition of the stages
 * above — no logic of its own, so the JSON path skipping it changes nothing.
 */
export async function importReceivablesReport(opts: {
  bytes: Buffer;
  filename: string;
  uploadedBy: string;
  sourceDate: string;
  maxBytes: number;
  supabase: SupabaseClient;
}): Promise<ImportOutcome> {
  const parsed = rowsFromSpreadsheet({
    bytes: opts.bytes,
    filename: opts.filename,
    maxBytes: opts.maxBytes,
  });
  if (!parsed.ok) return parsed;

  return persistReceivablesReport({
    rows: parsed.rows,
    sourceDate: opts.sourceDate,
    uploadedBy: opts.uploadedBy,
    sourceLabel: opts.filename,
    supabase: opts.supabase,
  });
}
