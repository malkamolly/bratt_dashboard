// ============================================================================
// Field Crew Hub data loaders
// ============================================================================
// Server-side fetchers for the /crew/* routes. Every function calls into
// Supabase (via serverClient) so RLS does the access check for us — if the
// signed-in user is not on the allowlist with a crew-eligible role, every
// query just returns empty.
// ============================================================================

import { serverClient } from './supabase';

// ---------- Types ----------

export type SkillLevel = 1 | 2 | 3;

export type Position = {
  key: string;
  display_name: string;
  display_order: number;
};

export type Skill = {
  key: string;
  display_name: string;
  display_order: number;
};

export type Training = {
  key: string;
  display_name: string;
  display_order: number;
  card_required: boolean;
  is_hours_based: boolean;
  notes: string | null;
};

export type Specialty = {
  key: string;
  display_name: string;
};

export type PositionSkill = {
  position_key: string;
  skill_key: string;
  display_order: number;
  short_label: string | null;
};

export type EmployeeTraining = {
  training_key: string;
  completed: string | null;
  card_received: string | null;
  hours: number | null;
  last_updated: string | null;
  status: string | null;
  notes: string | null;
};

export type Employee = {
  slug: string;
  code: string;
  name: string;
  position_key: string | null;
  leads_crew: boolean;
  hire_date: string | null;
  active: boolean;
  notes: string | null;
  auth_email: string | null;
  specialties: string[];
  skills: Record<string, SkillLevel>;
  trainings: Record<string, EmployeeTraining>;
};

export type ActivityEntry = {
  id: string;
  employee_slug: string;
  employee_name: string;
  occurred_on: string;
  description: string;
};

export type PlanSummary = {
  slug: string;
  employee_slug: string;
  employee_name: string;
  skill_key: string;
  skill_name: string;
  current_level: SkillLevel;
  target_level: SkillLevel;
  opened: string;
  target_date: string | null;
  closed: string | null;
  status: 'active' | 'completed' | 'dropped';
};

export type Plan = PlanSummary & {
  goal: string | null;
  plan_body: string | null;
  updates: { id: string; occurred_on: string; description: string }[];
};

export type Huddle = { date: string; body: string };

export type TrainingSessionEntry = {
  id: string;
  training_key: string;
  training_name: string;
  hours: number;
};

export type TrainingSession = {
  id: string;
  employee_slug: string;
  session_date: string;
  notes: string | null;
  created_by: string | null;
  entries: TrainingSessionEntry[];
};

/** Total hours logged per training_key (via session entries), keyed for lookup. */
export type HoursByTraining = Record<string, { total: number; lastLogged: string | null }>;

// ---------- Catalogs ----------

export async function getCatalogs() {
  const supabase = await serverClient();
  const [positions, skills, trainings, specialties, positionSkills] =
    await Promise.all([
      supabase
        .from('field_crew_positions')
        .select('*')
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('field_crew_skills')
        .select('*')
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('field_crew_trainings')
        .select('*')
        .eq('is_active', true)
        .order('display_order'),
      supabase.from('field_crew_specialties').select('*').order('display_order'),
      supabase.from('field_crew_position_skills').select('*').order('display_order'),
    ]);

  return {
    positions: (positions.data ?? []) as Position[],
    skills: (skills.data ?? []) as Skill[],
    trainings: (trainings.data ?? []) as Training[],
    specialties: (specialties.data ?? []) as Specialty[],
    positionSkills: (positionSkills.data ?? []) as PositionSkill[],
  };
}

// ---------- Employees ----------

type EmployeeRow = {
  slug: string;
  code: string;
  name: string;
  position_key: string | null;
  leads_crew: boolean;
  hire_date: string | null;
  active: boolean;
  notes: string | null;
  auth_email: string | null;
};

type SpecialtyRow = { employee_slug: string; specialty_key: string };
type SkillRow = { employee_slug: string; skill_key: string; level: number };
type TrainingRow = {
  employee_slug: string;
  training_key: string;
  completed: string | null;
  card_received: string | null;
  hours: number | null;
  last_updated: string | null;
  status: string | null;
  notes: string | null;
};

