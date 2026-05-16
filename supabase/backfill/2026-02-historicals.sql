-- ============================================================================
-- Bratt Tree - February 2026 sales historicals
-- ============================================================================
-- Source: ServiceTitan "All - Total Sales" export for February 2026.
-- Totals are rounded up to the nearest whole dollar.
--
-- Add-Ons combines non-roster ServiceTitan technicians:
--   Sean Brosnan: $748.00, Conrad Larson: $368.00, Ross Alm: $293.00, Trevor Newman: $281.00, Ezra Vaughn: $200.00
-- Raw add-ons sum $1890.00 -> rounded up to $1,890.
--
-- Re-running is safe; existing rows get overwritten.
-- ============================================================================

insert into sales_monthly_settings (year, month, company_goal)
values (2026, 2, 1100000.00)
on conflict (year, month) do update
  set company_goal = excluded.company_goal;

insert into sales_monthly_historicals (year, month, salesperson_id, amount, source_note)
select 2026, 2, sp.id, v.amount, 'ServiceTitan export, February 2026'
from (values
  ('Caleb', 10993),
  ('Clayton', 45572),
  ('Dave', 37491),
  ('Hayden', 30719),
  ('Ian', 81245),
  ('Jacob', 34302),
  ('Patrick', 27201),
  ('TJ', 31617),
  ('Jake', 0),
  ('Brent', 36442),
  ('Add-Ons', 1890),
  ('Other', 0)
) as v(name, amount)
join salespeople sp on sp.name = v.name
on conflict (year, month, salesperson_id) do update
  set amount = excluded.amount,
      source_note = excluded.source_note,
      updated_at = now();
