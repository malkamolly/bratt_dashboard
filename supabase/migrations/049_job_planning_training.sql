-- ============================================================================
-- 049_job_planning_training.sql
-- ============================================================================
-- Adds a "Job Planning" training to the Field Crew Hub catalog.
--
-- Hours-based (we track a running tally of hours, like Saw Hours / the
-- bucket & climbing trainings) and no physical card. Slotted at 65 so it sits
-- right after Aerial Rescue (60) and before Ground Ops 1 (70) — a foundational
-- planning step ahead of ground operations.
-- ============================================================================

insert into field_crew_trainings
  (key, display_name, display_order, card_required, is_hours_based)
values
  ('job_planning', 'Job Planning', 65, false, true)
on conflict (key) do nothing;
