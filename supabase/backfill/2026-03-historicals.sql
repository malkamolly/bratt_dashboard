-- ============================================================================
-- Bratt Tree - March 2026 sales historicals
-- ============================================================================
-- Source: ServiceTitan "All - Total Sales" export for March 2026.
-- Totals are rounded up to the nearest whole dollar.
--
-- Add-Ons combines non-roster ServiceTitan technicians:
--   Conrad Larson: $1,223.00, Ross Alm: $1,034.00, Sean Brosnan: $450.00, Trevor Newman: $350.00
-- Raw add-ons sum $3057.00 -> rounded up to $3,057.
--
-- Re-running is safe; existing rows get overwritten.
-- ============================================================================

insert into sales_monthly_settings (year, month, company_goal)
values (2026, 3, 1100000.00)
on conflict (year, month) do update
  set company_goal = excluded.company_goal;

insert into sales_monthly_historicals (year, month, salesperson_id, amount, source_note)
select 2026, 3, sp.id, v.amount, 'ServiceTitan export, March 2026'
from (values
  ('Caleb', 2889),
  ('Clayton', 64534),
  ('Dave', 78240),
  ('Hayden', 38999),
  ('Ian', 93581),
  ('Jacob', 79635),
  ('Patrick', 64439),
  ('TJ', 78951),
  ('Jake', 0),
  ('Brent', 38074),
  ('Add-Ons', 3057),
  ('Other', 0)
) as v(name, amount)
join salespeople sp on sp.name = v.name
on conflict (year, month, salesperson_id) do update
  set amount = excluded.amount,
      source_note = excluded.source_note,
      updated_at = now();
