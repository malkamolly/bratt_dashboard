'use server';

// ============================================================================
// PHC Scheduling Hub — server actions
// ============================================================================
// Two actions:
//   1. uploadRenewals  — parse an uploaded "Location Recurring Service" export
//                        into a new batch of service lines.
//   2. updateStatus    — set a property's call/scheduling status on the worklist.
// Both are gated to office/dispatch roles (canUsePhcScheduling); RLS on the
// tables is the backstop.
// ============================================================================

import * as XLSX from 'xlsx';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser, canUsePhcScheduling } from '@/lib/auth';
import {
  stripPrefix,
  deriveType,
  parseDescription,
  descTitle,
  STATUS_ORDER,
} from '@/lib/phc-renewals';

async function requirePhc() {
  const u = await getAllowedUser();
  if (!u || !canUsePhcScheduling(u.role)) {
    throw new Error('Forbidden: PHC scheduling access required.');
  }
  return u;
}

const EXPECTED_COLUMNS = [
  'Recurring Service Name',
  'Customer ID',
  'Customer Name',
  'Location ID',
  'Location Name',
  'Location Address',
  'Recurring Service Event ID',
  'Item Description',
];

export async function uploadRenewals(formData: FormData): Promise<void> {
  const user = await requirePhc();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/phc?error=${encodeURIComponent('Choose a spreadsheet file to upload.')}`);
  }
  const f = file as File;
  if (f.size > 15 * 1024 * 1024) {
    redirect(`/phc?error=${encodeURIComponent('File is larger than 15 MB.')}`);
  }

  // Parse the workbook. We use SheetJS (xlsx) rather than exceljs because the
  // service software's export is slightly non-standard and exceljs refuses to
  // read it; SheetJS is far more tolerant.
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(Buffer.from(await f.arrayBuffer()), { type: 'buffer' });
  } catch {
    redirect(`/phc?error=${encodeURIComponent('Could not read that file — is it an .xlsx export?')}`);
  }
  const ws = wb.Sheets['Sheet1'] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) redirect(`/phc?error=${encodeURIComponent('The spreadsheet has no sheets.')}`);

  // Rows as arrays; row 0 is the header. defval keeps every column aligned.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  const header = ((grid[0] as unknown[]) ?? []).map((h) => String(h).trim());
  const colOf: Record<string, number> = {};
  header.forEach((h, i) => {
    colOf[h] = i;
  });
  const missing = EXPECTED_COLUMNS.filter((c) => !(c in colOf));
  if (missing.length) {
    redirect(
      `/phc?error=${encodeURIComponent(`This doesn't look like the renewals export — missing columns: ${missing.join(', ')}.`)}`,
    );
  }

  const cell = (row: unknown[], name: string): string => {
    const i = colOf[name];
    if (i == null) return '';
    const v = row[i];
    return v == null ? '' : String(v).trim();
  };

  type Insert = {
    event_id: string;
    customer_id: string;
    customer_name: string;
    location_id: string;
    location_name: string;
    location_address: string;
    treatment_name: string;
    treatment_type: string | null;
    num_trees: string;
    species: string;
    tree_location: string;
    dbh: string;
    desc_title: string;
    raw_description: string;
  };

  const services: Insert[] = [];
  for (let i = 1; i < grid.length; i++) {
    const row = (grid[i] as unknown[]) ?? [];
    const svcName = cell(row, 'Recurring Service Name');
    if (!svcName) continue; // skip blank rows
    const desc = cell(row, 'Item Description');
    const p = parseDescription(desc);
    const name = stripPrefix(svcName);
    services.push({
      event_id: cell(row, 'Recurring Service Event ID'),
      customer_id: cell(row, 'Customer ID'),
      customer_name: cell(row, 'Customer Name'),
      location_id: cell(row, 'Location ID'),
      location_name: cell(row, 'Location Name'),
      location_address: cell(row, 'Location Address'),
      treatment_name: name,
      treatment_type: deriveType(name),
      num_trees: p.count,
      species: p.species,
      tree_location: p.treeLocation,
      dbh: p.dbh,
      desc_title: descTitle(desc),
      raw_description: desc,
    });
  }

  if (services.length === 0) {
    redirect(`/phc?error=${encodeURIComponent('No service rows found in that file.')}`);
  }

  const supabase = await serverClient();

  // New upload becomes the active worklist; retire any previous active batch.
  await supabase
    .from('phc_renewal_batches')
    .update({ is_active: false })
    .eq('is_active', true);

  const label = f.name.replace(/\.[^.]+$/, '') || 'Renewals';
  const { data: batch, error: batchErr } = await supabase
    .from('phc_renewal_batches')
    .insert({
      label,
      source_filename: f.name,
      uploaded_by: user.email,
      is_active: true,
    })
    .select('id')
    .single();
  if (batchErr || !batch) {
    redirect(`/phc?error=${encodeURIComponent(batchErr?.message ?? 'Could not create batch.')}`);
  }

  // Insert service rows in chunks.
  const rows = services.map((s) => ({ ...s, batch_id: batch!.id }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('phc_renewal_services')
      .insert(rows.slice(i, i + 500));
    if (error) redirect(`/phc?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/phc');
  revalidatePath('/phc/schedule');
  redirect(`/phc?saved=${encodeURIComponent(`Loaded ${rows.length} services.`)}`);
}

export async function updateStatus(formData: FormData): Promise<void> {
  const user = await requirePhc();
  const batchId = String(formData.get('batch_id') ?? '').trim();
  const locationId = String(formData.get('location_id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim() || null;
  if (!batchId || !locationId) {
    redirect(`/phc/schedule?error=${encodeURIComponent('Missing property reference.')}`);
  }
  if (!STATUS_ORDER.includes(status)) {
    redirect(`/phc/schedule?error=${encodeURIComponent('Invalid status.')}`);
  }

  const supabase = await serverClient();
  const { error } = await supabase.from('phc_property_status').upsert(
    {
      batch_id: batchId,
      location_id: locationId,
      status,
      note,
      updated_by: user.email,
    },
    { onConflict: 'batch_id,location_id' },
  );
  if (error) redirect(`/phc/schedule?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/phc/schedule');
  redirect('/phc/schedule?saved=1');
}
