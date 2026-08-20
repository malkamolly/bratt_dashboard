'use server';

// ============================================================================
// Collections list — upload action
// ============================================================================
// Parse a "Job Completed Detail" export into a fresh collections report. The
// new upload REPLACES the report: the previous active row is retired, the new
// one becomes the only thing the pages read. Old rows stay in the table, so a
// mistaken upload is recoverable by flipping is_active back.
//
// The parsing and the maths both live in lib/receivables.ts (pure, and checked
// against the real export). This file is only the I/O: read the file, hand over
// a grid, store the result.
//
// Gated to admin + sales_manager (canUploadReceivables); the RLS policy in
// migration 074 is the backstop.
// ============================================================================

import * as XLSX from 'xlsx';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser, canUploadReceivables } from '@/lib/auth';
import { computeReceivables, parseInvoiceGrid } from '@/lib/receivables';
import { fmtUsd } from '@/lib/format';

const MAX_BYTES = 15 * 1024 * 1024;

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
  if (f.size > MAX_BYTES) fail('File is larger than 15 MB.');

  // SheetJS rather than exceljs: the service software's export is slightly
  // non-standard and exceljs refuses it (same reason as the PHC and Follow-Up
  // uploads). cellDates gives us a real Date for Completion Date, which the
  // whole aging calculation rests on.
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(Buffer.from(await f.arrayBuffer()), {
      type: 'buffer',
      cellDates: true,
    });
  } catch {
    fail('Could not read that file — is it the .xlsx export?');
  }

  // The export's data is on the first sheet; a second "Filters" sheet carries
  // the report parameters and is not what we want.
  const ws = wb!.Sheets[wb!.SheetNames[0]];
  if (!ws) fail('That workbook has no sheets.');

  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws!, { header: 1, defval: '' });
  const { rows, missingColumns } = parseInvoiceGrid(grid);

  if (missingColumns.length) {
    fail(
      `This doesn't look like the Job Completed Detail export — missing columns: ${missingColumns.join(', ')}.`,
    );
  }
  if (rows.length === 0) fail('No invoice rows found in that file.');

  const data = computeReceivables(rows, new Date(), {
    sourceFilename: f.name,
    uploadedBy: user.email,
  });

  // A valid file where nothing is owed. Technically possible, overwhelmingly
  // likely to be the wrong export (or one filtered down to paid jobs), so say
  // so instead of publishing an empty collections list to the whole team.
  if (data.totals.invoiceCount === 0) {
    fail(
      `Read ${rows.length} invoices, but none had a balance owing — there'd be nothing to chase. Is this the right export?`,
    );
  }

  const supabase = await serverClient();

  // Retire the current report first: the newest upload is the only active one.
  const { error: retireErr } = await supabase
    .from('receivables_uploads')
    .update({ is_active: false })
    .eq('is_active', true);
  if (retireErr) fail(retireErr.message);

  const { error: insertErr } = await supabase.from('receivables_uploads').insert({
    uploaded_by: user.email,
    source_filename: f.name,
    is_active: true,
    invoice_count: data.totals.invoiceCount,
    total_balance: data.totals.balance,
    window_start: data.meta.windowStart,
    window_end: data.meta.windowEnd,
    payload: data,
  });
  if (insertErr) fail(insertErr.message);

  revalidatePath('/hub/receivables');
  revalidatePath('/hub/arborists');
  revalidatePath('/hub/arborists/[slug]', 'page');
  redirect(
    `/hub/receivables?saved=${encodeURIComponent(
      `Collections list updated — ${data.totals.invoiceCount} open invoices, ${fmtUsd(data.totals.balance)} outstanding.`,
    )}`,
  );
}
