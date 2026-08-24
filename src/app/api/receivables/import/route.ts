// ============================================================================
// POST /api/receivables/import — token-authed collections import
// ============================================================================
// The headless equivalent of the uploader on /hub/receivables, for a daily job.
// It calls the same importReceivablesReport() the UI action calls, so the two
// paths cannot diverge. The UI uploader is untouched.
//
// Auth is the bearer token in RECEIVABLES_IMPORT_TOKEN and nothing else — a
// session cookie is deliberately NOT accepted, so this endpoint can't be
// reached by a logged-in browser and the token is the only thing to rotate.
// The path is marked public in middleware (no session redirect), which makes
// the check here the entire gate.
//
// Only POST is exported, so Next.js answers any other method with 405 on its
// own — the spec's 405 comes free rather than from a hand-written branch.
//
// Every call is logged, including rejected ones, and the rate limit is counted
// from that same log. See migration 075 for why the log is a table rather than
// process memory.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { adminClient } from '@/lib/supabase';
import {
  importReceivablesReport,
  revalidateReceivables,
  centralToday,
  isIsoDate,
  API_MAX_BYTES,
} from '@/lib/receivables-import';
import {
  authorizeToken,
  clientIp,
  isRateLimited,
  logCall,
  buildSummaryBody,
  RATE_LIMIT_PER_HOUR,
} from '@/lib/receivables-api';

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

  // --- read the request ---------------------------------------------------
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

  const file = form.get('file');
  if (!(file instanceof File)) {
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'bad_request',
      statusCode: 400,
      clientIp: ip,
      reason: 'no file field',
    });
    return NextResponse.json({ error: 'missing "file" field' }, { status: 400 });
  }

  // Optional; defaults to today in Central, since a UTC "today" is the previous
  // day for most of a Minnesota evening.
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

  // --- import -------------------------------------------------------------
  try {
    const result = await importReceivablesReport({
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name || 'upload.xlsx',
      uploadedBy: 'api:receivables-import',
      sourceDate,
      maxBytes: API_MAX_BYTES,
      supabase,
    });

    if (!result.ok) {
      const outcome =
        result.status === 415
          ? 'unsupported'
          : result.status === 413
            ? 'too_large'
            : result.status === 422
              ? 'unprocessable'
              : 'error';
      await logCall(supabase, {
        endpoint: 'import',
        outcome,
        statusCode: result.status,
        clientIp: ip,
        sourceDate,
        sourceFilename: file.name,
        reason: result.reason,
      });
      return NextResponse.json(
        { error: result.reason },
        { status: result.status },
      );
    }

    const body = buildSummaryBody(result.data, result.importedAt);
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'ok',
      statusCode: 200,
      clientIp: ip,
      sourceDate,
      sourceFilename: file.name,
      rowsRead: result.rowsRead,
      invoiceCount: result.data.totals.invoiceCount,
      totalBalance: result.data.totals.balance,
      actor: 'api:receivables-import',
    });

    // The pages read the active report, so they have to be told it changed.
    revalidateReceivables();
    return NextResponse.json(body, { status: 200 });
  } catch (e) {
    // Anything unforeseen: log the detail, return a generic message. The reason
    // goes to the log rather than the response so an internal error can't leak
    // through an endpoint that unauthenticated callers can reach.
    await logCall(supabase, {
      endpoint: 'import',
      outcome: 'error',
      statusCode: 500,
      clientIp: ip,
      sourceDate,
      sourceFilename: file.name,
      reason: String(e),
    });
    console.error('[receivables/import]', e);
    return NextResponse.json({ error: 'import_failed' }, { status: 500 });
  }
}
