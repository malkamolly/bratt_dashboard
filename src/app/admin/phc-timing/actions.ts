'use server';

// ============================================================================
// PHC treatment-timing admin actions
// ============================================================================
// One "Save" button per treatment on /admin/phc-timing. Admin-only: the
// requireAdmin() guard errors early, and the RLS policy on the table is the
// backstop (only admins can write). Per the requirement that ONLY an admin may
// adjust anything about treatment timing.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';

/** Parse a non-negative integer, or fall back. */
function parseIntOr(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(String(raw ?? '').trim());
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** Parse a month select: '' -> null, otherwise an int clamped to 1-12 or null. */
function parseMonth(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

function parseType(raw: FormDataEntryValue | null): 'spray' | 'injection' | null {
  const s = String(raw ?? '').trim();
  return s === 'spray' || s === 'injection' ? s : null;
}

export async function updatePhcTiming(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '').trim();
  if (!id) redirect(`/admin/phc-timing?error=${encodeURIComponent('Missing treatment id.')}`);

  const anytime = formData.get('anytime') === 'on';

  // When a treatment is "anytime", the window months are meaningless — clear
  // them so the data can't end up half-set and confusing later.
  const windowStart = anytime ? null : parseMonth(formData.get('window_start_month'));
  const windowEnd = anytime ? null : parseMonth(formData.get('window_end_month'));
  const window2Start = anytime ? null : parseMonth(formData.get('window2_start_month'));
  const window2End = anytime ? null : parseMonth(formData.get('window2_end_month'));

  const priceBookId = String(formData.get('price_book_id') ?? '').trim() || null;

  const supabase = await serverClient();
  const { error } = await supabase
    .from('phc_treatment_timing')
    .update({
      treatment_type: parseType(formData.get('treatment_type')),
      visits: Math.max(1, parseIntOr(formData.get('visits'), 1)),
      visit_interval_days: Math.max(1, parseIntOr(formData.get('visit_interval_days'), 14)),
      frequency_months: Math.max(1, parseIntOr(formData.get('frequency_months'), 12)),
      anytime,
      is_first_of_season: formData.get('is_first_of_season') === 'on',
      window_start_month: windowStart,
      window_end_month: windowEnd,
      window2_start_month: window2Start,
      window2_end_month: window2End,
      timing_note: String(formData.get('timing_note') ?? '').trim() || null,
      needs_pricing: formData.get('needs_pricing') === 'on',
      price_book_id: priceBookId,
    })
    .eq('id', id);

  if (error) redirect(`/admin/phc-timing?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/admin/phc-timing');
  redirect('/admin/phc-timing?saved=timing');
}
