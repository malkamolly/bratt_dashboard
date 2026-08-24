'use server';

// ============================================================================
// Collections list — upload action (the UI path)
// ============================================================================
// The browser uploader on /hub/receivables. All it does is auth the person,
// pull the file off the FormData, and hand it to importReceivablesReport() —
// the same function POST /api/receivables/import calls, so the two paths
// cannot produce different results.
//
// What stays here is what only the UI needs: role gating and turning the
// outcome into a redirect with a message.
//
// Gated to admin + sales_manager (canUploadReceivables); the RLS policy in
// migration 074 is the backstop.
// ============================================================================

import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser, canUploadReceivables } from '@/lib/auth';
import {
  importReceivablesReport,
  revalidateReceivables,
  centralToday,
  UI_MAX_BYTES,
} from '@/lib/receivables-import';
import { fmtUsd } from '@/lib/format';

function fail(message: string): never {
  redirect(`/hub/receivables?error=${encodeURIComponent(message)}`);
}

export async function uploadReceivablesData(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user || !canUploadReceivables(user.role)) {
    throw new Error('Forbidden: sales manager or admin access required.');
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    fail('Choose a spreadsheet file to upload.');
  }
  const f = file as File;

  const result = await importReceivablesReport({
    bytes: Buffer.from(await f.arrayBuffer()),
    filename: f.name,
    uploadedBy: user.email,
    // A person uploading in the browser means "this is today's report".
    sourceDate: centralToday(),
    maxBytes: UI_MAX_BYTES,
    supabase: await serverClient(),
  });

  if (!result.ok) fail(result.reason);

  revalidateReceivables();
  redirect(
    `/hub/receivables?saved=${encodeURIComponent(
      `Collections list updated — ${result.data.totals.invoiceCount} open invoices, ${fmtUsd(result.data.totals.balance)} outstanding.`,
    )}`,
  );
}