async function hydrateEmployees(rows: EmployeeRow[]): Promise<Employee[]> {
  if (rows.length === 0) return [];
  const slugs = rows.map((r) => r.slug);
  const supabase = await serverClient();
  const [specialties, skills, trainings] = await Promise.all([
    supabase
      .from('field_crew_employee_specialties')
      .select('employee_slug, specialty_key')
      .in('employee_slug', slugs),
    supabase
      .from('field_crew_employee_skills')
      .select('employee_slug, skill_key, level')
      .in('employee_slug', slugs),
    supabase
      .from('field_crew_employee_trainings')
      .select(
        'employee_slug, training_key, completed, card_received, hours, last_updated, status, notes',
      )
      .in('employee_slug', slugs),
  ]);

  const specBySlug = new Map<string, string[]>();
  for (const s of (specialties.data ?? []) as SpecialtyRow[]) {
    const arr = specBySlug.get(s.employee_slug) ?? [];
    arr.push(s.specialty_key);
    specBySlug.set(s.employee_slug, arr);
  }

  const skillsBySlug = new Map<string, Record<string, SkillLevel>>();
  for (const s of (skills.data ?? []) as SkillRow[]) {
    const m = skillsBySlug.get(s.employee_slug) ?? {};
    m[s.skill_key] = s.level as SkillLevel;
    skillsBySlug.set(s.employee_slug, m);
  }

  const trainingsBySlug = new Map<string, Record<string, EmployeeTraining>>();
  for (const t of (trainings.data ?? []) as TrainingRow[]) {
    const m = trainingsBySlug.get(t.employee_slug) ?? {};
    m[t.training_key] = {
      training_key: t.training_key,
      completed: t.completed,
      card_received: t.card_received,
      hours: t.hours,
      last_updated: t.last_updated,
      status: t.status,
      notes: t.notes,
    };
    trainingsBySlug.set(t.employee_slug, m);
  }

  return rows.map((r) => ({
    slug: r.slug,
    code: r.code,
    name: r.name,
    position_key: r.position_key,
    leads_crew: r.leads_crew,
    hire_date: r.hire_date,
    active: r.active,
    notes: r.notes,
    auth_email: r.auth_email,
    specialties: specBySlug.get(r.slug) ?? [],
    skills: skillsBySlug.get(r.slug) ?? {},
    trainings: trainingsBySlug.get(r.slug) ?? {},
  }));
}

const EMPLOYEE_COLS =
  'slug, code, name, position_key, leads_crew, hire_date, active, notes, auth_email';

export async function listEmployees(opts: { activeOnly?: boolean } = {}): Promise<Employee[]> {
  const supabase = await serverClient();
  let q = supabase.from('field_crew_employees').select(EMPLOYEE_COLS);
  if (opts.activeOnly) q = q.eq('active', true);
  q = q.order('name');
  const { data } = await q;
  return hydrateEmployees((data ?? []) as EmployeeRow[]);
}

export async function getEmployee(slug: string): Promise<Employee | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_employees')
    .select(EMPLOYEE_COLS)
    .eq('slug', slug)
    .maybeSingle();
  if (!data) return null;
  const [hydrated] = await hydrateEmployees([data as EmployeeRow]);
  return hydrated ?? null;
}

/**
 * Look up the employee record whose auth_email matches the currently
 * signed-in user. Returns the slug (URL handle) or null if no record /
 * not signed in. Used by the landing page to auto-route field_crew users.
 */
export async function getCurrentEmployeeSlug(): Promise<string | null> {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data } = await supabase
    .from('field_crew_employees')
    .select('slug')
    .ilike('auth_email', user.email)
    .eq('active', true)
    .maybeSingle();
  return (data as { slug?: string } | null)?.slug ?? null;
}

// ---------- Activity ----------

