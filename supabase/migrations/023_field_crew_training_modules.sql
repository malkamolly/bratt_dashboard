-- ============================================================================
-- 023_field_crew_training_modules.sql
-- ============================================================================
-- The "Training Modules" feature. A module is a self-contained training
-- package: a 36-slide presentation + a 20-question multiple-choice test +
-- an auto-graded certificate flow. The first module is Avant 528 Operator;
-- the system is designed to hold many.
--
-- Tables:
--   field_crew_training_modules           — one row per module
--   field_crew_training_module_slides     — the presentation deck
--   field_crew_training_module_questions  — test questions (public)
--   field_crew_training_module_choices    — A/B/C/D answer text (public)
--   field_crew_training_module_answer_key — correct_choice + rationale (mgr-only)
--   field_crew_training_assignments       — module assigned to employee
--   field_crew_training_attempts          — one row per test attempt + score
--   field_crew_training_attempt_answers   — chosen answer per question
--
-- Privacy: the ANSWER KEY table is gated to canEditCrew so only managers can
-- SELECT it. The test-taking page never queries it; grading uses a
-- SECURITY DEFINER server action that reads with elevated privileges.
-- ============================================================================

begin;

-- 1. Catalog entry so a passed test completes a real training row -----------
insert into field_crew_trainings
  (key, display_name, display_order, card_required, is_hours_based)
values
  ('avant_528_operator', 'Avant 528 Operator', 300, false, false)
on conflict (key) do nothing;

