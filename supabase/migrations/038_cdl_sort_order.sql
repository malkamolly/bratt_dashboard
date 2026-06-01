-- ============================================================================
-- 038_cdl_sort_order.sql
-- ============================================================================
-- Adds a manual display order to the CDL tracker so managers can arrange crew
-- in whatever order they want (not just by stage or name). Lower sort_order
-- shows first. New trainees get appended to the end (handled in the app).
-- ============================================================================

begin;

alter table field_crew_cdl_progress
  add column if not exists sort_order int not null default 0;

-- Give existing rows a stable starting order (by stage, then slug). Only
-- touches rows still at the default 0, so re-running won't clobber a custom
-- order someone has already set.
with ordered as (
  select employee_slug,
         row_number() over (order by stage, employee_slug) as rn
  from field_crew_cdl_progress
)
update field_crew_cdl_progress p
set sort_order = ordered.rn
from ordered
where ordered.employee_slug = p.employee_slug
  and p.sort_order = 0;

commit;