export async function listActivity(opts: { limit?: number; slug?: string } = {}): Promise<ActivityEntry[]> {
  const supabase = await serverClient();
  let q = supabase
    .from('field_crew_activity')
    .select(
      'id, employee_slug, occurred_on, description, field_crew_employees!inner(name)',
    )
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (opts.slug) q = q.eq('employee_slug', opts.slug);
  if (opts.limit) q = q.limit(opts.limit);
  const { data } = await q;
  type Row = {
    id: string;
    employee_slug: string;
    occurred_on: string;
    description: string;
    // Supabase returns the joined row as a nested object (or array depending on
    // the relationship cardinality). It's an inner join on the FK, so we get
    // an object with `name`.
    field_crew_employees: { name: string } | { name: string }[] | null;
  };
  return ((data ?? []) as Row[]).map((r) => {
    const joined = Array.isArray(r.field_crew_employees)
      ? r.field_crew_employees[0]
      : r.field_crew_employees;
    return {
      id: r.id,
      employee_slug: r.employee_slug,
      employee_name: joined?.name ?? r.employee_slug,
      occurred_on: r.occurred_on,
      description: r.description,
    };
  });
}

// ---------- Plans ----------

type PlanRow = {
  slug: string;
  employee_slug: string;
  skill_key: string;
  current_level: number;
  target_level: number;
  opened: string;
  target_date: string | null;
  closed: string | null;
  status: 'active' | 'completed' | 'dropped';
  goal: string | null;
  plan_body: string | null;
  field_crew_employees: { name: string } | { name: string }[] | null;
  field_crew_skills: { display_name: string } | { display_name: string }[] | null;
};

function unwrapJoin<T>(j: T | T[] | null): T | null {
  if (!j) return null;
  return Array.isArray(j) ? j[0] ?? null : j;
}

export async function listPlans(opts: { status?: 'active' | 'completed' | 'dropped' } = {}): Promise<PlanSummary[]> {
  const supabase = await serverClient();
  let q = supabase
    .from('field_crew_plans')
    .select(
      'slug, employee_slug, skill_key, current_level, target_level, opened, target_date, closed, status,' +
        ' field_crew_employees!inner(name), field_crew_skills!inner(display_name)',
    )
    .order('status')
    .order('target_date', { ascending: true, nullsFirst: false });
  if (opts.status) q = q.eq('status', opts.status);
  const { data } = await q;
  return ((data ?? []) as unknown as PlanRow[]).map((r) => ({
    slug: r.slug,
    employee_slug: r.employee_slug,
    employee_name: unwrapJoin(r.field_crew_employees)?.name ?? r.employee_slug,
    skill_key: r.skill_key,
    skill_name: unwrapJoin(r.field_crew_skills)?.display_name ?? r.skill_key,
    current_level: r.current_level as SkillLevel,
    target_level: r.target_level as SkillLevel,
    opened: r.opened,
    target_date: r.target_date,
    closed: r.closed,
    status: r.status,
  }));
}

export async function getPlan(slug: string): Promise<Plan | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_plans')
    .select(
      'slug, employee_slug, skill_key, current_level, target_level, opened, target_date, closed, status, goal, plan_body,' +
        ' field_crew_employees!inner(name), field_crew_skills!inner(display_name)',
    )
    .eq('slug', slug)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as PlanRow;
  const { data: updates } = await supabase
    .from('field_crew_plan_updates')
    .select('id, occurred_on, description')
    .eq('plan_slug', slug)
    .order('occurred_on', { ascending: false });
  return {
    slug: r.slug,
    employee_slug: r.employee_slug,
    employee_name: unwrapJoin(r.field_crew_employees)?.name ?? r.employee_slug,
    skill_key: r.skill_key,
    skill_name: unwrapJoin(r.field_crew_skills)?.display_name ?? r.skill_key,
    current_level: r.current_level as SkillLevel,
    target_level: r.target_level as SkillLevel,
    opened: r.opened,
    target_date: r.target_date,
    closed: r.closed,
    status: r.status,
    goal: r.goal,
    plan_body: r.plan_body,
    updates: (updates ?? []) as Plan['updates'],
  };
}

