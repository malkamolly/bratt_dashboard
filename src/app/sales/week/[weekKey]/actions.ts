'use server';

// ============================================================================
// Week-level sales entry server actions
// ============================================================================
// Upsert every (date, salesperson) cell in a week in one round trip. Field
// names follow the pattern "amount__<YYYY-MM-DD>__<salesperson_id>".
// ============================================================================

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser } from '@/lib/auth';

export type SaveWeekResult = { ok: false; error: string } | undefined;

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
  return Math.round(n * 100) / 100;
}

export async function saveWeekEntries(
  _prev: SaveWeekResult,
  formData: FormData,
): Promise<SaveWeekResult> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const weekKey = String(formData.get('week_key') ?? '');
  const year = String(formData.get('year') ?? '');
  const month = String(formData.get('month') ?? '');
  if (!isValidIsoDate(weekKey)) {
    return { ok: false, error: 'Bad week key.' };
  }

  const rows: {
    entry_date: string;
    salesperson_id: string;
    amount: number;
    created_by: string;
  }[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('amount__')) continue;
    const rest = key.slice('amount__'.length);
    const sep = rest.indexOf('__');
    if (sep < 0) continue;
    const entry_date = rest.slice(0, sep);
    const salesperson_id = rest.slice(sep + 2);
    if (!isValidIsoDate(entry_date) || !salesperson_id) continue;

    const amount = parseAmount(value);
    if (amount == null) {
      return { ok: false, error: 'Bad number in one of the fields.' };
    }
    rows.push({
      entry_date,
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
  revalidatePath(`/sales/week/${weekKey}`);

  const qs = new URLSearchParams();
  if (year) qs.set('year', year);
  if (month) qs.set('month', month);
  qs.set('saved', '1');
  redirect(`/sales/week/${encodeURIComponent(weekKey)}?${qs.toString()}`);
}

export async function deleteWeekCell(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  const weekKey = String(formData.get('week_key') ?? '');
  const year = String(formData.get('year') ?? '');
  const month = String(formData.get('month') ?? '');
  // Encoded as "<YYYY-MM-DD>::<salesperson_id>" so a single submit button
  // can carry both pieces of the cell identity.
  const target = String(formData.get('delete_target') ?? '');
  const [entry_date, salesperson_id] = target.split('::');

  if (
    !isValidIsoDate(weekKey) ||
    !entry_date ||
    !isValidIsoDate(entry_date) ||
    !salesperson_id
  ) {
    redirect(`/sales/week/${encodeURIComponent(weekKey)}`);
  }

  const supabase = await serverClient();
  await supabase
    .from('sales_entries')
    .delete()
    .eq('entry_date', entry_date)
    .eq('salesperson_id', salesperson_id);

  revalidatePath('/sales');
  revalidatePath(`/sales/week/${weekKey}`);

  const qs = new URLSearchParams();
  if (year) qs.set('year', year);
  if (month) qs.set('month', month);
  qs.set('deleted', '1');
  redirect(`/sales/week/${encodeURIComponent(weekKey)}?${qs.toString()}`);
}
