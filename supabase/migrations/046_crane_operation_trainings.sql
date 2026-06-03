-- ============================================================================
-- 046_crane_operation_trainings.sql
-- ============================================================================
-- Adds three crane-operation trainings to the Field Crew Hub catalog:
--   Climbing with Crane, Bucket with Crane, Nifty with Crane.
--
-- Hours-based (no card), same shape as the existing Bucket / Nifty / Climbing
-- Removal & Pruning trainings. Slotted at 130–150 so they sit right after the
-- Crane Use levels (110, 120) and before the 200-series trainings.
-- ============================================================================

insert into field_crew_trainings
  (key, display_name, display_order, card_required, is_hours_based)
values
  ('climbing_with_crane', 'Climbing with Crane', 130, false, true),
  ('bucket_with_crane',   'Bucket with Crane',   140, false, true),
  ('nifty_with_crane',    'Nifty with Crane',    150, false, true)
on conflict (key) do nothing;
