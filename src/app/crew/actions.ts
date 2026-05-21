'use server';

// ============================================================================
// Field Crew Hub — server actions
// ============================================================================
// All writes go through here so we can enforce canEditCrew() in one place
// (RLS will reject anyway, but explicit checks give nicer errors).
// ============================================================================

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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

// ============================================================================
// Per-training editing — used by /crew/trainings/[key]
// ============================================================================

export type SetEmployeeTrainingInput = {
  employee_slug: string;
  training_key: string;
  /** ISO date or null. Null means "not yet completed". */
  completed: string | null;
  /** ISO date or null. Ignored for trainings that don't require a card. */
  card_received: string | null;
  /** Free-form notes per employee for this training. */
  notes: string | null;
};

/**
 * Upsert a completion-based training record for one employee.
 *
 * Status is derived from the dates we receive — we don't ask the user to
 * pick "in progress" vs "completed" separately, because the dates already
 * tell us. If everything is empty/null, the row is deleted entirely
 * (which renders as "Not yet").
 *
 * Also writes a one-line entry to the activity feed describing what changed.
 */
export async function setEmployeeTrainingRecord(
  input: SetEmployeeTrainingInput,
): Promise<RecordTrainingSessionResult> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!canEditCrew(user.role)) {
    return { ok: false, error: 'You do not have permission to edit trainings.' };
  }

  const supabase = await serverClient();

  const { data: training } = await supabase
    .from('field_crew_trainings')
    .select('key, display_name, is_hours_based')
    .eq('key', input.training_key)
    .maybeSingle();
  if (!training) return { ok: false, error: 'Training not found.' };
  if (training.is_hours_based) {
    return {
      ok: false,
      error: 'Hours-based trainings are updated by logging a session, not edited directly.',
    };
  }

  const { data: emp } = await supabase
    .from('field_crew_employees')
    .select('slug')
    .eq('slug', input.employee_slug)
    .maybeSingle();
  if (!emp) return { ok: false, error: 'Employee not found.' };

  const completed = input.completed?.trim() || null;
  const cardReceived = input.card_received?.trim() || null;
  const notes = input.notes?.trim() || null;
  const allEmpty = !completed && !cardReceived && !notes;

  // Read existing row so we can diff for the activity log.
  const { data: existing } = await supabase
    .from('field_crew_employee_trainings')
    .select('completed, card_received, notes, status')
    .eq('employee_slug', input.employee_slug)
    .eq('training_key', input.training_key)
    .maybeSingle();

  if (allEmpty) {
    if (existing) {
      await supabase
        .from('field_crew_employee_trainings')
        .delete()
        .eq('employee_slug', input.employee_slug)
        .eq('training_key', input.training_key);
      await logActivity(
        supabase,
        input.employee_slug,
        new Date().toISOString().slice(0, 10),
        `${training.display_name}: record cleared`,
        user.email,
      );
    }
  } else {
    const { error } = await supabase
      .from('field_crew_employee_trainings')
      .upsert(
        {
          employee_slug: input.employee_slug,
          training_key: input.training_key,
          completed,
          card_received: cardReceived,
          notes,
          // Clear any prior "TBD" / "in progress" status since real dates now
          // tell the story. If trainer wanted to mark TBD again they could,
          // but the UI doesn't expose status directly.
          status: null,
        },
        { onConflict: 'employee_slug,training_key' },
      );
    if (error) return { ok: false, error: error.message };

    const changes = describeChanges(existing, { completed, card_received: cardReceived, notes });
    await logActivity(
      supabase,
      input.employee_slug,
      completed ?? cardReceived ?? new Date().toISOString().slice(0, 10),
      `${training.display_name}: ${changes}`,
      user.email,
    );
  }

  revalidatePath(`/crew/trainings/${input.training_key}`);
  revalidatePath(`/crew/employees/${input.employee_slug}`);
  revalidatePath('/crew');
  revalidatePath('/crew/reports/feed');
  return { ok: true };
}

/**
 * Log hours for one training × one employee. Internally this just creates a
 * single-entry training session — keeping ALL hours in one source of truth.
 */