export async function listPlansForEmployee(slug: string): Promise<PlanSummary[]> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_plans')
    .select(
      'slug, employee_slug, skill_key, current_level, target_level, opened, target_date, closed, status,' +
        ' field_crew_employees!inner(name), field_crew_skills!inner(display_name)',
    )
    .eq('employee_slug', slug)
    .order('status')
    .order('opened', { ascending: false });
  return ((data ?? []) as unknown as PlanRow[]).map((r) => ({
    slug: r.slug,
    employee_slug: r.employee_slug,
    employee_name: unwrapJoin(r.field_crew_employees)?.name ?? r.employee_slug,
    skill_key: r.skill_key,
    skill_name: unwrapJoin(r.field_crew_skills)?.display_name ?? r.skill_key,
    current_level: r.current_level as SkillLevel,
    target_level: r.target_level as SkillLevel,
    opened: r.opened,
    target_date: r.target_date,
    closed: r.closed,
    status: r.status,
  }));
}

// ---------- Huddles ----------

export async function listHuddles(limit = 30): Promise<Huddle[]> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_huddles')
    .select('date, body')
    .order('date', { ascending: false })
    .limit(limit);
  return (data ?? []) as Huddle[];
}

export async function getHuddle(date: string): Promise<Huddle | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_huddles')
    .select('date, body')
    .eq('date', date)
    .maybeSingle();
  return (data as Huddle) ?? null;
}

export async function getLatestHuddle(): Promise<Huddle | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_huddles')
    .select('date, body')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Huddle) ?? null;
}

// ---------- Training sessions ----------

type SessionRow = {
  id: string;
  employee_slug: string;
  session_date: string;
  notes: string | null;
  created_by: string | null;
};
type EntryRow = {
  id: string;
  session_id: string;
  training_key: string;
  hours: string | number;
};

export async function listTrainingSessionsForEmployee(
  slug: string,
): Promise<TrainingSession[]> {
  const supabase = await serverClient();
  const { data: sessions } = await supabase
    .from('field_crew_training_sessions')
    .select('id, employee_slug, session_date, notes, created_by')
    .eq('employee_slug', slug)
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });

  const sessionList = (sessions ?? []) as SessionRow[];
  if (sessionList.length === 0) return [];

  const ids = sessionList.map((s) => s.id);
  const [{ data: entries }, { data: trainings }] = await Promise.all([
    supabase
      .from('field_crew_training_session_entries')
      .select('id, session_id, training_key, hours')
      .in('session_id', ids),
    supabase.from('field_crew_trainings').select('key, display_name'),
  ]);

  const nameByKey = new Map<string, string>();
  for (const t of (trainings ?? []) as { key: string; display_name: string }[]) {
    nameByKey.set(t.key, t.display_name);
  }

  const entriesBySession = new Map<string, TrainingSessionEntry[]>();
  for (const e of (entries ?? []) as EntryRow[]) {
    const arr = entriesBySession.get(e.session_id) ?? [];
    arr.push({
      id: e.id,
      training_key: e.training_key,
      training_name: nameByKey.get(e.training_key) ?? e.training_key,
      hours: Number(e.hours),
    });
    entriesBySession.set(e.session_id, arr);
  }

  return sessionList.map((s) => ({
    id: s.id,
    employee_slug: s.employee_slug,
    session_date: s.session_date,
    notes: s.notes,
    created_by: s.created_by,
    entries: entriesBySession.get(s.id) ?? [],
  }));
}

/** Sums all session-entry hours per training_key for one employee. */
export async function getHoursByTrainingForEmployee(
  slug: string,
): Promise<HoursByTraining> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_training_session_entries')
    .select(
      'training_key, hours, field_crew_training_sessions!inner(employee_slug, session_date)',
    )
    .eq('field_crew_training_sessions.employee_slug', slug);

  type Row = {
    training_key: string;
    hours: string | number;
    field_crew_training_sessions:
      | { employee_slug: string; session_date: string }
      | { employee_slug: string; session_date: string }[]
      | null;
  };

  const result: HoursByTraining = {};
  for (const r of (data ?? []) as Row[]) {
    const joined = Array.isArray(r.field_crew_training_sessions)
      ? r.field_crew_training_sessions[0]
      : r.field_crew_training_sessions;
    const cur = result[r.training_key] ?? { total: 0, lastLogged: null };
    cur.total += Number(r.hours);
    const sessionDate = joined?.session_date ?? null;
    if (sessionDate && (!cur.lastLogged || sessionDate > cur.lastLogged)) {
      cur.lastLogged = sessionDate;
    }
    result[r.training_key] = cur;
  }
  return result;
}

