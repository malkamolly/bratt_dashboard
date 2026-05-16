-- ============================================================================
-- Bratt Tree Dashboard - Add Caleb Olson to the Other production crew
-- ============================================================================
-- Caleb (salesperson) occasionally has production revenue attributed in
-- ServiceTitan. Adding him as a crew member with home_crew = Other gives
-- him a row on the daily production entry form so that revenue can be
-- entered against the right person.
-- ============================================================================

insert into crew_members (name, home_crew_id, is_foreman, display_order)
select 'Caleb Olson', c.id, false, 320
from crews c
where c.name = 'Other'
on conflict (name) do nothing;
