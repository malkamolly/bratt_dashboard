// ============================================================================
// POST /api/scheduled-revenue/import — token-authed scheduled-revenue import
// ============================================================================
// The headless equivalent of the uploader on /production/revenue-calendar, for
// the scheduled job (6am, 11am, 3pm and 7pm Central). It calls the same
// importScheduledRevenueReport() the UI action calls, so the two paths cannot
// diverge.
//
// Auth is the bearer token and nothing else — a session cookie is deliberately
// NOT accepted, so this endpoint can't be reached by a logged-in browser and
// the token is the only thing to rotate. The path is marked public in
// middleware (no session redirect), which makes the check here the entire gate.
//
// Only POST is exported, so Next.js answers any other method with 405 on its
// own rather than a hand-written branch.
//
// TWO INTAKES, behind a content-type branch:
//   application/json     -> already-extracted rows plus a checksum (preferred)
//   multipart/form-data  -> the spreadsheets themselves
//
// EITHER INTAKE TAKES MORE THAN ONE REPORT, and normally needs to. ServiceTitan
// will only SCHEDULE a report that looks out 365 days, so the far-future parked
// work comes from a second report. JSON sends them as `parts`; multipart sends
// several files. Each is checked against its own grand-total row, then merged.
// They meet at persistScheduledRevenueReport(), so the day/month maths has one
// implementation and the two cannot report different numbers from the same
// data. Anything else -> 415.
//
// Every call is logged, including rejected ones, and the rate limit is counted
// from that same log. See migration 077 for why the log is a table rather than
// process memory.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { adminClient } from '@/lib/supabase';
import {
  importScheduledRevenueReport,
  persistScheduledRevenueReport,
  revalidateScheduledRevenue,
  centralToday,
  isIsoDate,
  API_MAX_BYTES,
} from '@/lib/scheduled-revenue-import';
import { rowsFromJsonBody } from '@/lib/scheduled-revenue-json';
import {
  authorizeToken,
  clientIp,
  isRateLimited,
  logCall,
  buildSummaryBody,
  RATE_LIMIT_PER_HOUR,
} from '@/lib/scheduled-revenue-api';

export async function POST(req: NextRequest) {
  const supabase = adminClient();
  const ip = clientIp(req);

  // --- auth ---------------------------------------------------------------
  const auth = authorizeToken(req);
  if (!auth.ok) {
    await logCall(supabase, {
      endpoint: 'import',
      outcome: auth.status === 401 ? 'unauthorized' : 'error',
      statusCode: auth.status,
      clientIp: ip,
      reason: auth.body.error,
    });
    return NextResponse.json(auth.body, { status: auth.status });
  }

  // --- rate limit ---------------------------------------------------------
  if (await isRateLimited(supabase, ip)) {
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'rate_limited',
      statusCode: 429,
      clientIp: ip,
      reason: `over ${RATE_LIMIT_PER_HOUR}/hour`,
    });
    return NextResponse.json(
      { error: 'rate_limited', limitPerHour: RATE_LIMIT_PER_HOUR },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();

  if (contentType.includes('application/json')) {
    return handleJson(req, supabase, ip);
  }

  if (!contentType.includes('multipart/form-data')) {
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'unsupported',
      statusCode: 415,
      clientIp: ip,
      reason: `content-type: ${contentType || '(none)'}`,
    });
    return NextResponse.json(
      {
        error:
          'Unsupported Content-Type. Send application/json, or multipart/form-data with a "file" field.',
      },
      { status: 415 },
    );
  }

  // --- multipart ----------------------------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'bad_request',
      statusCode: 400,
      clientIp: ip,
      reason: 'body was not multipart/form-data',
    });
    return NextResponse.json(
      { error: 'expected multipart/form-data with a "file" field' },
      { status: 400 },
    );
  }

  // Every File in the body, under any field name. Deliberately forgiving: a
  // caller sending `file`, `file` again, or `file1`/`file2` all mean the same
  // thing, and rejecting one spelling would be a puzzle to debug from a
  // scheduled job's logs.
  const files: File[] = [];
  for (const [, v] of form.entries()) {
    if (v instanceof File && v.size > 0) files.push(v);
  }
  if (files.length === 0) {
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'bad_request',
      statusCode: 400,
      clientIp: ip,
      reason: 'no file field',
    });
    return NextResponse.json(
      { error: 'missing "file" field (send one file per report)' },
      { status: 400 },
    );
  }
  const fileNames = files.map((f) => f.name || 'upload.xlsx').join(' + ');

  // Optional; defaults to today in Central, since a UTC "today" is already
  // tomorrow by the time the evening run fires.
  const rawDate = String(form.get('sourceDate') ?? '').trim();
  if (rawDate && !isIsoDate(rawDate)) {
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'bad_request',
      statusCode: 400,
      clientIp: ip,
      reason: `bad sourceDate: ${rawDate}`,
    });
    return NextResponse.json(
      { error: 'sourceDate must be YYYY-MM-DD' },
      { status: 400 },
    );
  }
  const sourceDate = rawDate || centralToday();

  try {
    const result = await importScheduledRevenueReport({
      files: await Promise.all(
        files.map(async (f) => ({
          bytes: Buffer.from(await f.arrayBuffer()),
          filename: f.name || 'upload.xlsx',
        })),
      ),
      uploadedBy: 'api:scheduled-revenue-import',
      sourceDate,
      maxBytes: API_MAX_BYTES,
      supabase,
    });

    if (!result.ok) {
      await logCall(supabase, {
        endpoint: 'import',
        outcome: outcomeFor(result.status),
        statusCode: result.status,
        clientIp: ip,
        sourceDate,
        sourceFilename: fileNames,
        reason: result.reason,
      });
      return NextResponse.json({ error: result.reason }, { status: result.status });
    }

    const body = buildSummaryBody(result.data, result.importedAt, centralToday());
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'ok',
      statusCode: 200,
      clientIp: ip,
      sourceDate,
      sourceFilename: fileNames,
      rowsRead: result.rowsRead,
      jobCount: result.data.totals.allJobs,
      firmRevenue: result.data.totals.firmRevenue,
      actor: 'api:scheduled-revenue-import',
    });

    revalidateScheduledRevenue();
    return NextResponse.json(body, { status: 200 });
  } catch (e) {
    // Anything unforeseen: the detail goes to the log, not the response, so an
    // internal error can't leak through an endpoint strangers can reach.
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'error',
      statusCode: 500,
      clientIp: ip,
      sourceDate,
      sourceFilename: fileNames,
      reason: String(e),
    });
    console.error('[scheduled-revenue/import]', e);
    return NextResponse.json({ error: 'import_failed' }, { status: 500 });
  }
}

