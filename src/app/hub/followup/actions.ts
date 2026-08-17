'use server';

// ============================================================================
// Follow-Through Scorecard — upload action
// ============================================================================
// Parse an "Open Opportunities" export into a fresh scorecard. The new upload
// REPLACES the report: the previous active row is retired, the new one becomes
// the only thing the page reads. Old rows stay in the table, so a mistaken
// upload is recoverable by flipping is_active back.
//
// The parsing and the maths both live in lib/followup-scorecard.ts (pure, and
// checked against the original export). This file is only the I/O: read the
// file, hand over a grid, store the result.
//
// Gated to admin + sales_manager (canUploadFollowupData); the RLS policy in
// migration 070 is the backstop.
// ============================================================================

import * as XLSX from 'xlsx';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser, canUploadFollowupData } from '@/lib/auth';
import { computeScorecard, parseOpportunityGrid } from '@/lib/followup-scorecard';

const MAX_BYTES = 15 * 1024 * 1024;

function fail(message: string): never {
  redirect(`/hub/followup?error=${encodeURIComponent(message)}`);
}

export async function uploadFollowupData(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user || !canUploadFollowupData(user.role)) {
    throw new Error('Forbidden: sales manager or admin access required.');
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    fail('Choose a spreadsheet file to upload.');
  }
  const f = file as File;
  if (f.size > MAX_BYTES) fail('File is larger than 15 MB.');

  // SheetJS rather than exceljs: the service software's export is slightly
  // non-standard and exceljs refuses it (same reason as the PHC upload).
  // cellDates gives real Dates for the two follow-up date columns.
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(Buffer.from(await f.arrayBuffer()), {
      type: 'buffer',
      cellDates: true,
    });
  } catch {
    fail('Could not read that file — is it the .xlsx export?');
  }

  const ws = wb!.Sheets['Open Opportunities'] ?? wb!.Sheets[wb!.SheetNames[0]];
  if (!ws) fail('That workbook has no sheets.');

  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws!, { header: 1, defval: '' });
  const { rows, missingColumns } = parseOpportunityGrid(grid);

  if (missingColumns.length) {
    fail(
      `This doesn't look like the Open Opportunities export — missing columns: ${missingColumns.join(', ')}.`,
    );
  }
  if (rows.length === 0) fail('No opportunity rows found in that file.');

  const asOf = new Date();
  const data = computeScorecard(rows, asOf, {
    sourceFilename: f.name,
    uploadedBy: user.email,
  });

  // Technically a valid file, but the report would be empty — almost certainly
  // the wrong export, so say that instead of publishing a page of zeroes.
  if (data.totals.followed === 0) {
    fail(
      `Read ${rows.length} rows, but none had a logged follow-up — there'd be nothing to show. Is this the right export?`,
    );
  }

  const supabase = await serverClient();

  // Retire the current report first: the newest upload is the only active one.
  const { error: retireErr } = await supabase
    .from('followup_uploads')
    .update({ is_active: false })
    .eq('is_active', true);
  if (retireErr) fail(retireErr.message);

  const isoDay = (v: string | null) => (v ? v.slice(0, 10) : null);
  const { error: insertErr } = await supabase.from('followup_uploads').insert({
    uploaded_by: user.email,
    source_filename: f.name,
    is_active: true,
    row_count: rows.length,
    window_start: isoDay(data.meta.windowStart),
    window_end: isoDay(data.meta.windowEnd),
    payload: data,
  });
  if (insertErr) fail(insertErr.message);

  revalidatePath('/hub/followup');
  revalidatePath('/hub');
  redirect(
    `/hub/followup?saved=${encodeURIComponent(
      `Scorecard updated — ${data.totals.followed} records that got a follow-up, from ${rows.length} rows.`,
    )}`,
  );
}