// ---------- Per-training detail ----------

export type TrainingEmployeeRecord = {
  employee_slug: string;
  employee_name: string;
  position_key: string | null;
  position_name: string | null;
  active: boolean;
  // Completion-based fields (null for hours-based trainings).
  completed: string | null;
  card_received: string | null;
  status: string | null;
  notes: string | null;
  // Hours-based fields.
  hours_total: number;
  last_logged: string | null;
};

export async function getTraining(key: string): Promise<Training | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_trainings')
    .select('*')
    .eq('key', key)
    .maybeSingle();
  return (data as Training) ?? null;
}

/**
 * For a given training, return ONE row per active employee that captures
 * everything we need to render + edit on the per-training detail page.
 * Inactive employees are omitted (they won't earn new trainings).
 */
export async function listTrainingEmployeeRecords(
  trainingKey: string,
): Promise<TrainingEmployeeRecord[]> {
  const supabase = await serverClient();

  const [{ data: employees }, { data: records }, { data: sessionEntries }, { data: positions }] =
    await Promise.all([
      supabase
        .from('field_crew_employees')
        .select('slug, name, position_key, active')
        .order('name'),
      supabase
        .from('field_crew_employee_trainings')
        .select('employee_slug, completed, card_received, status, notes')
        .eq('training_key', trainingKey),
      supabase
        .from('field_crew_training_session_entries')
        .select(
          'hours, training_key, field_crew_training_sessions!inner(employee_slug, session_date)',
        )
        .eq('training_key', trainingKey),
      supabase.from('field_crew_positions').select('key, display_name'),
    ]);

  const positionName = new Map<string, string>();
  for (const p of (positions ?? []) as { key: string; display_name: string }[]) {
    positionName.set(p.key, p.display_name);
  }

  const recordBySlug = new Map<
    string,
    { completed: string | null; card_received: string | null; status: string | null; notes: string | null }
  >();
  for (const r of (records ?? []) as {
    employee_slug: string;
    completed: string | null;
    card_received: string | null;
    status: string | null;
    notes: string | null;
  }[]) {
    recordBySlug.set(r.employee_slug, {
      completed: r.completed,
      card_received: r.card_received,
      status: r.status,
      notes: r.notes,
    });
  }

  type SessionEntryRow = {
    hours: string | number;
    field_crew_training_sessions:
      | { employee_slug: string; session_date: string }
      | { employee_slug: string; session_date: string }[]
      | null;
  };
  const hoursBySlug = new Map<string, { total: number; lastLogged: string | null }>();
  for (const e of (sessionEntries ?? []) as SessionEntryRow[]) {
    const joined = Array.isArray(e.field_crew_training_sessions)
      ? e.field_crew_training_sessions[0]
      : e.field_crew_training_sessions;
    if (!joined) continue;
    const cur = hoursBySlug.get(joined.employee_slug) ?? { total: 0, lastLogged: null };
    cur.total += Number(e.hours);
    if (!cur.lastLogged || joined.session_date > cur.lastLogged) {
      cur.lastLogged = joined.session_date;
    }
    hoursBySlug.set(joined.employee_slug, cur);
  }

  type EmpRow = { slug: string; name: string; position_key: string | null; active: boolean };
  return ((employees ?? []) as EmpRow[])
    .filter((e) => e.active)
    .map((e) => {
      const rec = recordBySlug.get(e.slug);
      const hrs = hoursBySlug.get(e.slug);
      return {
        employee_slug: e.slug,
        employee_name: e.name,
        position_key: e.position_key,
        position_name: e.position_key ? positionName.get(e.position_key) ?? null : null,
        active: e.active,
        completed: rec?.completed ?? null,
        card_received: rec?.card_received ?? null,
        status: rec?.status ?? null,
        notes: rec?.notes ?? null,
        hours_total: hrs?.total ?? 0,
        last_logged: hrs?.lastLogged ?? null,
      };
    });
}

