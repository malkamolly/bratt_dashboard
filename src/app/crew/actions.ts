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
import { isValidTheme } from '@/lib/training-deck';

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

// ============================================================================
// Training module assignments + grading
// ============================================================================

export async function assignTrainingModule(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canEditCrew(user.role)) redirect('/access-denied');

  const moduleSlug = String(formData.get('module_slug') ?? '').trim();
  const employeeSlugs = formData.getAll('employee_slug').map((v) => String(v));
  if (!moduleSlug) redirect('/crew/modules?error=missing_module');
  if (employeeSlugs.length === 0) {
    redirect(`/crew/modules/${moduleSlug}?error=no_employees`);
  }

  const supabase = await serverClient();
  const { data: mod } = await supabase
    .from('field_crew_training_modules')
    .select('slug, name')
    .eq('slug', moduleSlug)
    .maybeSingle();
  if (!mod) redirect('/crew/modules?error=module_not_found');

  // Upsert assignment rows (one per employee). Existing assignments are
  // kept as-is so prior attempts stay reachable.
  const { error } = await supabase
    .from('field_crew_training_assignments')
    .upsert(
      employeeSlugs.map((slug) => ({
        module_slug: moduleSlug,
        employee_slug: slug,
        assigned_by: user.email,
      })),
      { onConflict: 'module_slug,employee_slug', ignoreDuplicates: false },
    );
  if (error) {
    redirect(`/crew/modules/${moduleSlug}?error=${encodeURIComponent(error.message)}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: modRow } = await supabase
    .from('field_crew_training_modules')
    .select('name')
    .eq('slug', moduleSlug)
    .maybeSingle();
  const moduleName = (modRow as { name?: string } | null)?.name ?? moduleSlug;
  for (const slug of employeeSlugs) {
    await logActivity(supabase, slug, today, `Assigned ${moduleName} training.`, user.email);
  }

  revalidatePath(`/crew/modules/${moduleSlug}`);
  revalidatePath('/crew/modules');
  redirect(`/crew/modules/${moduleSlug}?assigned=${employeeSlugs.length}`);
}

/**
 * Crew opens the test page → we create an empty attempt row (or reuse the
 * latest unsubmitted one) so the answers have somewhere to land as they
 * pick. The action returns the attempt id via redirect to the take URL.
 */
/**
 * Manager-only: remove a training-module assignment from one crew member.
 * Guard: we refuse if the latest attempt is a PASS — that would cascade-
 * delete the certificate row, which we never want to lose. To revoke a
 * pass, an admin should clear the linked training record via the
 * per-training editor instead.
 */
export async function unassignTrainingModule(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canEditCrew(user.role)) redirect('/access-denied');

  const assignmentId = String(formData.get('assignment_id') ?? '').trim();
  const returnTo = String(formData.get('return_to') ?? '').trim();
  if (!assignmentId) redirect(returnTo || '/crew/modules?error=missing_assignment');

  const supabase = await serverClient();

  // Pull the assignment + module name + employee for logging, plus the
  // latest attempt to make sure we're not deleting a pass.
  const { data: assignment } = await supabase
    .from('field_crew_training_assignments')
    .select(
      'id, module_slug, employee_slug,' +
        ' field_crew_training_modules!inner(name),' +
        ' field_crew_employees!inner(name)',
    )
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignment) {
    redirect(`${returnTo || '/crew/modules'}?error=assignment_not_found`);
  }
  const a = assignment as unknown as {
    id: string;
    module_slug: string;
    employee_slug: string;
    field_crew_training_modules: { name: string } | { name: string }[] | null;
    field_crew_employees: { name: string } | { name: string }[] | null;
  };
  const moduleName = (Array.isArray(a.field_crew_training_modules)
    ? a.field_crew_training_modules[0]
    : a.field_crew_training_modules
  )?.name ?? a.module_slug;

  const { data: passedAttempt } = await supabase
    .from('field_crew_training_attempts')
    .select('id')
    .eq('assignment_id', assignmentId)
    .eq('passed', true)
    .limit(1)
    .maybeSingle();
  if (passedAttempt) {
    redirect(
      `${returnTo || `/crew/modules/${a.module_slug}`}?error=${encodeURIComponent(
        'Already passed — clear the training row to revoke it.',
      )}`,
    );
  }

  const { error } = await supabase
    .from('field_crew_training_assignments')
    .delete()
    .eq('id', assignmentId);
  if (error) {
    redirect(
      `${returnTo || `/crew/modules/${a.module_slug}`}?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Activity entry so the timeline shows the unassignment.
  const today = new Date().toISOString().slice(0, 10);
  await logActivity(
    supabase,
    a.employee_slug,
    today,
    `Unassigned from ${moduleName} training.`,
    user.email,
  );

  revalidatePath(`/crew/modules/${a.module_slug}`);
  revalidatePath(`/crew/employees/${a.employee_slug}`);
  revalidatePath('/crew');
  redirect(returnTo || `/crew/modules/${a.module_slug}?unassigned=1`);
}

/**
 * Authorize an attempt action: admins and field managers can act on any
 * assignment; a field_crew user can only act on their own.
 */
async function canActOnAssignment(
  supabase: Awaited<ReturnType<typeof serverClient>>,
  user: { email: string; role: string },
  assignmentId: string,
): Promise<{ ok: true; employeeSlug: string } | { ok: false }> {
  const { data } = await supabase
    .from('field_crew_training_assignments')
    .select('employee_slug, field_crew_employees!inner(auth_email)')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!data) return { ok: false };
  const row = data as unknown as {
    employee_slug: string;
    field_crew_employees:
      | { auth_email: string | null }
      | { auth_email: string | null }[]
      | null;
  };
  const emp = Array.isArray(row.field_crew_employees)
    ? row.field_crew_employees[0]
    : row.field_crew_employees;
  if (user.role === 'admin' || user.role === 'field_manager') {
    return { ok: true, employeeSlug: row.employee_slug };
  }
  if (
    user.role === 'field_crew' &&
    emp?.auth_email &&
    emp.auth_email.toLowerCase() === user.email.toLowerCase()
  ) {
    return { ok: true, employeeSlug: row.employee_slug };
  }
  return { ok: false };
}

