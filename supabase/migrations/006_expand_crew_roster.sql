-- ============================================================================
-- Bratt Tree Dashboard - Expand crew roster (May 2026)
-- ============================================================================
-- 1. Splits the legacy "Green" crew into "Green 1" and "Green 2".
--    The existing Green crew row is renamed to "Green 1" so its existing
--    monthly budget and any prior entries stay attached. "Green 2" is added
--    fresh - set its budget via the admin form once known.
-- 2. Seeds the rest of the team rosters Molly provided:
--    Blue II, Blue III, Green 1, Green 2, Pink, Red, Gray, plus three
--    unassigned members (Nick H, Tim, Scott) with no home crew.
--    Already-seeded members (Black, Blue I, Stump Grinding, PHC) are left
--    untouched - the ON CONFLICT clauses skip them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Green split
-- ---------------------------------------------------------------------------
update crews set name = 'Green 1' where name = 'Green';

insert into crews (name, kind, display_order, is_active) values
  ('Green 2', 'production', 65, true)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- New crew members
-- ---------------------------------------------------------------------------
insert into crew_members (name, home_crew_id, is_foreman, display_order) values
  -- Blue II
  ('Andy L',    (select id from crews where name = 'Blue II'),  true,  100),
  ('Ty',        (select id from crews where name = 'Blue II'),  false, 110),
  ('Finn',      (select id from crews where name = 'Blue II'),  false, 120),
  -- Blue III
  ('Conrad',    (select id from crews where name = 'Blue III'), true,  130),
  ('Elia',      (select id from crews where name = 'Blue III'), false, 140),
  ('Chandler',  (select id from crews where name = 'Blue III'), false, 150),
  -- Green 1
  ('Ross',      (select id from crews where name = 'Green 1'),  true,  160),
  ('Trevor',    (select id from crews where name = 'Green 1'),  false, 170),
  ('Berkeley',  (select id from crews where name = 'Green 1'),  false, 180),
  -- Green 2
  ('Ezra',      (select id from crews where name = 'Green 2'),  true,  190),
  -- Pink
  ('Sean B',    (select id from crews where name = 'Pink'),     true,  200),
  ('Nolan',     (select id from crews where name = 'Pink'),     false, 210),
  ('Meghan',    (select id from crews where name = 'Pink'),     false, 220),
  -- Red
  ('Jackson',   (select id from crews where name = 'Red'),      true,  230),
  ('Braeden',   (select id from crews where name = 'Red'),      false, 240),
  -- Gray
  ('Sean-Paul', (select id from crews where name = 'Gray'),     true,  250),
  -- Unassigned
  ('Nick H',    null,                                           false, 260),
  ('Tim',       null,                                           false, 270),
  ('Scott',     null,                                           false, 280)
on conflict (name) do nothing;
