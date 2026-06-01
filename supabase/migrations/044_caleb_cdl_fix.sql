-- ============================================================================
-- 044_caleb_cdl_fix.sql
-- ============================================================================
-- Make sure Caleb is marked as a CDL holder (so the hub pill shows) and sits
-- at Stage 5 on the tracker. Self-contained and idempotent — safe to run on
-- its own even if 041/043 were missed. Matched by 'caleb%' since he's the only
-- Caleb on the crew, so a name/spacing difference can't cause a miss.
-- ============================================================================

begin;

-- 1. CDL training → Completed, no date (drives the hub CDL pill + "Completed").
insert into field_crew_employee_trainings
  (employee_slug, training_key, completed, status, last_updated)
select fce.slug, 'cdl', null, 'completed_date_tbd', current_date
from field_crew_employees fce
where fce.name ilike 'caleb%'
on conflict (employee_slug, training_key) do update
  set status = case
                 when field_crew_employee_trainings.completed is null
                 then 'completed_date_tbd'
                 else field_crew_employee_trainings.status
               end,
      last_updated = current_date;

-- 2. Tracker → Stage 5 (CDL License obtained).
insert into field_crew_cdl_progress (employee_slug, stage, sort_order)
select fce.slug, 5,
       coalesce((select max(sort_order) from field_crew_cdl_progress), 0) + 1
from field_crew_employees fce
where fce.name ilike 'caleb%'
on conflict (employee_slug) do update set stage = 5;

commit;