export async function startTrainingAttempt(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  const assignmentId = String(formData.get('assignment_id') ?? '').trim();
  if (!assignmentId) redirect('/crew/modules?error=missing_assignment');

  const supabase = await serverClient();

  const auth = await canActOnAssignment(supabase, user, assignmentId);
  if (!auth.ok) redirect('/access-denied');

  // If there's an open (unsubmitted) attempt, reuse it; else create one.
  const { data: existing } = await supabase
    .from('field_crew_training_attempts')
    .select('id, submitted_at')
    .eq('assignment_id', assignmentId)
    .is('submitted_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let attemptId = (existing as { id?: string } | null)?.id;
  if (!attemptId) {
    const { data, error } = await supabase
      .from('field_crew_training_attempts')
      .insert({ assignment_id: assignmentId, proctor_email: user.email })
      .select('id')
      .single();
    if (error || !data) {
      redirect(
        `/crew/modules?error=${encodeURIComponent(error?.message ?? 'attempt_failed')}`,
      );
    }
    attemptId = data.id;
  }

  redirect(`/crew/modules/take/${attemptId}`);
}

/**
 * Crew submits the test. We persist all answers, then call the
 * SECURITY DEFINER `field_crew_grade_attempt` function which reads the
 * answer key with elevated privileges, computes pass/fail, writes the
 * attempt result, logs activity, and (on pass) marks the linked training
 * as completed for the employee.
 */
export async function submitTrainingAttempt(input: {
  attempt_id: string;
  answers: { question_id: string; chosen: 'A' | 'B' | 'C' | 'D' | null }[];
}): Promise<
  | {
      ok: true;
      passed: boolean;
      score_correct: number;
      score_total: number;
      missed_safety_critical: boolean;
      certificate_number: string | null;
    }
  | { ok: false; error: string }
> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = await serverClient();

  // Auth: managers can submit any attempt; field_crew can only submit
  // their own.
  const { data: attempt } = await supabase
    .from('field_crew_training_attempts')
    .select('assignment_id')
    .eq('id', input.attempt_id)
    .maybeSingle();
  if (!attempt) return { ok: false, error: 'Attempt not found.' };
  const auth = await canActOnAssignment(
    supabase,
    user,
    (attempt as { assignment_id: string }).assignment_id,
  );
  if (!auth.ok) {
    return { ok: false, error: 'You do not have permission to submit this attempt.' };
  }

  // Persist each answer (one row per question). Upsert so re-submits land
  // on the same row.
  const rows = input.answers
    .filter((a) => a.chosen != null)
    .map((a) => ({
      attempt_id: input.attempt_id,
      question_id: a.question_id,
      chosen: a.chosen,
    }));
  if (rows.length > 0) {
    const { error } = await supabase
      .from('field_crew_training_attempt_answers')
      .upsert(rows, { onConflict: 'attempt_id,question_id' });
    if (error) return { ok: false, error: error.message };
  }

  // Grade.
  const { data: result, error } = await supabase.rpc('field_crew_grade_attempt', {
    p_attempt_id: input.attempt_id,
  });
  if (error) return { ok: false, error: error.message };

  type GradeResult = {
    passed: boolean;
    score_correct: number;
    score_total: number;
    missed_safety_critical: boolean;
    certificate_number: string | null;
  };
  const r = result as GradeResult;

  revalidatePath('/crew');
  revalidatePath('/crew/reports/feed');
  // The result page does its own revalidation when navigated to.

  return {
    ok: true,
    passed: r.passed,
    score_correct: r.score_correct,
    score_total: r.score_total,
    missed_safety_critical: r.missed_safety_critical,
    certificate_number: r.certificate_number,
  };
}

