-- ============================================================================
-- Bratt Tree - 2026 per-salesperson monthly SALES GOALS (targets)
-- ============================================================================
-- Source: 2026 sales plan spreadsheet (Leads x rate = Sales target per person).
-- These are GOALS, not actuals. They populate sales_monthly_settings.per_person_goals
-- (the "Per-Salesperson Goals" section on the admin Sales page) for every month
-- of 2026.
--
-- Only the per_person_goals column is written. The monthly company_goal is left
-- untouched: existing months (Jan-May, currently $1.1M) keep their value, and any
-- month created by this script (Jun-Dec) defaults to $0 until set separately.
--
-- Leads counts from the spreadsheet are NOT stored - the dashboard only tracks
-- the sales-dollar target per person. The dollar figures below already reflect
-- those lead projections.
--
-- Re-running is safe: each month's per_person_goals is replaced with the values
-- below (the company_goal is preserved by the do-update clause).
-- ============================================================================

insert into sales_monthly_settings (year, month, per_person_goals)
select 2026, g.month, jsonb_object_agg(sp.id::text, g.amount)
from (values
  -- name,       month, sales goal ($)
  ('Clayton',  1,  40392), ('Clayton',  2,  40392), ('Clayton',  3,  53856),
  ('Clayton',  4,  67320), ('Clayton',  5, 127908), ('Clayton',  6, 181764),
  ('Clayton',  7, 181764), ('Clayton',  8, 181764), ('Clayton',  9, 181764),
  ('Clayton', 10, 181764), ('Clayton', 11,  67320), ('Clayton', 12,  40392),

  ('Dave',     1,  40392), ('Dave',     2,  40392), ('Dave',     3,  53856),
  ('Dave',     4,  67320), ('Dave',     5, 127908), ('Dave',     6, 181764),
  ('Dave',     7, 181764), ('Dave',     8, 181764), ('Dave',     9, 181764),
  ('Dave',    10, 181764), ('Dave',    11,  67320), ('Dave',    12,  40392),

  ('Hayden',   1,  31680), ('Hayden',   2,  31680), ('Hayden',   3,  42240),
  ('Hayden',   4,  52800), ('Hayden',   5, 100320), ('Hayden',   6, 142560),
  ('Hayden',   7, 142560), ('Hayden',   8, 142560), ('Hayden',   9, 142560),
  ('Hayden',  10, 142560), ('Hayden',  11,  52800), ('Hayden',  12,  31680),

  ('Ian',      1,  51480), ('Ian',      2,  51480), ('Ian',      3,  68640),
  ('Ian',      4,  85800), ('Ian',      5, 163020), ('Ian',      6, 231660),
  ('Ian',      7, 231660), ('Ian',      8, 231660), ('Ian',      9, 231660),
  ('Ian',     10, 231660), ('Ian',     11,  85800), ('Ian',     12,  51480),

  ('Jacob',    1,  31680), ('Jacob',    2,  31680), ('Jacob',    3,  42240),
  ('Jacob',    4,  52800), ('Jacob',    5, 100320), ('Jacob',    6, 142560),
  ('Jacob',    7, 142560), ('Jacob',    8, 142560), ('Jacob',    9, 142560),
  ('Jacob',   10, 142560), ('Jacob',   11,  52800), ('Jacob',   12,  31680),

  ('Patrick',  1,  30000), ('Patrick',  2,  30000), ('Patrick',  3,  40000),
  ('Patrick',  4,  50000), ('Patrick',  5,  95000), ('Patrick',  6, 135000),
  ('Patrick',  7, 135000), ('Patrick',  8, 135000), ('Patrick',  9, 135000),
  ('Patrick', 10, 135000), ('Patrick', 11,  50000), ('Patrick', 12,  30000),

  ('TJ',       1,  34500), ('TJ',       2,  34500), ('TJ',       3,  46000),
  ('TJ',       4,  57500), ('TJ',       5, 109250), ('TJ',       6, 155250),
  ('TJ',       7, 155250), ('TJ',       8, 155250), ('TJ',       9, 155250),
  ('TJ',      10, 155250), ('TJ',      11,  57500), ('TJ',      12,  34500)
) as g(name, month, amount)
join salespeople sp on sp.name = g.name
group by g.month
on conflict (year, month) do update
  set per_person_goals = excluded.per_person_goals;
