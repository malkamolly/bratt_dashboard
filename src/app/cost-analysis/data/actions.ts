'use server';

// ============================================================================
// Cost Analysis — leadership data entry (server actions)
// ============================================================================
// Two actions, both gated to leadership (admin / sales_manager):
//   - addEntry:       add a job to the holding pen (lands as 'pending').
//   - setEntryStatus: include / exclude / re-pend an entry after review.
// Only 'included' entries reach the analysis (see cost-analysis.ts). The page
// is force-dynamic, so a status change shows up in the figures on next load.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser, canSeeCostAnalysis } from '@/lib/auth';
import { staticRemovalInvoices } from '@/lib/cost-analysis';

const DATA_PATH = '/cost-analysis/data';

async function requireLeadership() {
  const u = await getAllowedUser();
  if (!u || !canSeeCostAnalysis(u.role)) {
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

/** House rule: store people as First name + Last initial (e.g. "Patrick W"). */
function normalizeSeller(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  const parts = s.split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}`;
}

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

  // ---- Duplicate-invoice guardrail (part 1: the static historical baseline) ----
  // The table's UNIQUE(inv) constraint stops entry-vs-entry duplicates; this
  // stops re-entering an invoice that's already counted in the baseline export.
  if (staticRemovalInvoices().has(inv)) {
    back('error', `Invoice ${inv} is already in the historical data — no need to add it.`);
  }

  const supabase = await serverClient();
  const { error } = await supabase.from('removal_entries').insert({
    inv,
    haul,
    price,
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
    added_by: user.email,
  });

  if (error) {
    // 23505 = unique_violation on inv (part 2 of the guardrail).
    if (error.code === '23505') {
      back('error', `Invoice ${inv} has already been entered.`);
    }
    back('error', `Could not save the job: ${error.message}`);
  }

  revalidatePath(DATA_PATH);
  revalidatePath('/cost-analysis');
  back('ok', `Added invoice ${inv} — it's pending your review below.`);
}

export async function setEntryStatus(formData: FormData): Promise<void> {
  const user = await requireLeadership();

  const id = String(formData.get('id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (!id) back('error', 'Missing entry id.');
  if (!['pending', 'included', 'excluded'].includes(status)) {
    back('error', 'Invalid status.');
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('removal_entries')
    .update({ status, reviewed_by: user.email, reviewed_at: new Date().toISOString() })
    .eq('id', id);

  if (error) back('error', `Could not update the job: ${error.message}`);

  revalidatePath(DATA_PATH);
  revalidatePath('/cost-analysis');
  const verb = status === 'included' ? 'included' : status === 'excluded' ? 'excluded' : 'set to pending';
  back('ok', `Job ${verb}. The analysis figures update on next load.`);
}
