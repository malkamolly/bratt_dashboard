-- ============================================================================
-- 043_cdl_holders_to_stage5.sql
-- ============================================================================
-- The CDL tracking overview reads the tracker (field_crew_cdl_progress), but
-- crew who already hold a CDL were only marked complete on the *training*
-- record — they weren't on the tracker, so Stage 5 showed empty. Put every
-- CDL holder onto the tracker at Stage 5 (CDL License obtained).
--
-- "Holder" = their CDL training is complete (a real date, or the no-date
-- 'completed_date_tbd' used for prior holders). Anyone already on the tracker
-- (e.g. the Stage 1 folks still studying) is left where they are.
-- ============================================================================

begin;

insert into field_crew_cdl_progress (employee_slug, stage, sort_order)
select
  et.employee_slug,
  5,
  coalesce((select max(sort_order) from field_crew_cdl_progress), 0)
    + row_number() over (order by et.employee_slug)
from field_crew_employee_trainings et
where et.training_key = 'cdl'
  and (et.completed is not null or et.status = 'completed_date_tbd')
  and not exists (
    select 1 from field_crew_cdl_progress p
    where p.employee_slug = et.employee_slug
  )
on conflict (employee_slug) do nothing;

commit;
