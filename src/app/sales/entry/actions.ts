'use server';

// ============================================================================
// Sales entry server actions
// ============================================================================
// One action: upsert the day's sales entries for every salesperson at once.
// RLS on the table already enforces "must be on the allowlist", but we
// double-check here so we can return a friendly error.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser, canAccessHub } from '@/lib/auth';

function safeReturnTo(raw: FormDataEntryValue | null, fallback: string): string {
  if (!raw) return fallback;
  const s = String(raw);
  if (!s.startsWith('/')) return fallback;
  if (s.startsWith('//')) return fallback;
  return s;
}

// On success the action redirects, so the return type only models errors.
export type SaveResult = { ok: false; error: string } | undefined;

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function parseAmount(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return 0;
  const cleaned = s.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100; // store to the cent
}

export async function saveSalesEntries(
  _prev: SaveResult,
  formData: FormData,
): Promise<SaveResult> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const date = String(formData.get('entry_date') ?? '');
  if (!isValidIsoDate(date)) {
    return { ok: false, error: 'Please pick a valid date.' };
  }

  // Form fields are named "amount__<salesperson_id>".
  const rows: { entry_date: string; salesperson_id: string; amount: number; created_by: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('amount__')) continue;
    const salesperson_id = key.slice('amount__'.length);
    const amount = parseAmount(value);
    if (amount == null) {
      return { ok: false, error: `Bad number for one of the salespeople.` };
    }
    rows.push({
      entry_date: date,
      salesperson_id,
      amount,
      created_by: user.email,
    });
  }

  if (rows.length === 0) {
    return { ok: false, error: 'Nothing to save.' };
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('sales_entries')
    .upsert(rows, { onConflict: 'entry_date,salesperson_id' });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/sales');
  revalidatePath('/sales/entry');

  // Redirect (with date preserved) so the form re-loads fresh values.
  redirect(`/sales/entry?date=${encodeURIComponent(date)}&saved=1`);
}

// ----------------------------------------------------------------------------
// Delete one (date, salesperson) entry.
// Triggered from the per-row "×" button on the entry form.
// ----------------------------------------------------------------------------
export async function deleteSalesEntry(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user) {
    redirect('/login');
  }

  const date = String(formData.get('entry_date') ?? '');
  const salespersonId = String(formData.get('delete_salesperson_id') ?? '');
  if (!isValidIsoDate(date) || !salespersonId) {
    redirect(`/sales/entry?date=${encodeURIComponent(date)}`);
  }

  const supabase = await serverClient();
  await supabase
    .from('sales_entries')
    .delete()
    .eq('entry_date', date)
    .eq('salesperson_id', salespersonId);

  revalidatePath('/sales');
  revalidatePath('/sales/entry');
  redirect(`/sales/entry?date=${encodeURIComponent(date)}&deleted=1`);
}

// ----------------------------------------------------------------------------
// Single-cell save + delete (used by /sales/entry/cell).
// Saves or removes exactly one (date, salesperson) row, then bounces the user
// back to whatever page sent them here (the arborist's detail page).
// ----------------------------------------------------------------------------

export type CellSaveResult = { ok: false; error: string } | undefined;

export async function saveSalesCell(
  _prev: CellSaveResult,
  formData: FormData,
): Promise<CellSaveResult> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!canAccessHub(user.role, 'pace')) {
    return { ok: false, error: 'You do not have permission to edit sales.' };
  }

  const date = String(formData.get('entry_date') ?? '');
  const salespersonId = String(formData.get('salesperson_id') ?? '');
  const returnTo = safeReturnTo(formData.get('return_to'), '/sales');

  if (!isValidIsoDate(date)) {
    return { ok: false, error: 'Please pick a valid date.' };
  }
  if (!salespersonId) {
    return { ok: false, error: 'Missing salesperson.' };
  }

  const amount = parseAmount(formData.get('amount'));
  if (amount == null) {
    return { ok: false, error: 'Please enter a valid number.' };
  }

  const supabase = await serverClient();
  const { error } = await supabase.from('sales_entries').upsert(
    [
      {
        entry_date: date,
        salesperson_id: salespersonId,
        amount,
        created_by: user.email,
      },
    ],
    { onConflict: 'entry_date,salesperson_id' },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath('/sales');
  revalidatePath('/sales/entry');
  revalidatePath(returnTo);
  redirect(returnTo);
}

export async function deleteSalesCell(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canAccessHub(user.role, 'pace')) redirect('/access-denied');

  const date = String(formData.get('entry_date') ?? '');
  const salespersonId = String(formData.get('salesperson_id') ?? '');
  const returnTo = safeReturnTo(formData.get('return_to'), '/sales');

  if (!isValidIsoDate(date) || !salespersonId) {
    redirect(returnTo);
  }

  const supabase = await serverClient();
  await supabase
    .from('sales_entries')
    .delete()
    .eq('entry_date', date)
    .eq('salesperson_id', salespersonId);

  revalidatePath('/sales');
  revalidatePath('/sales/entry');
  revalidatePath(returnTo);
  redirect(returnTo);
}