// ============================================================================
// Skill level editing — used by /crew/skills/[key]
// ============================================================================
// Per-skill detail page sets a level (1/2/3) or clears it (0). Activity-feed
// line says e.g. "Bucket pruning: L2 → L3" so leaders can see who changed
// what. Manager / admin only.
// ============================================================================

export async function setEmployeeSkillLevel(input: {
  employee_slug: string;
  skill_key: string;
  level: 0 | 1 | 2 | 3;
}): Promise<{ ok: true; level: 1 | 2 | 3 | null } | { ok: false; error: string }> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!canEditCrew(user.role)) return { ok: false, error: 'Not authorized.' };

  const supabase = await serverClient();

  const [{ data: emp }, { data: skill }, { data: existing }] = await Promise.all([
    supabase
      .from('field_crew_employees')
      .select('slug, name')
      .eq('slug', input.employee_slug)
      .maybeSingle(),
    supabase
      .from('field_crew_skills')
      .select('key, display_name')
      .eq('key', input.skill_key)
      .maybeSingle(),
    supabase
      .from('field_crew_employee_skills')
      .select('level')
      .eq('employee_slug', input.employee_slug)
      .eq('skill_key', input.skill_key)
      .maybeSingle(),
  ]);
  if (!emp) return { ok: false, error: 'Employee not found.' };
  if (!skill) return { ok: false, error: 'Skill not found.' };

  const prevLevel = (existing?.level as 1 | 2 | 3 | undefined) ?? null;
  const newLevel = input.level === 0 ? null : input.level;
  if (prevLevel === newLevel) return { ok: true, level: newLevel };

  if (newLevel === null) {
    const { error } = await supabase
      .from('field_crew_employee_skills')
      .delete()
      .eq('employee_slug', input.employee_slug)
      .eq('skill_key', input.skill_key);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from('field_crew_employee_skills')
      .upsert(
        {
          employee_slug: input.employee_slug,
          skill_key: input.skill_key,
          level: newLevel,
        },
        { onConflict: 'employee_slug,skill_key' },
      );
    if (error) return { ok: false, error: error.message };
  }

  const today = new Date().toISOString().slice(0, 10);
  const fmt = (l: 1 | 2 | 3 | null) => (l === null ? 'unrated' : `L${l}`);
  await logActivity(
    supabase,
    input.employee_slug,
    today,
    `${skill.display_name}: ${fmt(prevLevel)} → ${fmt(newLevel)}.`,
    user.email,
  );

  revalidatePath(`/crew/skills/${input.skill_key}`);
  revalidatePath(`/crew/employees/${input.employee_slug}`);
  revalidatePath('/crew');
  return { ok: true, level: newLevel };
}

