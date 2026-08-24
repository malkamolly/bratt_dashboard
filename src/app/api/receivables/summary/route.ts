// ============================================================================
// GET /api/receivables/summary — read the current collections report
// ============================================================================
// Same token as the import endpoint, same response body. Lets a job confirm its
// upload actually landed, and lets a status message be posted on a day when no
// import ran, without re-parsing anything.
//
// Read-only: it never writes a report. It does write a log row, like every
// call to these endpoints.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { hydrateReceivables, type ReceivablesData } from '@/lib/receivables';
import {
  authorizeToken,
  clientIp,
  isRateLimited,
  logCall,
  buildSummaryBody,
  RATE_LIMIT_PER_HOUR,
} from '@/lib/receivables-api';

export async function GET(req: NextRequest) {
  const supabase = adminClient();
  const ip = clientIp(req);

  const auth = authorizeToken(req);
  if (!auth.ok) {
    await logCall(supabase, {
      endpoint: 'summary',
      outcome: auth.status === 401 ? 'unauthorized' : 'error',
      statusCode: auth.status,
      clientIp: ip,
      reason: auth.body.error,
    });
    return NextResponse.json(auth.body, { status: auth.status });
  }

  if (await isRateLimited(supabase, ip)) {
    await logCall(supabase, {
      endpoint: 'summary',
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

  try {
    const { data: row } = await supabase
      .from('receivables_uploads')
      .select('payload, uploaded_at')
      .eq('is_active', true)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // No report yet is a normal state, not an error — the caller should be able
    // to tell "nothing imported" apart from "something broke".
    if (!row?.payload) {
      await logCall(supabase, {
        endpoint: 'summary',
        outcome: 'ok',
        statusCode: 200,
        clientIp: ip,
        reason: 'no active report',
      });
      return NextResponse.json(
        { ok: true, sourceDate: null, importedAt: null, report: null },
        { status: 200 },
      );
    }

    const data = hydrateReceivables(row.payload as ReceivablesData);
    const body = buildSummaryBody(data, String(row.uploaded_at));

    await logCall(supabase, {
      endpoint: 'summary',
      outcome: 'ok',
      statusCode: 200,
      clientIp: ip,
      sourceDate: body.sourceDate,
      invoiceCount: body.openInvoices,
      totalBalance: body.totalOutstanding,
    });
    return NextResponse.json(body, { status: 200 });
  } catch (e) {
    await logCall(supabase, {
      endpoint: 'summary',
      outcome: 'error',
      statusCode: 500,
      clientIp: ip,
      reason: String(e),
    });
    console.error('[receivables/summary]', e);
    return NextResponse.json({ error: 'summary_failed' }, { status: 500 });
  }
}
