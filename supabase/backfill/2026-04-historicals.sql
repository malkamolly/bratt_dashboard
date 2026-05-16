-- ============================================================================
-- Bratt Tree - April 2026 sales historicals
-- ============================================================================
-- Source: ServiceTitan "All - Total Sales" report, date range 4/1/26 - 4/30/26.
-- Totals are rounded up to the nearest whole dollar.
--
-- Add-Ons bucket combines every ServiceTitan technician whose name does not
-- match a sales-team roster member (Ross Alm, 1_Unassigned Sales, Andrew Linn,
-- Conrad Larson, Sean Brosnan, John Carpenter, Ezra Vaughn). Raw sum $3,933.00
-- rounded up to $3,933.
--
-- Run order: this file requires migration 003_monthly_historicals.sql to exist.
-- Re-running is safe; existing rows get overwritten with the values below.
-- ============================================================================

-- Make sure the monthly company goal is set (April was $1.1M, same as May).
insert into sales_monthly_settings (year, month, company_goal)
values (2026, 4, 1100000.00)
on conflict (year, month) do update
  set company_goal = excluded.company_goal;

-- April per-salesperson totals.
insert into sales_monthly_historicals (year, month, salesperson_id, amount, source_note)
select 2026, 4, sp.id, v.amount, 'ServiceTitan export, April 2026'
from (values
  ('Caleb',     30626),
  ('Clayton',   95609),
  ('Dave',     121549),
  ('Hayden',    71809),
  ('Ian',      130328),
  ('Jacob',     77935),
  ('Patrick',   48271),
  ('TJ',        96310),
  ('Jake',      29015),
  ('Brent',     30262),
  ('Add-Ons',    3933),
  ('Other',         0)
) as v(name, amount)
join salespeople sp on sp.name = v.name
on conflict (year, month, salesperson_id) do update
  set amount = excluded.amount,
      source_note = excluded.source_note,
      updated_at = now();