// ============================================================================
// Applicator's License status — used by the PHC card on /crew
// ============================================================================
// Stores into field_crew_employee_trainings under training_key
// 'applicators_license'. Four states map onto the same columns the rest
// of the trainings system uses:
//   passed       → completed = today, status = null
//   in_progress  → completed = null,  status = 'in_progress'
//   failed       → completed = null,  status = 'failed'
//   not_yet      → row deleted
// Activity-feed line is written so the change shows up on the
// employee's profile.
// ============================================================================

export type LicenseStatus = 'not_yet' | 'in_progress' | 'passed' | 'failed';

export async function setApplicatorsLicenseStatus(input: {
  employee_slug: string;
  status: LicenseStatus;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!canEditCrew(user.role)) return { ok: false, error: 'Not authorized.' };

  const supabase = await serverClient();
  const { data: emp } = await supabase
    .from('field_crew_employees')
    .select('slug, name')
    .eq('slug', input.employee_slug)
    .maybeSingle();
  if (!emp) return { ok: false, error: 'Employee not found.' };

  const today = new Date().toISOString().slice(0, 10);

  if (input.status === 'not_yet') {
    const { error } = await supabase
      .from('field_crew_employee_trainings')
      .delete()
      .eq('employee_slug', input.employee_slug)
      .eq('training_key', 'applicators_license');
    if (error) return { ok: false, error: error.message };
  } else {
    const row = {
      employee_slug: input.employee_slug,
      training_key: 'applicators_license',
      completed: input.status === 'passed' ? today : null,
      status: input.status === 'passed' ? null : input.status,
      notes: null,
      card_received: null,
    };
    const { error } = await supabase
      .from('field_crew_employee_trainings')
      .upsert(row, { onConflict: 'employee_slug,training_key' });
    if (error) return { ok: false, error: error.message };
  }

  const labelByStatus: Record<LicenseStatus, string> = {
    not_yet: 'cleared',
    in_progress: 'In progress',
    passed: 'Passed',
    failed: 'Failed',
  };
  await logActivity(
    supabase,
    input.employee_slug,
    today,
    `Applicator's License: ${labelByStatus[input.status]}.`,
    user.email,
  );

  revalidatePath('/crew');
  revalidatePath('/crew/trainings/applicators_license');
  revalidatePath(`/crew/employees/${input.employee_slug}`);
  return { ok: true };
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
  const authEmail =
    String(formData.get('auth_email') ?? '').trim().toLowerCase() || null;
  // Specialties — checkboxes share name="specialties", so getAll returns
  // every value that was checked. De-dupe just in case.
  const specialties = Array.from(
    new Set(formData.getAll('specialties').map((v) => String(v))),
  );

  const supabase = await serverClient();

  const { data: before, error: readErr } = await supabase
    .from('field_crew_employees')
    .select('slug, name, active, hire_date, position_key, leads_crew, notes, auth_email')
    .eq('slug', slug)
    .maybeSingle();
  if (readErr || !before) {
    redirect(`/crew/employees/${slug}?error=not_found`);
  }

  // Read existing specialties so we can diff for the activity feed.
  const { data: existingSpecRows } = await supabase
    .from('field_crew_employee_specialties')
    .select('specialty_key')
    .eq('employee_slug', slug);
  const beforeSpecs = new Set(
    (existingSpecRows ?? []).map((r) => (r as { specialty_key: string }).specialty_key),
  );
  const afterSpecs = new Set(specialties);

  const { error } = await supabase
    .from('field_crew_employees')
    .update({
      active,
      hire_date: hireDate,
      position_key: positionKey,
      leads_crew: leadsCrew,
      notes,
      auth_email: authEmail,
      updated_at: new Date().toISOString(),
    })
    .eq('slug', slug);
  if (error) {
    redirect(`/admin/crew/employees/${slug}?error=${encodeURIComponent(error.message)}`);
  }

  // Sync the specialties join table: delete what was removed, insert what
  // was added. Anything still present in both sets is a no-op.
  const toAdd = [...afterSpecs].filter((k) => !beforeSpecs.has(k));
  const toRemove = [...beforeSpecs].filter((k) => !afterSpecs.has(k));
  if (toRemove.length > 0) {
    await supabase
      .from('field_crew_employee_specialties')
      .delete()
      .eq('employee_slug', slug)
      .in('specialty_key', toRemove);
  }
  if (toAdd.length > 0) {
    await supabase
      .from('field_crew_employee_specialties')
      .insert(toAdd.map((k) => ({ employee_slug: slug, specialty_key: k })));
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
  if (toAdd.length > 0 || toRemove.length > 0) {
    // Look up display names so the activity reads naturally.
    const { data: specRows } = await supabase
      .from('field_crew_specialties')
      .select('key, display_name')
      .in('key', [...toAdd, ...toRemove]);
    const specName = new Map<string, string>();
    for (const r of (specRows ?? []) as { key: string; display_name: string }[]) {
      specName.set(r.key, r.display_name);
    }
    for (const k of toAdd) {
      lines.push(`Added ${specName.get(k) ?? k} specialty.`);
    }
    for (const k of toRemove) {
      lines.push(`Removed ${specName.get(k) ?? k} specialty.`);
    }
  }
  for (const line of lines) {
    await logActivity(supabase, slug, today, line, user.email);
  }

  revalidatePath(`/crew/employees/${slug}`);
  revalidatePath('/crew');
  revalidatePath('/crew/reports/feed');
  redirect(`/crew/employees/${slug}?saved=1`);
}

// ============================================================================
// Practical test-out signoffs
// ============================================================================
// Manager-only. The form on /crew/modules/[slug]/practical/[assignmentId]
// posts here. For every checked-and-initialed item we insert a signoff
// row; items that already had a signoff are left alone. After writing,
// we ask Postgres to try issuing the certificate — it'll succeed only if
// the written test has also passed and every item is now signed.
// ============================================================================

export async function signOffPracticalItems(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canEditCrew(user.role)) redirect('/access-denied');

  const assignmentId = String(formData.get('assignment_id') ?? '').trim();
  const moduleSlug = String(formData.get('module_slug') ?? '').trim();
  if (!assignmentId || !moduleSlug) {
    redirect('/crew/modules?error=missing_assignment');
  }
  const back = `/crew/modules/${moduleSlug}/practical/${assignmentId}`;

  // Each checked item posts pass_<itemId>=on. Initials are one shared
  // value (the trainer types them once at the top of the form), since
  // a single trainer typically signs off everything in one session.
  const initials = String(formData.get('initials') ?? '').trim().toUpperCase();
  if (!initials) {
    redirect(`${back}?error=${encodeURIComponent('Enter your initials.')}`);
  }
  if (initials.length > 6) {
    redirect(`${back}?error=${encodeURIComponent('Initials must be 6 characters or fewer.')}`);
  }

  const checkedItemIds: string[] = [];
  for (const [k, v] of formData.entries()) {
    if (k.startsWith('pass_') && String(v) === 'on') {
      checkedItemIds.push(k.slice('pass_'.length));
    }
  }
  if (checkedItemIds.length === 0) {
    redirect(`${back}?error=${encodeURIComponent('Tick at least one item to sign off.')}`);
  }

  const supabase = await serverClient();

  // Only insert signoffs for items that aren't already signed for this
  // assignment, so we don't overwrite an earlier trainer's initials.
  const { data: existing } = await supabase
    .from('field_crew_training_practical_signoffs')
    .select('item_id')
    .eq('assignment_id', assignmentId);
  const existingIds = new Set(((existing ?? []) as { item_id: string }[]).map((r) => r.item_id));
  const toInsert = checkedItemIds
    .filter((id) => !existingIds.has(id))
    .map((id) => ({
      assignment_id: assignmentId,
      item_id: id,
      trainer_initials: initials,
      trainer_email: user.email,
    }));

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('field_crew_training_practical_signoffs')
      .insert(toInsert);
    if (error) {
      redirect(`${back}?error=${encodeURIComponent(error.message)}`);
    }
  }

  // Best-effort: ask Postgres to issue the cert if both halves are now done.
  // The RPC is a no-op when the written test hasn't passed yet.
  await supabase.rpc('field_crew_try_issue_certificate', { p_assignment_id: assignmentId });

  revalidatePath(`/crew/modules/${moduleSlug}`);
  revalidatePath(`/crew/modules/${moduleSlug}/practical/${assignmentId}`);
  redirect(`${back}?saved=${toInsert.length}`);
}

