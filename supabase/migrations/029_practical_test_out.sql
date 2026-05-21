-- ============================================================================
-- 029_practical_test_out.sql
-- ============================================================================
-- Adds the practical test-out feature to training modules. A module can
-- have a list of practical items (Area / Task). For each assigned crew
-- member, a manager signs off individual items with their initials.
--
-- The certificate is now issued only when BOTH conditions hold for an
-- assignment: the written test has been passed AND every practical item
-- has a signoff row. Either side can complete first — the cert is issued
-- by whichever action completes the pair.
--
-- We refactor field_crew_grade_attempt to stop issuing the cert directly,
-- and add a shared helper field_crew_try_issue_certificate(assignment_id)
-- that both the grading function and the practical-signoff action call.
-- ============================================================================

begin;

-- 1. Practical items (one row per Area+Task line on slide #32) --------------
create table if not exists field_crew_training_module_practical_items (
  id           uuid primary key default gen_random_uuid(),
  module_slug  text not null references field_crew_training_modules(slug) on delete cascade,
  position     int  not null,
  area         text not null,
  task         text not null,
  unique (module_slug, position)
);

create index if not exists field_crew_training_module_practical_items_module_idx
  on field_crew_training_module_practical_items(module_slug, position);

-- 2. Signoffs (one row per assignment+item that has been verified) ----------
create table if not exists field_crew_training_practical_signoffs (
  id                uuid primary key default gen_random_uuid(),
  assignment_id     uuid not null references field_crew_training_assignments(id) on delete cascade,
  item_id           uuid not null references field_crew_training_module_practical_items(id) on delete cascade,
  trainer_initials  text not null,
  trainer_email     text not null,
  signed_at         timestamptz not null default now(),
  unique (assignment_id, item_id)
);

create index if not exists field_crew_training_practical_signoffs_assignment_idx
  on field_crew_training_practical_signoffs(assignment_id);

-- 3. RLS ---------------------------------------------------------------------
alter table field_crew_training_module_practical_items enable row level security;
alter table field_crew_training_practical_signoffs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy where polname = 'practical_items_select'
  ) then
    create policy practical_items_select
      on field_crew_training_module_practical_items for select using (fc_can_read());
    create policy practical_items_insert
      on field_crew_training_module_practical_items for insert with check (fc_can_write());
    create policy practical_items_update
      on field_crew_training_module_practical_items for update using (fc_can_write());
    create policy practical_items_delete
      on field_crew_training_module_practical_items for delete using (fc_can_write());

    create policy practical_signoffs_select
      on field_crew_training_practical_signoffs for select using (fc_can_read());
    create policy practical_signoffs_insert
      on field_crew_training_practical_signoffs for insert with check (fc_can_write());
    create policy practical_signoffs_update
      on field_crew_training_practical_signoffs for update using (fc_can_write());
    create policy practical_signoffs_delete
      on field_crew_training_practical_signoffs for delete using (fc_can_write());
  end if;
end $$;

