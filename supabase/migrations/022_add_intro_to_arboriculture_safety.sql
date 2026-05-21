-- ============================================================================
-- 022_add_intro_to_arboriculture_safety.sql
-- ============================================================================
-- Adds "Introduction to Arboriculture Safety" to the training catalog.
-- Completion-date based (no card, no hours), same shape as Aerial Rescue
-- and Forwarding Machine.
-- ============================================================================

insert into field_crew_trainings
  (key, display_name, display_order, card_required, is_hours_based) values
  ('intro_to_arboriculture_safety',
   'Introduction to Arboriculture Safety',
   55, false, false)
on conflict (key) do nothing;
