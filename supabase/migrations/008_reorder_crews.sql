-- ============================================================================
-- Bratt Tree Dashboard - Reorder crews to match the new entry-form layout
-- ============================================================================
-- The display_order values now match the row order Molly requested:
--   Row 1: PHC, Stump Grinding (top of the form / their own dashboard tables)
--   Row 2: Black, Red
--   Row 3: Blue I, Blue II, Blue III
--   Row 4: Green 1, Green 2
--   Row 5: Gray, Pink
--   Row 6: Other, Unassigned
-- Dashboard tables are split by kind, so display_order only orders rows
-- within each table; it doesn't change which table a crew appears in.
-- ============================================================================

update crews set display_order = 10  where name = 'Black';
update crews set display_order = 15  where name = 'Red';
update crews set display_order = 20  where name = 'Blue I';
update crews set display_order = 25  where name = 'Blue II';
update crews set display_order = 30  where name = 'Blue III';
update crews set display_order = 40  where name = 'Green 1';
update crews set display_order = 45  where name = 'Green 2';
update crews set display_order = 50  where name = 'Gray';
update crews set display_order = 55  where name = 'Pink';
update crews set display_order = 60  where name = 'Other';
update crews set display_order = 10  where name = 'Stump Grinding'; -- own kind/table
update crews set display_order = 10  where name = 'PHC';            -- own kind/table
update crews set display_order = 999 where name = 'Unassigned';