export async function logHoursForTraining(input: {
  employee_slug: string;
  training_key: string;
  session_date: string;
  hours: number;
  notes: string | null;
}): Promise<RecordTrainingSessionResult> {
  return recordTrainingSession({
    employee_slug: input.employee_slug,
    session_date: input.session_date,
    notes: input.notes,
    entries: [{ training_key: input.training_key, hours: input.hours }],
  });
}

// ---- helpers ----

type TrainingChangeFields = {
  completed: string | null;
  card_received: string | null;
  notes: string | null;
};

function describeChanges(
  before: TrainingChangeFields | null,
  after: TrainingChangeFields,
): string {
  const parts: string[] = [];
  if ((before?.completed ?? null) !== after.completed) {
    parts.push(after.completed ? `completed ${after.completed}` : 'completion date cleared');
  }
  if ((before?.card_received ?? null) !== after.card_received) {
    parts.push(after.card_received ? `card received ${after.card_received}` : 'card cleared');
  }
  if ((before?.notes ?? null) !== after.notes) {
    parts.push(after.notes ? `notes updated` : 'notes cleared');
  }
  return parts.length === 0 ? 'updated' : parts.join('; ');
}

async function logActivity(
  supabase: Awaited<ReturnType<typeof serverClient>>,
  employee_slug: string,
  occurred_on: string,
  description: string,
  created_by: string,
) {
  await supabase.from('field_crew_activity').insert({
    employee_slug,
    occurred_on,
    description,
    created_by,
  });
}

// ============================================================================
// Employee profile editing — used by /admin/crew/employees/[slug]
// ============================================================================
// Form-action that takes a FormData (so the admin page can be a plain
// server component) and writes back to field_crew_employees. Significant
// changes also append a line to the activity feed so we can see what
// changed and when.
//
// Editable here:
//   - active (deactivate / reactivate)
//   - hire_date
//   - position_key
//   - leads_crew (foreman toggle)
//   - notes
// ============================================================================

export async function updateEmployeeProfile(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canEditCrew(user.role)) {
    redirect('/access-denied');
  }

  const slug = String(formData.get('slug') ?? '').trim();
  if (!slug) redirect('/crew?error=missing_slug');

  // Pull the form fields. Empty string → null where appropriate.
  const positionKey = String(formData.get('position_key') ?? '').trim() || null;
  const hireDate = String(formData.get('hire_date') ?? '').trim() || null;
  const leadsCrew = formData.get('leads_crew') === 'on';
  const active = formData.get('active') === 'on';
  const notes = String(formData.get('notes') ?? '').trim() || null;

  const supabase = await serverClient();

  const { data: before, error: readErr } = await supabase
    .from('field_crew_employees')
    .select('slug, name, active, hire_date, position_key, leads_crew, notes')
    .eq('slug', slug)
    .maybeSingle();
  if (readErr || !before) {
    redirect(`/crew/employees/${slug}?error=not_found`);
  }

  const { error } = await supabase
    .from('field_crew_employees')
    .update({
      active,
      hire_date: hireDate,
      position_key: positionKey,
      leads_crew: leadsCrew,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('slug', slug);
  if (error) {
    redirect(`/admin/crew/employees/${slug}?error=${encodeURIComponent(error.message)}`);
  }

  // Append meaningful changes to the activity log (skip notes — too noisy).
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  if (before.active !== active) {
    lines.push(active ? 'Reactivated.' : 'Marked inactive.');
  }
  if (before.hire_date !== hireDate) {
    lines.push(
      hireDate ? `Hire date set to ${hireDate}.` : 'Hire date cleared.',
    );
  }
  if (before.position_key !== positionKey) {
    const { data: posRow } = await supabase
      .from('field_crew_positions')
      .select('display_name')
      .eq('key', positionKey ?? '')
      .maybeSingle();
    const posName = positionKey
      ? (posRow as { display_name?: string } | null)?.display_name ?? positionKey
      : 'unassigned';
    lines.push(`Position → ${posName}.`);
  }
  if (before.leads_crew !== leadsCrew) {
    lines.push(leadsCrew ? 'Promoted to foreman.' : 'No longer foreman.');
  }
  for (const line of lines) {
    await logActivity(supabase, slug, today, line, user.email);
  }

  revalidatePath(`/crew/employees/${slug}`);
  revalidatePath('/crew');
  revalidatePath('/crew/reports/feed');
  redirect(`/crew/employees/${slug}?saved=1`);
}
