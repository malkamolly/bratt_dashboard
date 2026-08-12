'use server';

// ============================================================================
// Cost Analysis — job management actions (edit / remove / restore)
// ============================================================================
// All gated to the three Cost Analysis people. Every change revalidates the
// analysis so the figures update immediately.
//
// Price rule: original_price (the real billed amount) is NEVER overwritten here.
// Edits set adjusted_price — leadership's "what it should have been" — and the
// analysis uses the adjustment when present. Clearing the adjusted field reverts
// the job to its original price.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser, canSeeCostAnalysis } from '@/lib/auth';

const JOBS_PATH = '/cost-analysis/jobs';

async function requireLeadership() {
  const u = await getAllowedUser();
  if (!u || !canSeeCostAnalysis(u.email)) {
    throw new Error('Forbidden: Cost Analysis access required.');
  }
  return u;
}

/** Only allow redirects back into the Cost Analysis area. */
function safeReturn(v: FormDataEntryValue | null): string {
  const s = String(v ?? '').trim();
  return s.startsWith('/cost-analysis') ? s : JOBS_PATH;
}

function back(to: string, kind: 'ok' | 'error', msg: string): never {
  const sep = to.includes('?') ? '&' : '?';
  redirect(`${to}${sep}${kind}=${encodeURIComponent(msg)}`);
}

/** "" -> null; otherwise a finite number, or undefined if it doesn't parse. */
function optNum(v: FormDataEntryValue | null): number | null | undefined {
  const s = (v == null ? '' : String(v)).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeSeller(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  const parts = s.split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}`;
}

export async function editJob(formData: FormData): Promise<void> {
  const user = await requireLeadership();
  const id = String(formData.get('id') ?? '').trim();
  const returnTo = safeReturn(formData.get('returnTo'));
  const editPath = `${JOBS_PATH}/${id}/edit`;
  if (!id) back(JOBS_PATH, 'error', 'Missing job id.');

  // Where a validation error lands. The full edit screen keeps you on itself, but
  // the inline row editor passes its own page so a bad number doesn't yank you out
  // of the review queue.
  const rawErrorTo = String(formData.get('errorTo') ?? '').trim();
  const errorTo = rawErrorTo.startsWith('/cost-analysis') ? rawErrorTo : editPath;

  const dbh = optNum(formData.get('dbh'));
  if (dbh === undefined) back(errorTo, 'error', 'DBH must be a number.');
  if (dbh !== null && dbh <= 0) back(errorTo, 'error', 'DBH must be greater than 0.');

  const height = optNum(formData.get('height'));
  const crown = optNum(formData.get('crown'));
  const adjusted = optNum(formData.get('adjusted_price'));
  if (height === undefined) back(errorTo, 'error', 'Height must be a number (or blank).');
  if (crown === undefined) back(errorTo, 'error', 'Crown spread must be a number (or blank).');
  if (adjusted === undefined) back(errorTo, 'error', 'Adjusted price must be a number (or blank).');
  if (adjusted !== null && adjusted < 0) back(errorTo, 'error', 'Adjusted price cannot be negative.');

  const stemsRaw = optNum(formData.get('stems'));
  const stems = stemsRaw == null || stemsRaw < 1 ? 1 : Math.round(stemsRaw);

  const patch = {
    dbh,
    stems,
    height,
    crown,
    species: String(formData.get('species') ?? '').trim() || null,
    seller: normalizeSeller(String(formData.get('seller') ?? '')),
    date: String(formData.get('date') ?? '').trim() || null,
    haul: String(formData.get('haul') ?? 'yes') !== 'no',
    muni: String(formData.get('muni') ?? '') === 'on',
    adjusted_price: adjusted, // null clears the adjustment (reverts to original)
    note: String(formData.get('note') ?? '').trim() || null,
    updated_at: new Date().toISOString(),
    reviewed_by: user.email,
  };

  const supabase = await serverClient();
  const { error } = await supabase.from('removals').update(patch).eq('id', id);
  if (error) back(errorTo, 'error', `Could not save: ${error.message}`);

  revalidatePath('/cost-analysis');
  revalidatePath(JOBS_PATH);
  back(returnTo, 'ok', 'Job updated.');
}

export async function removeJob(formData: FormData): Promise<void> {
  const user = await requireLeadership();
  const id = String(formData.get('id') ?? '').trim();
  const returnTo = safeReturn(formData.get('returnTo'));
  if (!id) back(JOBS_PATH, 'error', 'Missing job id.');

  const now = new Date().toISOString();
  const supabase = await serverClient();
  const { error } = await supabase
    .from('removals')
    .update({ status: 'removed', removed_by: user.email, removed_at: now })
    .eq('id', id);
  if (error) back(returnTo, 'error', `Could not remove: ${error.message}`);

  revalidatePath('/cost-analysis');
  revalidatePath(JOBS_PATH);
  back(returnTo, 'ok', 'Job removed — it no longer counts. You can restore it under "Show removed".');
}

export async function restoreJob(formData: FormData): Promise<void> {
  await requireLeadership();
  const id = String(formData.get('id') ?? '').trim();
  const returnTo = safeReturn(formData.get('returnTo'));
  if (!id) back(JOBS_PATH, 'error', 'Missing job id.');

  const supabase = await serverClient();
  const { error } = await supabase
    .from('removals')
    .update({ status: 'included', removed_by: null, removed_at: null })
    .eq('id', id);
  if (error) back(returnTo, 'error', `Could not restore: ${error.message}`);

  revalidatePath('/cost-analysis');
  revalidatePath(JOBS_PATH);
  back(returnTo, 'ok', 'Job restored — it counts again.');
}
