-- ============================================================================
-- Bratt Tree Dashboard - Annual production goal column
-- ============================================================================
-- Adds annual_production_goal alongside the existing annual_goal (sales) on
-- yearly_targets. Lets the YTD strip on /production show a real progress bar.
-- ============================================================================

alter table yearly_targets
  add column if not exists annual_production_goal numeric(14,2) not null default 0;
