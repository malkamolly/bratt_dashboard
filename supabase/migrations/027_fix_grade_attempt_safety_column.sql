-- ============================================================================
-- 027_fix_grade_attempt_safety_column.sql
-- ============================================================================
-- Fix a bug in field_crew_grade_attempt() introduced in migration 023.
-- The scoring query was reading `q.safety_critical`, but `q` aliases the
-- answer-key table — `safety_critical` lives on the questions table
-- (alias `mq`). Test submission failed with:
--   "column q.safety_critical does not exist"
-- ============================================================================

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

  if not found then
    raise exception 'Attempt not found';
  end if;

  select * into v_module
  from field_crew_training_modules
  where slug = v_assignment.module_slug;

  select * into v_employee
  from field_crew_employees
  where slug = v_assignment.employee_slug;

  -- The fix: pull safety_critical from mq (questions), not q (answer_key).
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

  if v_passed then
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

grant execute on function field_crew_grade_attempt(uuid) to authenticated;