-- 2. Module --------------------------------------------------------------
create table field_crew_training_modules (
  slug                text primary key,
  name                text not null,
  description         text,
  training_key        text references field_crew_trainings(key),
  pass_threshold      int  not null default 85
    check (pass_threshold between 0 and 100),
  requires_all_safety boolean not null default true,
  version             text not null default '1.0',
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

-- 3. Slides --------------------------------------------------------------
create table field_crew_training_module_slides (
  id           uuid primary key default gen_random_uuid(),
  module_slug  text not null references field_crew_training_modules(slug) on delete cascade,
  position     int  not null,
  section      text,
  title        text,
  body         text,
  unique (module_slug, position)
);

create index field_crew_training_module_slides_module_idx
  on field_crew_training_module_slides(module_slug, position);

-- 4. Questions (PUBLIC fields only — no correct_choice here) ------------
create table field_crew_training_module_questions (
  id              uuid primary key default gen_random_uuid(),
  module_slug     text not null references field_crew_training_modules(slug) on delete cascade,
  position        int  not null,
  section         text,
  prompt          text not null,
  safety_critical boolean not null default false,
  unique (module_slug, position)
);

create index field_crew_training_module_questions_module_idx
  on field_crew_training_module_questions(module_slug, position);

-- 5. Choices --------------------------------------------------------------
create table field_crew_training_module_choices (
  question_id  uuid not null references field_crew_training_module_questions(id) on delete cascade,
  letter       char(1) not null check (letter in ('A','B','C','D')),
  text         text not null,
  primary key (question_id, letter)
);

-- 6. Answer key (manager-only) --------------------------------------------
create table field_crew_training_module_answer_key (
  question_id    uuid primary key references field_crew_training_module_questions(id) on delete cascade,
  correct_choice char(1) not null check (correct_choice in ('A','B','C','D')),
  rationale      text
);

-- 7. Assignments ----------------------------------------------------------
create table field_crew_training_assignments (
  id              uuid primary key default gen_random_uuid(),
  module_slug     text not null references field_crew_training_modules(slug) on delete cascade,
  employee_slug   text not null references field_crew_employees(slug) on delete cascade,
  assigned_by     text,
  assigned_at     timestamptz not null default now(),
  unique (module_slug, employee_slug)
);

create index field_crew_training_assignments_employee_idx
  on field_crew_training_assignments(employee_slug);

-- 8. Attempts -------------------------------------------------------------
create table field_crew_training_attempts (
  id                       uuid primary key default gen_random_uuid(),
  assignment_id            uuid not null references field_crew_training_assignments(id) on delete cascade,
  started_at               timestamptz not null default now(),
  submitted_at             timestamptz,
  score_correct            int,
  score_total              int,
  passed                   boolean,
  missed_safety_critical   boolean,
  certificate_number       text unique,
  proctor_email            text
);

create index field_crew_training_attempts_assignment_idx
  on field_crew_training_attempts(assignment_id);
create index field_crew_training_attempts_cert_idx
  on field_crew_training_attempts(certificate_number)
  where certificate_number is not null;

-- 9. Per-question answers within an attempt -------------------------------
create table field_crew_training_attempt_answers (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references field_crew_training_attempts(id) on delete cascade,
  question_id  uuid not null references field_crew_training_module_questions(id),
  chosen       char(1) check (chosen in ('A','B','C','D')),
  unique (attempt_id, question_id)
);

-- 10. RLS ----------------------------------------------------------------
-- Almost every table follows the "anyone in the hub reads, managers write"
-- pattern. The exception is field_crew_training_module_answer_key, which
-- is manager-only for SELECT too (crew should not see correct answers).

do $$
declare
  t text;
  tables text[] := array[
    'field_crew_training_modules',
    'field_crew_training_module_slides',
    'field_crew_training_module_questions',
    'field_crew_training_module_choices',
    'field_crew_training_assignments',
    'field_crew_training_attempts',
    'field_crew_training_attempt_answers'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (fc_can_read())', t || '_select', t);
    execute format('create policy %I on %I for insert with check (fc_can_write())', t || '_insert', t);
    execute format('create policy %I on %I for update using (fc_can_write())', t || '_update', t);
    execute format('create policy %I on %I for delete using (fc_can_write())', t || '_delete', t);
  end loop;
end $$;

-- Answer key: managers only, for every operation.
alter table field_crew_training_module_answer_key enable row level security;
create policy field_crew_training_module_answer_key_select
  on field_crew_training_module_answer_key for select using (fc_can_write());
create policy field_crew_training_module_answer_key_insert
  on field_crew_training_module_answer_key for insert with check (fc_can_write());
create policy field_crew_training_module_answer_key_update
  on field_crew_training_module_answer_key for update using (fc_can_write());
create policy field_crew_training_module_answer_key_delete
  on field_crew_training_module_answer_key for delete using (fc_can_write());

-- 11. SECURITY DEFINER grading function -----------------------------------
-- Called by the test-taking flow on submit. Reads the answer key with
-- elevated privileges (the caller doesn't see correct_choice), scores the
-- attempt, writes the result, and — on pass — inserts a completion row into
-- field_crew_employee_trainings and a one-line summary into the activity
-- feed. Returns a JSON blob with the result so the client can render the
-- "you passed" / "you failed" screen.

create or replace function field_crew_grade_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_module record;
  v_assignment record;
  v_employee record;
  v_correct int := 0;
  v_total int := 0;
  v_missed_safety boolean := false;
  v_passed boolean := false;
  v_pct int := 0;
  v_cert_number text;
  v_today date := current_date;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  -- Auth: only crew-hub readers can call this. Writes happen here as the
  -- definer (so even view-only crew can submit their own attempt).
  if not fc_can_read() then
    raise exception 'Forbidden';
  end if;

  -- Fetch attempt + cascade up to module.
  select a.*
  into v_assignment
  from field_crew_training_assignments a
  join field_crew_training_attempts t on t.assignment_id = a.id
  where t.id = p_attempt_id;

  if not found then
    raise exception 'Attempt not found';
  end if;

  select * into v_module
  from field_crew_training_modules
  where slug = v_assignment.module_slug;

  select * into v_employee
  from field_crew_employees
  where slug = v_assignment.employee_slug;

  -- Score every question on this module against the submitted answers.
  -- Missing answers count as incorrect; unknown question_ids are ignored.
  select
    count(*) filter (where q.correct_choice = ans.chosen),
    count(*),
    bool_or(q.safety_critical and (ans.chosen is null or q.correct_choice <> ans.chosen))
  into v_correct, v_total, v_missed_safety
  from field_crew_training_module_questions mq
  join field_crew_training_module_answer_key q on q.question_id = mq.id
  left join field_crew_training_attempt_answers ans
    on ans.attempt_id = p_attempt_id and ans.question_id = mq.id
  where mq.module_slug = v_assignment.module_slug;

  if v_total = 0 then v_total := 1; end if;
  v_pct := (v_correct * 100) / v_total;

  v_passed := (v_pct >= v_module.pass_threshold)
              and not (v_module.requires_all_safety and v_missed_safety);

  if v_passed then
    -- Stable, human-readable cert number, e.g. CERT-AVANT528-2026-AL-A1B2.
    v_cert_number := 'CERT-' || upper(replace(v_module.slug, '_', '')) || '-'
                     || to_char(now(), 'YYYY') || '-'
                     || upper(v_employee.code) || '-'
                     || upper(substring(replace(p_attempt_id::text, '-', ''), 1, 4));
  end if;

  update field_crew_training_attempts
     set submitted_at = now(),
         score_correct = v_correct,
         score_total = v_total,
         passed = v_passed,
         missed_safety_critical = coalesce(v_missed_safety, false),
         certificate_number = v_cert_number,
         proctor_email = nullif(v_email, '')
   where id = p_attempt_id;

  if v_passed then
    -- Auto-complete the linked training row if a training_key is bound.
    if v_module.training_key is not null then
      insert into field_crew_employee_trainings
        (employee_slug, training_key, completed, status, notes)
      values
        (v_employee.slug, v_module.training_key, v_today, null,
         'Passed ' || v_module.name || ' (' || v_cert_number || ')')
      on conflict (employee_slug, training_key) do update
        set completed = excluded.completed,
            status = null,
            notes = excluded.notes;
    end if;

    insert into field_crew_activity
      (employee_slug, occurred_on, description, created_by)
    values
      (v_employee.slug, v_today,
       'Passed ' || v_module.name || ' — ' || v_correct || '/' || v_total
         || ' (cert ' || v_cert_number || ').',
       v_email);
  else
    insert into field_crew_activity
      (employee_slug, occurred_on, description, created_by)
    values
      (v_employee.slug, v_today,
       'Did not pass ' || v_module.name || ' — ' || v_correct || '/' || v_total
         || coalesce(case when v_missed_safety then ' (missed safety-critical)' else '' end, '')
         || '. Retraining required.',
       v_email);
  end if;

  return jsonb_build_object(
    'passed', v_passed,
    'score_correct', v_correct,
    'score_total', v_total,
    'missed_safety_critical', coalesce(v_missed_safety, false),
    'certificate_number', v_cert_number
  );
end;
$func$;

-- Allow any signed-in hub reader to call the grader (the function itself
-- re-checks fc_can_read internally).
grant execute on function field_crew_grade_attempt(uuid) to authenticated;

commit;
