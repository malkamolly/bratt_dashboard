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
import { ADDONS_SALESPERSON_NAME } from '@/lib/sales-data';

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

  // Regular per-salesperson amount fields are named "amount__<salesperson_id>".
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

  // Add-Ons attribution rows. Field naming:
  //   addon_key__<rowKey>             (presence marker — gives us the row id)
  //   addon_crew_member_id__<rowKey>  (selected crew member uuid)
  //   addon_amount__<rowKey>          (dollar amount)
  //   addon_note__<rowKey>            (optional note)
  // Rows with no crew member selected AND no amount are silently dropped
  // so the user can leave an empty "Add another" row dangling.
  const addonRows: {
    entry_date: string;
    crew_member_id: string;
    amount: number;
    note: string | null;
    created_by: string;
  }[] = [];
  const seenKeys = new Set<string>();
  for (const key of formData.keys()) {
    if (!key.startsWith('addon_key__')) continue;
    const rowKey = key.slice('addon_key__'.length);
    if (seenKeys.has(rowKey)) continue;
    seenKeys.add(rowKey);

    const crewMemberId = String(
      formData.get(`addon_crew_member_id__${rowKey}`) ?? '',
    ).trim();
    const amount = parseAmount(formData.get(`addon_amount__${rowKey}`));
    const noteRaw = String(formData.get(`addon_note__${rowKey}`) ?? '').trim();

    const isEmpty = !crewMemberId && (amount == null || amount === 0);
    if (isEmpty) continue;

    if (amount == null) {
      return { ok: false, error: 'Bad number for one of the add-on rows.' };
    }
    if (!crewMemberId) {
      return {
        ok: false,
        error: 'Pick a crew member for every add-on row, or remove it.',
      };
    }

    addonRows.push({
      entry_date: date,
      crew_member_id: crewMemberId,
      amount,
      note: noteRaw === '' ? null : noteRaw,
      created_by: user.email,
    });
  }

  const supabase = await serverClient();

  // Look up the Add-Ons salesperson id so we can keep its sales_entries row
  // in sync with the sum of the attribution rows.
  const addonsLookup = await supabase
    .from('salespeople')
    .select('id')
    .eq('name', ADDONS_SALESPERSON_NAME)
    .maybeSingle();
  const addonsSalespersonId = addonsLookup.data?.id as string | undefined;

  // If we have an Add-Ons salesperson, append a row for it using the sum of
  // the attribution amounts (so existing dashboard math keeps working).
  if (addonsSalespersonId) {
    const sum = addonRows.reduce((s, r) => s + r.amount, 0);
    rows.push({
      entry_date: date,
      salesperson_id: addonsSalespersonId,
      amount: Math.round(sum * 100) / 100,
      created_by: user.email,
    });
  }

  if (rows.length === 0 && addonRows.length === 0) {
    return { ok: false, error: 'Nothing to save.' };
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('sales_entries')
      .upsert(rows, { onConflict: 'entry_date,salesperson_id' });
    if (error) return { ok: false, error: error.message };
  }

  // Replace the day's attributions: delete the existing rows, insert the
  // new set. With a handful of rows per day this is dead simple and
  // idempotent — no matching by id needed.
  if (addonsSalespersonId) {
    const delRes = await supabase
      .from('sales_addon_attributions')
      .delete()
      .eq('entry_date', date);
    if (delRes.error) return { ok: false, error: delRes.error.message };

    if (addonRows.length > 0) {
      const insRes = await supabase
        .from('sales_addon_attributions')
        .insert(addonRows);
      if (insRes.error) return { ok: false, error: insRes.error.message };
    }
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