// ---------- Training modules ----------

export type TrainingModule = {
  slug: string;
  name: string;
  description: string | null;
  training_key: string | null;
  pass_threshold: number;
  requires_all_safety: boolean;
  version: string;
  is_active: boolean;
  theme: string;
};

export type ModuleQuestion = {
  id: string;
  module_slug: string;
  position: number;
  section: string | null;
  prompt: string;
  safety_critical: boolean;
  choices: { letter: 'A' | 'B' | 'C' | 'D'; text: string }[];
};

export type AssignmentSummary = {
  id: string;
  module_slug: string;
  module_name: string;
  module_training_key: string | null;
  employee_slug: string;
  employee_name: string;
  assigned_at: string;
  assigned_by: string | null;
  latest_attempt: {
    id: string;
    submitted_at: string | null;
    passed: boolean | null;
    score_correct: number | null;
    score_total: number | null;
    certificate_number: string | null;
  } | null;
  practical_signed_count: number;
};

export type PracticalItem = {
  id: string;
  module_slug: string;
  position: number;
  area: string;
  task: string;
};

export type PracticalSignoff = {
  id: string;
  assignment_id: string;
  item_id: string;
  trainer_initials: string;
  trainer_email: string;
  signed_at: string;
};

export type CertificateRecord = {
  certificate_number: string;
  attempt_id: string;
  module_slug: string;
  module_name: string;
  employee_slug: string;
  employee_name: string;
  passed_on: string;
  score_correct: number;
  score_total: number;
  proctor_email: string | null;
};

export async function listTrainingModules(): Promise<TrainingModule[]> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_training_modules')
    .select('*')
    .eq('is_active', true)
    .order('name');
  return (data ?? []) as TrainingModule[];
}

// ---------- Practical test-out (Slide #32 / signoff form) ----------

export async function listPracticalItems(slug: string): Promise<PracticalItem[]> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_training_module_practical_items')
    .select('*')
    .eq('module_slug', slug)
    .order('position');
  return (data ?? []) as PracticalItem[];
}

export async function listPracticalSignoffsForAssignment(
  assignmentId: string,
): Promise<PracticalSignoff[]> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_training_practical_signoffs')
    .select('*')
    .eq('assignment_id', assignmentId);
  return (data ?? []) as PracticalSignoff[];
}

export async function getTrainingModule(slug: string): Promise<TrainingModule | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_training_modules')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  return (data as TrainingModule) ?? null;
}

export async function listModuleQuestions(slug: string): Promise<ModuleQuestion[]> {
  const supabase = await serverClient();
  const { data: questions } = await supabase
    .from('field_crew_training_module_questions')
    .select('id, module_slug, position, section, prompt, safety_critical')
    .eq('module_slug', slug)
    .order('position');

  const qs = (questions ?? []) as Omit<ModuleQuestion, 'choices'>[];
  if (qs.length === 0) return [];

  const { data: choices } = await supabase
    .from('field_crew_training_module_choices')
    .select('question_id, letter, text')
    .in('question_id', qs.map((q) => q.id));

  const byQ = new Map<string, { letter: 'A' | 'B' | 'C' | 'D'; text: string }[]>();
  for (const c of (choices ?? []) as { question_id: string; letter: string; text: string }[]) {
    const arr = byQ.get(c.question_id) ?? [];
    arr.push({ letter: c.letter as 'A' | 'B' | 'C' | 'D', text: c.text });
    byQ.set(c.question_id, arr);
  }
  for (const arr of byQ.values()) arr.sort((a, b) => a.letter.localeCompare(b.letter));

  return qs.map((q) => ({ ...q, choices: byQ.get(q.id) ?? [] }));
}