/**
 * The JSON intake.
 *
 * Validation and the checksum happen in rowsFromJsonBody(), which touches no
 * database at all — so every rejection below is provably non-destructive: the
 * previous snapshot cannot have been altered, because no write is reachable
 * until the body has passed.
 */
async function handleJson(
  req: NextRequest,
  supabase: ReturnType<typeof adminClient>,
  ip: string,
) {
  // Read as text first, so the body's real size is known before parsing and an
  // oversized body is a clean 413 rather than a parser blowing up.
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'bad_request',
      statusCode: 400,
      clientIp: ip,
      reason: 'could not read request body',
    });
    return NextResponse.json({ error: 'could not read body' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'unprocessable',
      statusCode: 422,
      clientIp: ip,
      reason: `invalid JSON: ${String(e)}`,
    });
    return NextResponse.json({ error: 'Body is not valid JSON.' }, { status: 422 });
  }

  const parsed = rowsFromJsonBody(body, Buffer.byteLength(raw, 'utf8'));
  if (!parsed.ok) {
    await logCall(supabase, {
      endpoint: 'import',
      outcome: parsed.status === 413 ? 'too_large' : 'unprocessable',
      statusCode: parsed.status,
      clientIp: ip,
      sourceDate:
        isPlainObj(body) && typeof body.sourceDate === 'string'
          ? body.sourceDate
          : null,
      sourceFilename: 'json',
      reason: parsed.reason,
    });
    return NextResponse.json({ error: parsed.reason }, { status: parsed.status });
  }

  try {
    const result = await persistScheduledRevenueReport({
      rows: parsed.rows,
      sourceDate: parsed.sourceDate,
      uploadedBy: 'api:scheduled-revenue-import-json',
      sourceLabel: parsed.sources.map((p) => p.label).join(' + ') || 'json',
      sources: parsed.sources,
      supabase,
    });

    if (!result.ok) {
      await logCall(supabase, {
        endpoint: 'import',
        outcome: outcomeFor(result.status),
        statusCode: result.status,
        clientIp: ip,
        sourceDate: parsed.sourceDate,
        sourceFilename: 'json',
        reason: result.reason,
      });
      return NextResponse.json({ error: result.reason }, { status: result.status });
    }

    const summary = buildSummaryBody(result.data, result.importedAt, centralToday());
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'ok',
      statusCode: 200,
      clientIp: ip,
      sourceDate: parsed.sourceDate,
      sourceFilename: 'json',
      rowsRead: parsed.rowsRead,
      jobCount: result.data.totals.allJobs,
      firmRevenue: result.data.totals.firmRevenue,
      actor: 'api:scheduled-revenue-import-json',
    });

    revalidateScheduledRevenue();
    return NextResponse.json(summary, { status: 200 });
  } catch (e) {
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'error',
      statusCode: 500,
      clientIp: ip,
      sourceDate: parsed.sourceDate,
      sourceFilename: 'json',
      reason: String(e),
    });
    console.error('[scheduled-revenue/import json]', e);
    return NextResponse.json({ error: 'import_failed' }, { status: 500 });
  }
}

function outcomeFor(status: number) {
  if (status === 415) return 'unsupported' as const;
  if (status === 413) return 'too_large' as const;
  if (status === 422) return 'unprocessable' as const;
  return 'error' as const;
}

function isPlainObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
