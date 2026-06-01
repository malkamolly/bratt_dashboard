-- ============================================================================
-- 041_cdl_john_caleb.sql
-- ============================================================================
-- John C and Caleb O came into field_crew_employees via the crew-table merge
-- (034), so they were on the roster all along — they just weren't in the
-- original hub seed. This adds the CDL data that was skipped for them:
--   • John C  → CDL tracker, Stage 1 (Independent Study)
--   • Caleb O → already holds a CDL: Completed, no date on file
--
-- Matched by name (lower/trim) so we don't depend on the exact generated slug.
-- ============================================================================

begin;

-- John C → CDL tracker at Stage 1, appended to the end of the order.
insert into field_crew_cdl_progress (employee_slug, stage, sort_order)
select fce.slug, 1,
       coalesce((select max(sort_order) from field_crew_cdl_progress), 0) + 1
from field_crew_employees fce
where lower(trim(fce.name)) = 'john c'
on conflict (employee_slug) do nothing;

-- Keep John's catalog CDL training in sync (In progress) — only if not
-- already completed.
insert into field_crew_employee_trainings
  (employee_slug, training_key, status, last_updated)
select fce.slug, 'cdl', 'in_progress', current_date
from field_crew_employees fce
where lower(trim(fce.name)) = 'john c'
on conflict (employee_slug, training_key) do update
  set status = 'in_progress', last_updated = current_date
  where field_crew_employee_trainings.completed is null;

-- Caleb O → already holds a CDL: Completed, no date.
insert into field_crew_employee_trainings
  (employee_slug, training_key, completed, status, last_updated)
select fce.slug, 'cdl', null, 'completed_date_tbd', current_date
from field_crew_employees fce
where lower(trim(fce.name)) = 'caleb o'
on conflict (employee_slug, training_key) do update
  set status = 'completed_date_tbd', last_updated = current_date;

commit;
