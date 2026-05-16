'use server';

// ============================================================================
// Production entry server actions
// ============================================================================
// One save action that upserts all (jobs, revenue) entries for the day, and
// a delete action that removes a single (date, crew) row. Mirrors the
// sales entry actions in shape.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser } from '@/lib/auth';

export type SaveResult = { ok: false; error: string } | undefined;

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function parseMoney(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return 0;
  const cleaned = s.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseJobsCount(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return 0;
  const n = Number(s.replace(/[\s,]/g, ''));
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export async function saveProductionEntries(
  _prev: SaveResult,
  formData: FormData,
): Promise<SaveResult> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const date = String(formData.get('entry_date') ?? '');
  if (!isValidIsoDate(date)) {
    return { ok: false, error: 'Please pick a valid date.' };
  }

  // For each crew there are two inputs: "jobs__<crew_id>" and
  // "revenue__<crew_id>".
  const rowsByCrew = new Map<
    string,
    { jobs?: number; revenue?: number }
  >();

  for (const [key, value] of formData.entries()) {
    if (key.startsWith('jobs__')) {
      const id = key.slice('jobs__'.length);
      const n = parseJobsCount(value);
      if (n == null) {
        return { ok: false, error: 'Bad jobs count for one of the crews.' };
      }
      rowsByCrew.set(id, { ...(rowsByCrew.get(id) ?? {}), jobs: n });
    } else if (key.startsWith('revenue__')) {
      const id = key.slice('revenue__'.length);
      const n = parseMoney(value);
      if (n == null) {
        return { ok: false, error: 'Bad revenue for one of the crews.' };
      }
      rowsByCrew.set(id, { ...(rowsByCrew.get(id) ?? {}), revenue: n });
    }
  }

  const rows = Array.from(rowsByCrew.entries()).map(([crew_id, vals]) => ({
    entry_date: date,
    crew_id,
    jobs: vals.jobs ?? 0,
    revenue: vals.revenue ?? 0,
    created_by: user.email,
  }));

  if (rows.length === 0) {
    return { ok: false, error: 'Nothing to save.' };
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('production_entries')
    .upsert(rows, { onConflict: 'entry_date,crew_id' });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/production');
  revalidatePath('/production/entry');
  redirect(`/production/entry?date=${encodeURIComponent(date)}&saved=1`);
}

export async function deleteProductionEntry(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  const date = String(formData.get('entry_date') ?? '');
  const crewId = String(formData.get('delete_crew_id') ?? '');
  if (!isValidIsoDate(date) || !crewId) {
    redirect(`/production/entry?date=${encodeURIComponent(date)}`);
  }

  const supabase = await serverClient();
  await supabase
    .from('production_entries')
    .delete()
    .eq('entry_date', date)
    .eq('crew_id', crewId);

  revalidatePath('/production');
  revalidatePath('/production/entry');
  redirect(`/production/entry?date=${encodeURIComponent(date)}&deleted=1`);
}