-- 4. Helper: is the practical complete for this assignment? -----------------
create or replace function field_crew_practical_complete(p_assignment_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $func$
declare
  v_total int;
  v_signed int;
  v_module_slug text;
begin
  select module_slug into v_module_slug
  from field_crew_training_assignments where id = p_assignment_id;
  if v_module_slug is null then return false; end if;

  select count(*) into v_total
  from field_crew_training_module_practical_items
  where module_slug = v_module_slug;

  -- No practical items defined for the module = practical not required.
  if v_total = 0 then return true; end if;

  select count(*) into v_signed
  from field_crew_training_practical_signoffs s
  join field_crew_training_module_practical_items i on i.id = s.item_id
  where s.assignment_id = p_assignment_id
    and i.module_slug = v_module_slug;

  return v_signed >= v_total;
end;
$func$;

grant execute on function field_crew_practical_complete(uuid) to authenticated;

-- 5. Helper: issue cert if BOTH the written test and the practical are done -
-- Called by both the grading function and the practical-signoff server
-- action. Idempotent: does nothing if the cert is already issued, or if
-- either side is still pending. Returns the cert number on success, null
-- otherwise.
create or replace function field_crew_try_issue_certificate(p_assignment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_attempt   record;
  v_module    record;
  v_employee  record;
  v_cert_number text;
  v_today date := current_date;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if not fc_can_read() then
    raise exception 'Forbidden';
  end if;

  -- Most-recent passed attempt without a cert.
  select t.* into v_attempt
  from field_crew_training_attempts t
  where t.assignment_id = p_assignment_id
    and t.passed is true
    and t.certificate_number is null
  order by t.submitted_at desc nulls last
  limit 1;
  if not found then return null; end if;

  -- Both halves must be complete.
  if not field_crew_practical_complete(p_assignment_id) then return null; end if;

  select m.* into v_module
  from field_crew_training_modules m
  join field_crew_training_assignments a on a.module_slug = m.slug
  where a.id = p_assignment_id;

  select e.* into v_employee
  from field_crew_employees e
  join field_crew_training_assignments a on a.employee_slug = e.slug
  where a.id = p_assignment_id;

  v_cert_number := 'CERT-' || upper(replace(v_module.slug, '_', '')) || '-'
                   || to_char(now(), 'YYYY') || '-'
                   || upper(v_employee.code) || '-'
                   || upper(substring(replace(v_attempt.id::text, '-', ''), 1, 4));

  update field_crew_training_attempts
     set certificate_number = v_cert_number
   where id = v_attempt.id;

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
     'Certified on ' || v_module.name || ' — cert ' || v_cert_number || '.',
     v_email);

  return v_cert_number;
end;
$func$;

grant execute on function field_crew_try_issue_certificate(uuid) to authenticated;

-- 6. Replace field_crew_grade_attempt so it defers cert issuance ------------
-- Same scoring as 027; the only change is that cert + training-row +
-- activity is now done inside field_crew_try_issue_certificate so the
-- practical-signoff path can share it.
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
  if not fc_can_read() then
    raise exception 'Forbidden';
  end if;

  select a.*
  into v_assignment
  from field_crew_training_assignments a
  join field_crew_training_attempts t on t.assignment_id = a.id
  where t.id = p_attempt_id;
  if not found then raise exception 'Attempt not found'; end if;

  select * into v_module
  from field_crew_training_modules
  where slug = v_assignment.module_slug;

  select * into v_employee
  from field_crew_employees
  where slug = v_assignment.employee_slug;

  select
    count(*) filter (where q.correct_choice = ans.chosen),
    count(*),
    bool_or(mq.safety_critical and (ans.chosen is null or q.correct_choice <> ans.chosen))
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

  update field_crew_training_attempts
     set submitted_at = now(),
         score_correct = v_correct,
         score_total = v_total,
         passed = v_passed,
         missed_safety_critical = coalesce(v_missed_safety, false),
         proctor_email = nullif(v_email, '')
   where id = p_attempt_id;

  if v_passed then
    -- Cert + training row + activity row are all done here. If the
    -- practical isn't complete yet, this is a no-op and the cert will
    -- be issued the moment the last item gets signed off.
    v_cert_number := field_crew_try_issue_certificate(v_assignment.id);
    if v_cert_number is null then
      insert into field_crew_activity
        (employee_slug, occurred_on, description, created_by)
      values
        (v_employee.slug, v_today,
         'Passed written ' || v_module.name || ' — ' || v_correct || '/' || v_total
           || '. Awaiting practical test-out.',
         v_email);
    end if;
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

grant execute on function field_crew_grade_attempt(uuid) to authenticated;

-- 7. Seed the 15 practical items for Avant 528 -----------------------------
insert into field_crew_training_module_practical_items
  (module_slug, position, area, task)
values
  ('avant_528_operator',  1, 'Pre-Op',   'Complete a full pre-op walk-around verbally narrating each check'),
  ('avant_528_operator',  2, 'Pre-Op',   'Verify and document fluid levels (engine oil, coolant, hydraulic)'),
  ('avant_528_operator',  3, 'Pre-Op',   'Attach the Branch Manager grapple from a cold start (no shortcuts)'),
  ('avant_528_operator',  4, 'Startup',  'Mount the machine with proper three points of contact'),
  ('avant_528_operator',  5, 'Startup',  'Complete the cold-start sequence and warm-up correctly'),
  ('avant_528_operator',  6, 'Driving',  'Drive a figure-8 course without articulation correction errors'),
  ('avant_528_operator',  7, 'Driving',  'Travel with boom DOWN and demonstrate slow direction change'),
  ('avant_528_operator',  8, 'Driving',  'Reverse with spotter using verbal + hand signals'),
  ('avant_528_operator',  9, 'Grapple',  'Pick up a single log, rotate 180°, set it on a target'),
  ('avant_528_operator', 10, 'Grapple',  'Move a brush pile to a marked drop zone in 3 bites or fewer'),
  ('avant_528_operator', 11, 'Loading',  'Load a designated debris item into a truck bed without striking the sides'),
  ('avant_528_operator', 12, 'Loading',  'Demonstrate proper chipper feeding etiquette with a partner'),
  ('avant_528_operator', 13, 'Shutdown', 'Perform full shutdown sequence and lockout'),
  ('avant_528_operator', 14, 'Shutdown', 'Detach the grapple and stage it safely'),
  ('avant_528_operator', 15, 'Recovery', 'Identify the 5 most common failure points by sight on the machine')
on conflict (module_slug, position) do update
  set area = excluded.area, task = excluded.task;

commit;
