'use server';

// ============================================================================
// Cost Analysis — leadership data entry (server actions)
// ============================================================================
// All gated to the three Cost Analysis people:
//   - addEntry:           add one job by hand (lands as 'pending').
//   - importSpreadsheet:  bulk-add jobs from a Hub "Invoice Items" export.
//   - setEntryStatus:     include / remove / re-pend a job after review.
//   - includeAllPending:  approve the whole pending queue at once.
// Only 'included' rows reach the analysis (see cost-analysis.ts). The page is
// force-dynamic, so a status change shows up in the figures on next load.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser, canSeeCostAnalysis } from '@/lib/auth';
import { invoiceExists, countExistingSignatures, rowSignature } from '@/lib/removal-entries';
import { parseRemovalWorkbook, normalizeSellerName, type ImportParse } from '@/lib/removal-import';

const DATA_PATH = '/cost-analysis/data';

async function requireLeadership() {
  const u = await getAllowedUser();
  if (!u || !canSeeCostAnalysis(u.email)) {
    throw new Error('Forbidden: Cost Analysis access required.');
  }
  return u;
}

function back(kind: 'ok' | 'error', msg: string): never {
  redirect(`${DATA_PATH}?${kind}=${encodeURIComponent(msg)}`);
}

/** "" -> null; otherwise a finite number, or undefined if it doesn't parse. */
function optNum(v: FormDataEntryValue | null): number | null | undefined {
  const s = (v == null ? '' : String(v)).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// House rule (First name + Last initial) lives in removal-import.ts so the manual
// form and the spreadsheet importer normalize names identically.
const normalizeSeller = normalizeSellerName;

export async function addEntry(formData: FormData): Promise<void> {
  const user = await requireLeadership();

  const inv = String(formData.get('inv') ?? '').trim();
  if (!inv) back('error', 'Invoice number is required.');
  if (!/^[0-9]+$/.test(inv)) back('error', 'Invoice number should be digits only.');

  const price = optNum(formData.get('price'));
  const dbh = optNum(formData.get('dbh'));
  if (price === undefined) back('error', 'Price must be a number.');
  if (price === null) back('error', 'Price is required.');
  if (price < 0) back('error', 'Price cannot be negative.');
  if (dbh === undefined) back('error', 'DBH must be a number.');
  if (dbh === null) back('error', 'DBH (trunk diameter) is required.');
  if (dbh <= 0) back('error', 'DBH must be greater than 0.');

  const height = optNum(formData.get('height'));
  const crown = optNum(formData.get('crown'));
  if (height === undefined) back('error', 'Height must be a number (or left blank).');
  if (crown === undefined) back('error', 'Crown spread must be a number (or left blank).');

  const stemsRaw = optNum(formData.get('stems'));
  const stems = stemsRaw == null || stemsRaw < 1 ? 1 : Math.round(stemsRaw);

  const date = String(formData.get('date') ?? '').trim() || null;
  const species = String(formData.get('species') ?? '').trim() || null;
  const seller = normalizeSeller(String(formData.get('seller') ?? ''));
  const haul = String(formData.get('haul') ?? 'yes') !== 'no';
  const muni = String(formData.get('muni') ?? '') === 'on';

  // ---- Duplicate-invoice guardrail ----
  // Reject an invoice that already exists anywhere in the dataset (historical or
  // added). Historical multi-line invoices legitimately repeat among themselves,
  // but a NEW manual entry should never reuse an existing invoice.
  if (await invoiceExists(inv)) {
    back('error', `Invoice ${inv} is already in the system — no need to add it again.`);
  }

  const supabase = await serverClient();
  const { error } = await supabase.from('removals').insert({
    inv,
    haul,
    original_price: price,
    dbh,
    stems,
    height,
    crown,
    species,
    seller,
    date,
    muni,
    kind: 'tree',
    status: 'pending',
    source: 'manual',
    added_by: user.email,
    // Snapshot the original field values so later edits can be flagged as adjusted.
    original: { dbh, height, crown, stems, species, seller, date, haul, muni },
  });

  if (error) {
    back('error', `Could not save the job: ${error.message}`);
  }

  revalidatePath(DATA_PATH);
  revalidatePath('/cost-analysis');
  back('ok', `Added invoice ${inv} — it's pending your review below.`);
}

// ---------------------------------------------------------------------------
// Spreadsheet import
// ---------------------------------------------------------------------------

// Kept under next.config.js's 10mb serverActions.bodySizeLimit so an oversized
// file gets this readable message instead of a framework-level rejection. Two
// weeks of line items is ~7 KB, so this is enormous headroom.
const MAX_UPLOAD = 8 * 1024 * 1024;

/** "7/29" from "2026-07-29", for a compact confirmation message. */
function shortDate(iso: string | null): string {
  if (!iso) return '?';
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/**
 * Bulk-add removals from the Hub's "Invoice Items" export.
 *
 * Everything lands as 'pending' — exactly like a manual add — so an upload can
 * never move the published figures on its own. Review happens on this page.
 *
 * Run the report with Date Type = Completion Date; the parser reads the
 * measurements out of each line item's free-text description (see
 * src/lib/removal-import.ts).
 */
export async function importSpreadsheet(formData: FormData): Promise<void> {
  const user = await requireLeadership();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    back('error', 'Choose a spreadsheet file first.');
  }
  if (file.size > MAX_UPLOAD) {
    back('error', 'That file is bigger than 8 MB — export a narrower date range.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let parsed: ImportParse | null = null;
  let readError = '';
  try {
    parsed = parseRemovalWorkbook(bytes);
  } catch (e) {
    readError = e instanceof Error ? e.message : 'unreadable file';
  }
  if (!parsed) {
    back('error', `Could not read that file (${readError}). Export it as .xlsx or .csv.`);
  }
  if (!parsed.headerFound) {
    back(
      'error',
      'That file has no "Invoice Number" / "Item Description" columns — it needs to be the Hub Calc Invoice Items report.',
    );
  }
  if (parsed.jobs.length === 0) {
    const why = parsed.skipped.length > 0 ? ` (${parsed.skipped.length} rows weren't tree removals)` : '';
    back('error', `No completed tree removals found in that file${why}.`);
  }

  // ---- Skip rows already in the table ----
  // Signature-based, not invoice-based: one invoice can hold several trees, so we
  // import only the copies of each fingerprint the file has beyond the table's.
  // That makes an overlapping re-export safe to upload.
  const already = await countExistingSignatures(parsed.jobs.map((j) => j.inv));
  const seen = new Map<string, number>();
  const fresh = parsed.jobs.filter((j) => {
    const sig = rowSignature(j);
    const used = seen.get(sig) ?? 0;
    seen.set(sig, used + 1);
    // The Nth copy in the file is a duplicate only if the table already has N.
    return used >= (already.get(sig) ?? 0);
  });
  const dupes = parsed.jobs.length - fresh.length;

  if (fresh.length === 0) {
    back('ok', `Nothing new — all ${parsed.jobs.length} jobs in that file are already in the system.`);
  }

  const rows = fresh.map((j) => ({
    inv: j.inv,
    haul: j.haul,
    original_price: j.price,
    dbh: j.dbh,
    stems: j.stems,
    height: j.height,
    crown: j.crown,
    species: j.species,
    seller: j.seller,
    date: j.date,
    muni: j.muni,
    kind: j.kind,
    status: 'pending',
    source: 'upload',
    added_by: user.email,
    note: j.note,
    // Same snapshot the manual form takes, so later edits show as adjustments.
    original: {
      dbh: j.dbh,
      height: j.height,
      crown: j.crown,
      stems: j.stems,
      species: j.species,
      seller: j.seller,
      date: j.date,
      haul: j.haul,
      muni: j.muni,
    },
  }));

  const supabase = await serverClient();
  const CHUNK = 200;
  let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('removals').insert(rows.slice(i, i + CHUNK));
    if (error) {
      // Report what did land, so a partial import is never a silent mystery.
      const sofar = saved > 0 ? ` ${saved} jobs were saved before it failed.` : '';
      back('error', `Import failed: ${error.message}.${sofar}`);
    }
    saved += rows.slice(i, i + CHUNK).length;
  }

  const measured = fresh.filter((j) => j.fullyMeasured).length;
  const partial = saved - measured;
  const bits = [
    `Imported ${saved} job${saved === 1 ? '' : 's'} (${shortDate(parsed.firstDate)}–${shortDate(parsed.lastDate)}) to Pending below.`,
    `${measured} are fully measured single-trunk trees; ${partial} need a look.`,
  ];
  if (dupes > 0) bits.push(`Skipped ${dupes} already in the system.`);
  const notRemovals = parsed.skipped.filter((s) => s.reason === 'not-a-removal').length;
  const notDone = parsed.skipped.filter((s) => s.reason === 'not-completed').length;
  if (notRemovals > 0) bits.push(`Ignored ${notRemovals} non-removal line items.`);
  if (notDone > 0) bits.push(`Ignored ${notDone} jobs not marked Completed.`);

  revalidatePath(DATA_PATH);
  revalidatePath('/cost-analysis');
  back('ok', bits.join(' '));
}

/**
 * Approve the whole pending queue. A 100-row upload is unreviewable one button at
 * a time, and Pending already shows each row's effect on the numbers, so this is
 * the "I've looked, take them all" switch.
 */
export async function includeAllPending(): Promise<void> {
  const user = await requireLeadership();
  const now = new Date().toISOString();

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from('removals')
    .update({ status: 'included', reviewed_by: user.email, reviewed_at: now })
    .eq('status', 'pending')
    .select('id');

  if (error) back('error', `Could not include the pending jobs: ${error.message}`);

  revalidatePath(DATA_PATH);
  revalidatePath('/cost-analysis');
  const n = data?.length ?? 0;
  back('ok', `Included ${n} job${n === 1 ? '' : 's'}. The analysis figures update on next load.`);
}

export async function setEntryStatus(formData: FormData): Promise<void> {
  const user = await requireLeadership();

  const id = String(formData.get('id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (!id) back('error', 'Missing entry id.');
  if (!['pending', 'included', 'removed'].includes(status)) {
    back('error', 'Invalid status.');
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    reviewed_by: user.email,
    reviewed_at: now,
  };
  if (status === 'removed') {
    patch.removed_by = user.email;
    patch.removed_at = now;
  }

  const supabase = await serverClient();
  const { error } = await supabase.from('removals').update(patch).eq('id', id);

  if (error) back('error', `Could not update the job: ${error.message}`);

  revalidatePath(DATA_PATH);
  revalidatePath('/cost-analysis');
  const verb = status === 'included' ? 'included' : status === 'removed' ? 'removed' : 'set to pending';
  back('ok', `Job ${verb}. The analysis figures update on next load.`);
}
