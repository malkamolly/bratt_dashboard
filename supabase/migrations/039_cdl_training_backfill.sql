-- ============================================================================
-- 039_cdl_training_backfill.sql
-- ============================================================================
-- Connect the CDL tracker to the catalog "CDL" training for everyone already
-- on the track (the rows seeded directly in 037 never ran through the app, so
-- they have no CDL training record yet). Going forward the app keeps these in
-- sync (see syncCdlTraining in src/app/crew/actions.ts):
--   stage 5 (CDL License obtained) → training Completed
--   stages 1–4                     → training In progress
-- card_received is left as-is.
-- ============================================================================

begin;

insert into field_crew_employee_trainings
  (employee_slug, training_key, completed, status, last_updated)
select
  p.employee_slug,
  'cdl',
  case when p.stage >= 5 then current_date else null end,
  case when p.stage >= 5 then null else 'in_progress' end,
  current_date
from field_crew_cdl_progress p
on conflict (employee_slug, training_key) do update
  set completed    = excluded.completed,
      status       = excluded.status,
      last_updated = excluded.last_updated;

commit;
