'use server';

// ============================================================================
// In-progress (WIP) save action
// ============================================================================
// Bulk-upsert one row per crew into crew_in_progress. Form field names look
// like "amount__<crew_id>" so the action can match the same convention used
// by the daily-entry forms.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser } from '@/lib/auth';

export type WipSaveResult = { ok: false; error: string } | undefined;

function parseAmount(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return 0;
  const cleaned = s.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export async function saveInProgressAmounts(
  _prev: WipSaveResult,
  formData: FormData,
): Promise<WipSaveResult> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const rows: { crew_id: string; amount: number; updated_by: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('amount__')) continue;
    const crew_id = key.slice('amount__'.length);
    const amount = parseAmount(value);
    if (amount == null) {
      return { ok: false, error: `Bad number for one of the crews.` };
    }
    rows.push({ crew_id, amount, updated_by: user.email });
  }

  if (rows.length === 0) {
    return { ok: false, error: 'Nothing to save.' };
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('crew_in_progress')
    .upsert(rows, { onConflict: 'crew_id' });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/production');
  revalidatePath('/production/in-progress');
  redirect('/production/in-progress?saved=1');
}