type AssignmentModuleJoin = { name: string; training_key: string | null };
type AssignmentRow = {
  id: string;
  module_slug: string;
  employee_slug: string;
  assigned_at: string;
  assigned_by: string | null;
  field_crew_training_modules: AssignmentModuleJoin | AssignmentModuleJoin[] | null;
  field_crew_employees: { name: string } | { name: string }[] | null;
};

type AttemptRow = {
  id: string;
  assignment_id: string;
  submitted_at: string | null;
  passed: boolean | null;
  score_correct: number | null;
  score_total: number | null;
  certificate_number: string | null;
};

async function hydrateAssignments(rows: AssignmentRow[]): Promise<AssignmentSummary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const supabase = await serverClient();
  const [{ data: attempts }, { data: signoffs }] = await Promise.all([
    supabase
      .from('field_crew_training_attempts')
      .select('id, assignment_id, submitted_at, passed, score_correct, score_total, certificate_number')
      .in('assignment_id', ids)
      .order('started_at', { ascending: false }),
    supabase
      .from('field_crew_training_practical_signoffs')
      .select('assignment_id')
      .in('assignment_id', ids),
  ]);

  const latestByAssignment = new Map<string, AttemptRow>();
  for (const a of (attempts ?? []) as AttemptRow[]) {
    if (!latestByAssignment.has(a.assignment_id)) latestByAssignment.set(a.assignment_id, a);
  }
  const signedByAssignment = new Map<string, number>();
  for (const s of (signoffs ?? []) as { assignment_id: string }[]) {
    signedByAssignment.set(s.assignment_id, (signedByAssignment.get(s.assignment_id) ?? 0) + 1);
  }

  return rows.map((r) => {
    const moduleJoin = unwrapJoin(r.field_crew_training_modules);
    const moduleName = moduleJoin?.name ?? r.module_slug;
    const moduleTrainingKey = moduleJoin?.training_key ?? null;
    const employeeName = unwrapJoin(r.field_crew_employees)?.name ?? r.employee_slug;
    const a = latestByAssignment.get(r.id);
    return {
      id: r.id,
      module_slug: r.module_slug,
      module_name: moduleName,
      module_training_key: moduleTrainingKey,
      employee_slug: r.employee_slug,
      employee_name: employeeName,
      assigned_at: r.assigned_at,
      assigned_by: r.assigned_by,
      latest_attempt: a
        ? {
            id: a.id,
            submitted_at: a.submitted_at,
            passed: a.passed,
            score_correct: a.score_correct,
            score_total: a.score_total,
            certificate_number: a.certificate_number,
          }
        : null,
      practical_signed_count: signedByAssignment.get(r.id) ?? 0,
    };
  });
}

export async function listAssignmentsForModule(slug: string): Promise<AssignmentSummary[]> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_training_assignments')
    .select(
      'id, module_slug, employee_slug, assigned_at, assigned_by,' +
        ' field_crew_training_modules!inner(name, training_key),' +
        ' field_crew_employees!inner(name)',
    )
    .eq('module_slug', slug)
    .order('assigned_at', { ascending: false });
  return hydrateAssignments((data ?? []) as unknown as AssignmentRow[]);
}

export async function listAssignmentsForEmployee(slug: string): Promise<AssignmentSummary[]> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_training_assignments')
    .select(
      'id, module_slug, employee_slug, assigned_at, assigned_by,' +
        ' field_crew_training_modules!inner(name, training_key),' +
        ' field_crew_employees!inner(name)',
    )
    .eq('employee_slug', slug)
    .order('assigned_at', { ascending: false });
  return hydrateAssignments((data ?? []) as unknown as AssignmentRow[]);
}

export async function getAssignment(id: string): Promise<AssignmentSummary | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_training_assignments')
    .select(
      'id, module_slug, employee_slug, assigned_at, assigned_by,' +
        ' field_crew_training_modules!inner(name, training_key),' +
        ' field_crew_employees!inner(name)',
    )
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  const [row] = await hydrateAssignments([data as unknown as AssignmentRow]);
  return row ?? null;
}