/**
 * Manager-only: undo a single signoff (typo in initials, wrong person, etc).
 * If the assignment had a certificate issued because of this signoff, the
 * cert stays on the attempt — we don't claw it back, that would require
 * a separate "revoke certificate" flow.
 */
export async function undoPracticalSignoff(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canEditCrew(user.role)) redirect('/access-denied');

  const signoffId = String(formData.get('signoff_id') ?? '').trim();
  const moduleSlug = String(formData.get('module_slug') ?? '').trim();
  const assignmentId = String(formData.get('assignment_id') ?? '').trim();
  if (!signoffId || !moduleSlug || !assignmentId) {
    redirect('/crew/modules?error=missing_signoff');
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('field_crew_training_practical_signoffs')
    .delete()
    .eq('id', signoffId);

  const back = `/crew/modules/${moduleSlug}/practical/${assignmentId}`;
  if (error) {
    redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/crew/modules/${moduleSlug}`);
  revalidatePath(back);
  redirect(`${back}?undone=1`);
}

// ============================================================================
// Training-module settings (title + theme)
// ============================================================================
// Slide content is authored in /content/training-modules/<slug>.txt and only
// changes when those repo files change. This action only edits the module's
// display title and visual theme.
// ============================================================================

export async function saveTrainingModuleSettings(formData: FormData): Promise<void> {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canEditCrew(user.role)) redirect('/access-denied');

  const slug = String(formData.get('module_slug') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const themeInput = String(formData.get('theme') ?? 'bark-cream').trim();
  const theme = isValidTheme(themeInput) ? themeInput : 'bark-cream';

  if (!slug) redirect('/crew/modules?error=missing_module');
  const back = `/crew/modules/${slug}/edit`;
  if (!name) {
    redirect(`${back}?error=${encodeURIComponent('Module title is required.')}`);
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('field_crew_training_modules')
    .update({ name, theme })
    .eq('slug', slug);

  if (error) {
    redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/crew/modules');
  revalidatePath(`/crew/modules/${slug}`);
  revalidatePath(`/crew/modules/${slug}/edit`);
  revalidatePath(`/crew/modules/${slug}/present`);
  redirect(`${back}?saved=1`);
}
