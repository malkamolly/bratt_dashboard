-- ============================================================================
-- Bratt Tree Dashboard - Rename PHC, Stump Grinding & Unassigned categories
-- ============================================================================
-- 1. Rename the "Douglas & Karenna" crew to "PHC".
-- 2. Loosen the crews.kind check constraint to allow 'stump' and 'unassigned'.
-- 3. Reclassify Stump Grinding as kind='stump' so the dashboard can render
--    it in its own section between Production and PHC.
-- 4. Add an "Unassigned" crew (kind='unassigned') as a holding bucket for
--    crew members who don't have a home crew yet. Hidden from the dashboard.
-- 5. Point Nick H, Tim, Scott at Unassigned so they show up on the entry
--    form (they had home_crew_id = null before).
-- ============================================================================

-- 1. PHC rename
update crews set name = 'PHC' where name = 'Douglas & Karenna';

-- 2. Allow new kinds
alter table crews drop constraint crews_kind_check;
alter table crews
  add constraint crews_kind_check
  check (kind in ('production', 'phc', 'stump', 'unassigned'));

-- 3. Reclassify Stump Grinding
update crews set kind = 'stump' where name = 'Stump Grinding';

-- 4. Unassigned bucket
insert into crews (name, kind, display_order, is_active) values
  ('Unassigned', 'unassigned', 999, true)
on conflict (name) do nothing;

-- 5. Move the three rostered-but-unassigned members into the Unassigned crew
update crew_members
   set home_crew_id = (select id from crews where name = 'Unassigned')
 where name in ('Nick H', 'Tim', 'Scott')
   and home_crew_id is null;