type CertJoinedRow = {
  id: string;
  certificate_number: string;
  submitted_at: string | null;
  score_correct: number | null;
  score_total: number | null;
  proctor_email: string | null;
  field_crew_training_assignments:
    | {
        module_slug: string;
        employee_slug: string;
        field_crew_training_modules: { name: string } | { name: string }[] | null;
        field_crew_employees: { name: string } | { name: string }[] | null;
      }
    | {
        module_slug: string;
        employee_slug: string;
        field_crew_training_modules: { name: string } | { name: string }[] | null;
        field_crew_employees: { name: string } | { name: string }[] | null;
      }[]
    | null;
};

function buildCert(row: CertJoinedRow): CertificateRecord | null {
  const assignment = Array.isArray(row.field_crew_training_assignments)
    ? row.field_crew_training_assignments[0]
    : row.field_crew_training_assignments;
  if (!assignment) return null;
  return {
    certificate_number: row.certificate_number,
    attempt_id: row.id,
    module_slug: assignment.module_slug,
    module_name: unwrapJoin(assignment.field_crew_training_modules)?.name ?? assignment.module_slug,
    employee_slug: assignment.employee_slug,
    employee_name: unwrapJoin(assignment.field_crew_employees)?.name ?? assignment.employee_slug,
    passed_on: row.submitted_at ?? '',
    score_correct: row.score_correct ?? 0,
    score_total: row.score_total ?? 0,
    proctor_email: row.proctor_email,
  };
}

export async function getCertificateByNumber(num: string): Promise<CertificateRecord | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_training_attempts')
    .select(
      'id, certificate_number, submitted_at, score_correct, score_total, proctor_email,' +
        ' field_crew_training_assignments!inner(' +
        '   module_slug, employee_slug,' +
        '   field_crew_training_modules!inner(name),' +
        '   field_crew_employees!inner(name)' +
        ' )',
    )
    .eq('certificate_number', num)
    .maybeSingle();
  if (!data) return null;
  return buildCert(data as unknown as CertJoinedRow);
}

export async function listCertificatesForEmployee(slug: string): Promise<CertificateRecord[]> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_training_attempts')
    .select(
      'id, certificate_number, submitted_at, score_correct, score_total, proctor_email,' +
        ' field_crew_training_assignments!inner(' +
        '   module_slug, employee_slug,' +
        '   field_crew_training_modules!inner(name),' +
        '   field_crew_employees!inner(name)' +
        ' )',
    )
    .eq('passed', true)
    .eq('field_crew_training_assignments.employee_slug', slug)
    .order('submitted_at', { ascending: false });
  const rows = (data ?? []) as unknown as CertJoinedRow[];
  return rows.map(buildCert).filter((r): r is CertificateRecord => r !== null);
}

// ---------- Aggregations for the homepage ----------

export type SkillSummary = {
  l1: number;
  l2: number;
  l3: number;
  unrated: number;
};

export function summarizeSkills(employee: Employee, skillKeys: string[]): SkillSummary {
  let l1 = 0;
  let l2 = 0;
  let l3 = 0;
  let unrated = 0;
  for (const k of skillKeys) {
    const v = employee.skills[k];
    if (v === 1) l1++;
    else if (v === 2) l2++;
    else if (v === 3) l3++;
    else unrated++;
  }
  return { l1, l2, l3, unrated };
}

export type Coverage = {
  skillKey: string;
  skillName: string;
  proficientPlus: number;
  expert: number;
  total: number;
};

export function buildCoverage(employees: Employee[], skills: Skill[]): Coverage[] {
  return skills.map((s) => {
    let proficientPlus = 0;
    let expert = 0;
    for (const e of employees) {
      const v = e.skills[s.key];
      if (v === 2) proficientPlus++;
      else if (v === 3) {
        proficientPlus++;
        expert++;
      }
    }
    return {
      skillKey: s.key,
      skillName: s.display_name,
      proficientPlus,
      expert,
      total: employees.length,
    };
  });
}
