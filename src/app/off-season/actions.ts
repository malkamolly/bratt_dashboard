'use server';

// ============================================================================
// Off-Season tracker server actions
// ============================================================================
// Two actions:
//   * saveOffSeasonDay      — upsert one day's numbers (all four tracks) for
//                             the current season, from the daily entry form.
//   * saveOffSeasonSettings — admin: edit each track's goal + booking window,
//                             and pick which season is "current".
//
// RLS (migration 062) already enforces "must be admin/office/sales-manager",
// but we re-check here so we can show a friendly error.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser, canUseOffSeason } from '@/lib/auth';
import {
  TRACKS,
  OS_WINDOWS,
  trackKey,
  type WorkType,
  type OsWindow,
} from '@/lib/off-season-data';

export type SaveResult = { ok: false; error: string } | undefined;

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
}

// number (rounded to cents), null when blank, or 'bad' when unparseable.
function parseAmount(raw: FormDataEntryValue | null): number | null | 'bad' {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const n = Number(s.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return 'bad';
  return Math.round(n * 100) / 100;
}

// ----------------------------------------------------------------------------
// Daily entry: save all four tracks for one date in the current season.
// ----------------------------------------------------------------------------
export async function saveOffSeasonDay(
  _prev: SaveResult,
  formData: FormData,
): Promise<SaveResult> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!canUseOffSeason(user.role)) {
    return { ok: false, error: 'You do not have permission to edit this.' };
  }

  const date = String(formData.get('entry_date') ?? '');
  if (!isValidIsoDate(date)) {
    return { ok: false, error: 'Please pick a valid date.' };
  }

  const seasonId = String(formData.get('season_id') ?? '');
  if (!seasonId) return { ok: false, error: 'Missing season.' };

  const rows: {
    season_id: string;
    work_type: WorkType;
    os_window: OsWindow;
    entry_date: string;
    sold_revenue: number;
    scheduled_revenue: number;
    discount_given: number;
    created_by: string;
  }[] = [];

  for (const { workType, osWindow } of TRACKS) {
    const key = trackKey(workType, osWindow);
    const sold = parseAmount(formData.get(`sold__${key}`));
    const scheduled = parseAmount(formData.get(`scheduled__${key}`));
    const discount = parseAmount(formData.get(`discount__${key}`));
    if (sold === 'bad' || scheduled === 'bad' || discount === 'bad') {
      return { ok: false, error: 'Please check the numbers you entered.' };
    }
    // Skip a track entirely if every field is blank for this day.
    if (sold == null && scheduled == null && discount == null) continue;
    rows.push({
      season_id: seasonId,
      work_type: workType,
      os_window: osWindow,
      entry_date: date,
      sold_revenue: sold ?? 0,
      scheduled_revenue: scheduled ?? 0,
      discount_given: discount ?? 0,
      created_by: user.email,
    });
  }

  if (rows.length === 0) {
    return { ok: false, error: 'Enter at least one number to save.' };
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('off_season_entries')
    .upsert(rows, { onConflict: 'season_id,work_type,os_window,entry_date' });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/off-season');
  revalidatePath('/off-season/entry');
  redirect(`/off-season/entry?date=${encodeURIComponent(date)}&saved=1`);
}

// ----------------------------------------------------------------------------
// Delete one day's entries (all tracks) — the "Clear this day" button.
// ----------------------------------------------------------------------------
export async function deleteOffSeasonDay(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canUseOffSeason(user.role)) redirect('/access-denied');

  const date = String(formData.get('entry_date') ?? '');
  const seasonId = String(formData.get('season_id') ?? '');
  if (!isValidIsoDate(date) || !seasonId) {
    redirect(`/off-season/entry?date=${encodeURIComponent(date)}`);
  }

  const supabase = await serverClient();
  await supabase
    .from('off_season_entries')
    .delete()
    .eq('season_id', seasonId)
    .eq('entry_date', date);

  revalidatePath('/off-season');
  revalidatePath('/off-season/entry');
  redirect(`/off-season/entry?date=${encodeURIComponent(date)}&deleted=1`);
}

// ----------------------------------------------------------------------------
// Settings: goals + windows per track, and which season is current.
// ----------------------------------------------------------------------------
export async function saveOffSeasonSettings(
  _prev: SaveResult,
  formData: FormData,
): Promise<SaveResult> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!canUseOffSeason(user.role)) {
    return { ok: false, error: 'You do not have permission to edit this.' };
  }

  const supabase = await serverClient();

  // Fields: goal__<sid>__<osWindow> (+ step__ / start__ / end__).
  const targets: {
    season_id: string;
    os_window: OsWindow;
    goal_amount: number;
    milestone_step: number;
    window_start: string;
    window_end: string;
  }[] = [];

  for (const key of formData.keys()) {
    if (!key.startsWith('goal__')) continue;
    const parts = key.slice('goal__'.length).split('__');
    if (parts.length !== 2) continue;
    const [seasonId, win] = parts as [string, OsWindow];
    if (!OS_WINDOWS.includes(win)) continue;

    const goal = parseAmount(formData.get(key));
    const step = parseAmount(formData.get(`step__${seasonId}__${win}`));
    if (goal === 'bad' || step === 'bad') {
      return { ok: false, error: 'Please check the goal and milestone amounts.' };
    }
    const start = String(formData.get(`start__${seasonId}__${win}`) ?? '');
    const end = String(formData.get(`end__${seasonId}__${win}`) ?? '');
    if (!isValidIsoDate(start) || !isValidIsoDate(end)) {
      return { ok: false, error: 'Please pick valid window start/end dates.' };
    }
    if (end < start) {
      return { ok: false, error: 'A window end can’t be before its start.' };
    }
    targets.push({
      season_id: seasonId,
      os_window: win,
      goal_amount: goal ?? 0,
      milestone_step: step && step > 0 ? step : 100_000,
      window_start: start,
      window_end: end,
    });
  }

  if (targets.length > 0) {
    const { error } = await supabase
      .from('off_season_targets')
      .upsert(targets, { onConflict: 'season_id,os_window' });
    if (error) return { ok: false, error: error.message };
  }

  // Flip the current season in two steps so we never momentarily have two.
  const currentSeasonId = String(formData.get('current_season_id') ?? '');
  if (currentSeasonId) {
    const clearRes = await supabase
      .from('off_season_seasons')
      .update({ is_current: false })
      .eq('is_current', true);
    if (clearRes.error) return { ok: false, error: clearRes.error.message };

    const setRes = await supabase
      .from('off_season_seasons')
      .update({ is_current: true })
      .eq('id', currentSeasonId);
    if (setRes.error) return { ok: false, error: setRes.error.message };
  }

  revalidatePath('/off-season');
  revalidatePath('/off-season/settings');
  redirect('/off-season/settings?saved=1');
}
