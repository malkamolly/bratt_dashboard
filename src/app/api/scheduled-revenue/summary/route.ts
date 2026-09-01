// ============================================================================
// GET /api/scheduled-revenue/summary — read the current state, import nothing
// ============================================================================
// Same token, same response body as the import endpoint, so a scheduled job can
// verify its import landed by re-reading it — or post a status on a day when no
// export arrived.
//
// The horizons (next 7 / 30 / 90 days) are measured from TODAY in Central, not
// from the snapshot's own date. A snapshot that's a day stale still reports
// honest horizons; it just reports fewer of them.
//
// Only GET is exported, so Next.js answers any other method with 405 itself.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { centralToday } from '@/lib/scheduled-revenue-import';
import {
  hydrateScheduledRevenue,
  type ScheduledRevenueData,
} from '@/lib/scheduled-revenue';
import {
  authorizeToken,
  clientIp,
  isRateLimited,
  logCall,
  buildSummaryBody,
  RATE_LIMIT_PER_HOUR,
} from '@/lib/scheduled-revenue-api';

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
      .from('scheduled_revenue_uploads')
      .select('payload, uploaded_at')
      .eq('is_active', true)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // No snapshot yet is a normal state, not an error — the endpoint exists
    // before the first import does. 404 with a plain reason so a caller can
    // tell "nothing imported" from "something broke".
    if (!row?.payload) {
      await logCall(supabase, {
        endpoint: 'summary',
        outcome: 'ok',
        statusCode: 404,
        clientIp: ip,
        reason: 'no active snapshot',
      });
      return NextResponse.json(
        { error: 'no_report', message: 'Nothing has been imported yet.' },
        { status: 404 },
      );
    }

    const data = hydrateScheduledRevenue(row.payload as ScheduledRevenueData);
    const body = buildSummaryBody(
      data,
      String(row.uploaded_at),
      centralToday(),
    );

    await logCall(supabase, {
      endpoint: 'summary',
      outcome: 'ok',
      statusCode: 200,
      clientIp: ip,
      sourceDate: data.meta.sourceDate,
      jobCount: data.totals.allJobs,
      firmRevenue: data.totals.firmRevenue,
      actor: 'api:scheduled-revenue-summary',
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
    console.error('[scheduled-revenue/summary]', e);
    return NextResponse.json({ error: 'summary_failed' }, { status: 500 });
  }
}
