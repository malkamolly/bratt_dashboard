'use server';

// ============================================================================
// Field Crew Hub — server actions
// ============================================================================
// All writes go through here so we can enforce canEditCrew() in one place
// (RLS will reject anyway, but explicit checks give nicer errors).
// ============================================================================

import { revalidatePath } from 'next/cache';
import { getAllowedUser, canEditCrew } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';

export type TrainingSessionEntryInput = {
  training_key: string;
  hours: number;
};

export type RecordTrainingSessionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Record a single training session for one employee.
 *
 * A session = ONE date + ONE notes blob + N (training, hours) entries.
 * Side effects:
 *   1. Insert a row into field_crew_training_sessions.
 *   2. Insert N rows into field_crew_training_session_entries.
 *   3. Append one summary line to field_crew_activity so the session shows
 *      up in the daily feed and the employee's recent activity list.
 *   4. Revalidate the profile + feed pages so the new data shows up
 *      immediately on next render.
 */
export async function recordTrainingSession(input: {
  employee_slug: string;
  session_date: string; // YYYY-MM-DD
  notes: string | null;
  entries: TrainingSessionEntryInput[];
}): Promise<RecordTrainingSessionResult> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!canEditCrew(user.role)) {
    return { ok: false, error: 'You do not have permission to log training.' };
  }

  // Filter out empty rows (hours <= 0 or no training key).
  const cleanEntries = input.entries.filter(
    (e) => e.training_key && Number.isFinite(e.hours) && e.hours > 0,
  );
  if (cleanEntries.length === 0) {
    return { ok: false, error: 'Add at least one training row with hours.' };
  }
  if (!input.session_date) {
    return { ok: false, error: 'Pick a date.' };
  }

  const supabase = await serverClient();

  // Confirm the employee exists (gives a clearer error than a FK violation).
  const { data: emp } = await supabase
    .from('field_crew_employees')
    .select('slug, name')
    .eq('slug', input.employee_slug)
    .maybeSingle();
  if (!emp) return { ok: false, error: 'Employee not found.' };

  // Look up training display names so the activity line is human-readable.
  const { data: trainings } = await supabase
    .from('field_crew_trainings')
    .select('key, display_name')
    .in('key', cleanEntries.map((e) => e.training_key));
  const nameByKey = new Map<string, string>();
  for (const t of (trainings ?? []) as { key: string; display_name: string }[]) {
    nameByKey.set(t.key, t.display_name);
  }

  // 1. Insert the session header.
  const { data: session, error: sessionErr } = await supabase
    .from('field_crew_training_sessions')
    .insert({
      employee_slug: input.employee_slug,
      session_date: input.session_date,
      notes: input.notes?.trim() || null,
      created_by: user.email,
    })
    .select('id')
    .single();
  if (sessionErr || !session) {
    return { ok: false, error: sessionErr?.message ?? 'Could not save session.' };
  }

  // 2. Insert the entries.
  const { error: entriesErr } = await supabase
    .from('field_crew_training_session_entries')
    .insert(
      cleanEntries.map((e) => ({
        session_id: session.id,
        training_key: e.training_key,
        hours: e.hours,
      })),
    );
  if (entriesErr) {
    // Roll back the session row so we don't leave an orphan header.
    await supabase.from('field_crew_training_sessions').delete().eq('id', session.id);
    return { ok: false, error: entriesErr.message };
  }

  // 3. Append a summary activity entry. Format:
  //    "Training session: 5h — Stumpgrinding 2h, Climbing Removal 3h"
  //    + " · Notes: <notes>" if provided.
  const totalHours = cleanEntries.reduce((sum, e) => sum + e.hours, 0);
  const parts = cleanEntries.map((e) => {
    const label = nameByKey.get(e.training_key) ?? e.training_key;
    return `${label} ${formatHours(e.hours)}h`;
  });
  let description = `Training session: ${formatHours(totalHours)}h — ${parts.join(', ')}`;
  if (input.notes?.trim()) {
    description += ` · Notes: ${input.notes.trim()}`;
  }
  await supabase.from('field_crew_activity').insert({
    employee_slug: input.employee_slug,
    occurred_on: input.session_date,
    description,
    created_by: user.email,
  });

  // 4. Refresh affected pages.
  revalidatePath(`/crew/employees/${input.employee_slug}`);
  revalidatePath('/crew');
  revalidatePath('/crew/reports/feed');

  return { ok: true };
}

// Format hours so 2 shows as "2" and 1.5 shows as "1.5".
function formatHours(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
