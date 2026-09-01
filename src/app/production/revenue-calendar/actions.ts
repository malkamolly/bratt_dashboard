'use server';

// ============================================================================
// Revenue Calendar — upload action (the UI path)
// ============================================================================
// The browser uploader on /production/revenue-calendar. All it does is auth the
// person, pull the file off the FormData, and hand it to
// importScheduledRevenueReport() — the same function
// POST /api/scheduled-revenue/import calls, so a manual upload and the
// twice-daily job cannot produce different results.
//
// What stays here is what only the UI needs: role gating and turning the
// outcome into a redirect with a message.
//
// Gated to admin + sales_manager (canUploadScheduledRevenue); the RLS policy in
// migration 077 is the backstop.
// ============================================================================

import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser, canUploadScheduledRevenue } from '@/lib/auth';
import {
  importScheduledRevenueReport,
  revalidateScheduledRevenue,
  centralToday,
  UI_MAX_BYTES,
} from '@/lib/scheduled-revenue-import';
import { fmtUsd } from '@/lib/format';

function fail(message: string): never {
  redirect(`/production/revenue-calendar?error=${encodeURIComponent(message)}`);
}

export async function uploadScheduledRevenue(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user || !canUploadScheduledRevenue(user.role)) {
    throw new Error('Forbidden: sales manager or admin access required.');
  }

  const picked = formData
    .getAll('file')
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (picked.length === 0) {
    fail('Choose at least one spreadsheet to upload.');
  }

  const result = await importScheduledRevenueReport({
    files: await Promise.all(
      picked.map(async (f) => ({
        bytes: Buffer.from(await f.arrayBuffer()),
        filename: f.name,
      })),
    ),
    uploadedBy: user.email,
    // A person uploading in the browser means "this is today's board".
    sourceDate: centralToday(),
    maxBytes: UI_MAX_BYTES,
    supabase: await serverClient(),
  });

  if (!result.ok) fail(result.reason);

  revalidateScheduledRevenue();
  redirect(
    `/production/revenue-calendar?saved=${encodeURIComponent(
      `Calendar updated — ${result.data.totals.firmJobs} jobs on the board, ${fmtUsd(result.data.totals.firmRevenue)} scheduled.`,
    )}`,
  );
}
