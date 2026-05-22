-- ============================================================================
-- 030_applicators_license.sql
-- ============================================================================
-- Adds the Applicator's License credential as a tracked training for the
-- Plant Healthcare crew. Unlike most trainings, this one really has just
-- three states: in_progress / passed / failed. The existing trainings
-- system can carry this via:
--   - passed       → completed = <date>
--   - in_progress  → status = 'in_progress', completed is null
--   - failed       → status = 'failed', completed is null
--
-- Karenna and Doug already passed it — seed their records as completed
-- = today so the PHC card shows them as "Passed" right away.
-- ============================================================================

begin;

insert into field_crew_trainings
  (key, display_name, display_order, card_required, is_hours_based)
values
  ('applicators_license', 'Applicator''s License', 200, false, false)
on conflict (key) do update
  set display_name = excluded.display_name;

-- Mark Karenna and Doug as passed. Uses name ilike to avoid hard-coding a
-- slug; safe because we restrict to PHC technicians.
insert into field_crew_employee_trainings
  (employee_slug, training_key, completed, status, notes)
select
  e.slug,
  'applicators_license',
  current_date,
  null,
  'Seeded from migration 030 — passed prior to dashboard tracking.'
from field_crew_employees e
where e.position_key = 'phc_technician'
  and (e.name ilike 'karenna%' or e.name ilike 'doug%')
on conflict (employee_slug, training_key) do nothing;

commit;
