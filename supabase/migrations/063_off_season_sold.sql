-- ============================================================================
-- 063_off_season_sold.sql
-- ============================================================================
-- Adds a "sold" figure alongside "scheduled" on the off-season tracker.
--
--   * sold_revenue      — work signed / won (estimates marked sold). This is
--                         now the PRIMARY metric: goals, pace, and the running
--                         totals on the dashboard are all measured against sold.
--   * scheduled_revenue — work actually on the calendar (already existed). Kept
--                         as a secondary figure so you can see how much of the
--                         sold work has landed on the schedule.
--
-- Non-destructive: adds the column and backfills existing seeded rows so the
-- 2025/2026 reference isn't blank on the sold-focused dashboard. That season's
-- sheet only tracked scheduled revenue, so we treat it as also-sold (they
-- scheduled what they sold). Real sold/scheduled numbers diverge going forward.
-- ============================================================================

alter table off_season_entries
  add column if not exists sold_revenue numeric(12,2) not null default 0;

-- Backfill: seed sold from the existing scheduled figures for the reference
-- season. New daily entries set both explicitly from the entry form.
update off_season_entries set sold_revenue = scheduled_revenue;
