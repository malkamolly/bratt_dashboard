-- ============================================================================
-- Bratt Tree Dashboard - Seed Data
-- ============================================================================
-- Inserts the starting roster (salespeople, crews), the May 2026 budgets
-- carried over from the existing Excel files, and federal holidays for 2026.
--
-- IMPORTANT: replace the placeholder allowlist emails below before running.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Allowlist
-- Seeded with the initial admin email. Additional team members can be added
-- via the admin panel once the dashboard is live, or via SQL:
--   insert into allowed_emails (email, role) values ('name@bratttree.com', 'user');
-- ----------------------------------------------------------------------------
insert into allowed_emails (email, role) values
  ('molly@bratttree.com', 'admin')
on conflict (email) do nothing;

-- ----------------------------------------------------------------------------
-- Salespeople (in the order from the existing Sales PACE spreadsheet)
-- ----------------------------------------------------------------------------
insert into salespeople (name, display_order) values
  ('Caleb',     10),
  ('Clayton',   20),
  ('Dave',      30),
  ('Hayden',    40),
  ('Ian',       50),
  ('Jacob',     60),
  ('Patrick',   70),
  ('TJ',        80),
  ('Jake',      90),
  ('Other',    100),
  ('Add-Ons',  110),
  ('Brent',    120)
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- Production crews + PHC
-- ----------------------------------------------------------------------------
insert into crews (name, kind, display_order) values
  ('Black',           'production', 10),
  ('Blue I',          'production', 20),
  ('Blue II',         'production', 30),
  ('Blue III',        'production', 40),
  ('Gray',            'production', 50),
  ('Green',           'production', 60),
  ('Pink',            'production', 70),
  ('Red',             'production', 80),
  ('Stump Grinding',  'production', 90),
  ('Other',           'production', 100),
  ('Douglas & Karenna', 'phc',       10)
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- Crew monthly budgets for May 2026 (from the project brief)
-- ----------------------------------------------------------------------------
insert into crew_monthly_budgets (year, month, crew_id, budget_revenue)
select 2026, 5, c.id, b.amount
from (values
  ('Black',             121000.00),
  ('Blue I',             66000.00),
  ('Blue II',            66000.00),
  ('Blue III',           61600.00),
  ('Gray',                   0.00),
  ('Green',             118800.00),
  ('Pink',                   0.00),
  ('Red',                99000.00),
  ('Stump Grinding',    154000.00),
  ('Other',              44000.00),
  ('Douglas & Karenna',  63000.00)
) as b(name, amount)
join crews c on c.name = b.name
on conflict (year, month, crew_id) do nothing;

-- ----------------------------------------------------------------------------
-- Sales monthly settings for May 2026
-- ----------------------------------------------------------------------------
insert into sales_monthly_settings (year, month, company_goal)
values (2026, 5, 1100000.00)
on conflict (year, month) do nothing;

insert into production_monthly_settings (year, month) values (2026, 5)
on conflict (year, month) do nothing;

-- ----------------------------------------------------------------------------
-- US Federal Holidays - 2026
-- ----------------------------------------------------------------------------
insert into holidays (holiday_date, label) values
  ('2026-01-01', 'New Year''s Day'),
  ('2026-01-19', 'Martin Luther King Jr. Day'),
  ('2026-02-16', 'Presidents'' Day'),
  ('2026-05-25', 'Memorial Day'),
  ('2026-06-19', 'Juneteenth'),
  ('2026-07-03', 'Independence Day (observed)'),
  ('2026-09-07', 'Labor Day'),
  ('2026-10-12', 'Columbus Day'),
  ('2026-11-11', 'Veterans Day'),
  ('2026-11-26', 'Thanksgiving Day'),
  ('2026-11-27', 'Day After Thanksgiving'),
  ('2026-12-25', 'Christmas Day')
on conflict (holiday_date) do nothing;
