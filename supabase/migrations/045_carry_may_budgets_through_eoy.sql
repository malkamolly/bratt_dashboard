-- ============================================================================
-- 045_carry_may_budgets_through_eoy.sql
-- ============================================================================
-- Carry each crew's May 2026 monthly budget forward into June–December 2026.
--
-- Pulls straight from whatever the May 2026 rows currently hold (so any edits
-- made to May since the original seed are what gets copied) and writes the
-- same amount into months 6 through 12. OVERWRITES any budget already set for
-- those months so Jun–Dec match May exactly, per the owner's request.
--
-- Safe to re-run: it always re-derives Jun–Dec from the current May values.
-- ============================================================================

begin;

insert into crew_monthly_budgets (year, month, crew_id, budget_revenue)
select 2026, m.month, b.crew_id, b.budget_revenue
from crew_monthly_budgets b
cross join (values (6), (7), (8), (9), (10), (11), (12)) as m(month)
where b.year = 2026
  and b.month = 5
on conflict (year, month, crew_id)
  do update set budget_revenue = excluded.budget_revenue;

commit;
