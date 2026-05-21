-- ============================================================================
-- 025_field_crew_self_service.sql
-- ============================================================================
-- Lets a field_crew user (not an admin / field_manager) take their own
-- assigned tests, and lets the landing page auto-route them to their own
-- profile when they sign in.
--
-- Two pieces:
--   1. New `auth_email` column on field_crew_employees that links a sign-in
--      email to an employee record. Set by an admin via the Edit Profile
--      form. The same email must also be on the allowed_emails allowlist
--      with role 'field_crew' (or 'field_manager' / 'admin').
--   2. RLS policies relaxed so a user whose JWT email matches the
--      assignment's employee can INSERT/UPDATE rows in
--      field_crew_training_attempts + _attempt_answers. Managers retain
--      full access. Everyone else is still blocked.
-- ============================================================================

begin;

-- 1. auth_email column ------------------------------------------------------
alter table field_crew_employees
  add column if not exists auth_email text;

-- Case-insensitive uniqueness (lowercase index). NULLs allowed and
-- intentionally not enforced — multiple employees can have NULL email.
create unique index if not exists field_crew_employees_auth_email_idx
  on field_crew_employees (lower(auth_email))
  where auth_email is not null;

-- 2. Helper: "is the caller this employee?" --------------------------------
create or replace function fc_is_self(p_employee_slug text) returns boolean
  language sql stable security definer
  set search_path = public
as $$
  select exists (
    select 1 from field_crew_employees
    where slug = p_employee_slug
      and lower(coalesce(auth_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

grant execute on function fc_is_self(text) to authenticated;

-- 3. Relax RLS so crew can submit their own attempts -----------------------

drop policy if exists field_crew_training_attempts_insert on field_crew_training_attempts;
create policy field_crew_training_attempts_insert
  on field_crew_training_attempts for insert
  with check (
    fc_can_write() or exists (
      select 1 from field_crew_training_assignments a
      where a.id = field_crew_training_attempts.assignment_id
        and fc_is_self(a.employee_slug)
    )
  );

drop policy if exists field_crew_training_attempts_update on field_crew_training_attempts;
create policy field_crew_training_attempts_update
  on field_crew_training_attempts for update
  using (
    fc_can_write() or exists (
      select 1 from field_crew_training_assignments a
      where a.id = field_crew_training_attempts.assignment_id
        and fc_is_self(a.employee_slug)
    )
  );

drop policy if exists field_crew_training_attempt_answers_insert on field_crew_training_attempt_answers;
create policy field_crew_training_attempt_answers_insert
  on field_crew_training_attempt_answers for insert
  with check (
    fc_can_write() or exists (
      select 1 from field_crew_training_attempts t
      join field_crew_training_assignments a on a.id = t.assignment_id
      where t.id = field_crew_training_attempt_answers.attempt_id
        and fc_is_self(a.employee_slug)
    )
  );

drop policy if exists field_crew_training_attempt_answers_update on field_crew_training_attempt_answers;
create policy field_crew_training_attempt_answers_update
  on field_crew_training_attempt_answers for update
  using (
    fc_can_write() or exists (
      select 1 from field_crew_training_attempts t
      join field_crew_training_assignments a on a.id = t.assignment_id
      where t.id = field_crew_training_attempt_answers.attempt_id
        and fc_is_self(a.employee_slug)
    )
  );

commit;
