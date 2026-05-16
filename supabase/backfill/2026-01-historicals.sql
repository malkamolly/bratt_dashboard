-- ============================================================================
-- Bratt Tree - January 2026 sales historicals
-- ============================================================================
-- Source: ServiceTitan "All - Total Sales" export for January 2026.
-- Totals are rounded up to the nearest whole dollar.
--
-- Add-Ons combines non-roster ServiceTitan technicians:
--   Ross Alm: $450.00, Conrad Larson: $130.00
-- Raw add-ons sum $580.00 -> rounded up to $580.
--
-- Re-running is safe; existing rows get overwritten.
-- ============================================================================

insert into sales_monthly_settings (year, month, company_goal)
values (2026, 1, 1100000.00)
on conflict (year, month) do update
  set company_goal = excluded.company_goal;

insert into sales_monthly_historicals (year, month, salesperson_id, amount, source_note)
select 2026, 1, sp.id, v.amount, 'ServiceTitan export, January 2026'
from (values
  ('Caleb', 22707),
  ('Clayton', 29668),
  ('Dave', 33048),
  ('Hayden', 33244),
  ('Ian', 56524),
  ('Jacob', 6894),
  ('Patrick', 24417),
  ('TJ', 23920),
  ('Jake', 0),
  ('Brent', 42503),
  ('Add-Ons', 580),
  ('Other', 0)
) as v(name, amount)
join salespeople sp on sp.name = v.name
on conflict (year, month, salesperson_id) do update
  set amount = excluded.amount,
      source_note = excluded.source_note,
      updated_at = now();
