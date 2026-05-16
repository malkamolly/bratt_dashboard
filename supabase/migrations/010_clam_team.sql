-- ============================================================================
-- Bratt Tree Dashboard - Clam team
-- ============================================================================
-- 1. Adds 'clam' to the allowed crews.kind values so the dashboard can render
--    a "Clam" section alongside Stump Grinding and PHC.
-- 2. Creates the Clam crew.
-- 3. Seeds three crew members onto the Clam team: Eric Schwagel,
--    Francisco Fonseca, Sean Adams. None marked as foreman for now - if Molly
--    wants to crown one, flip the bit from the admin form.
-- ============================================================================

alter table crews drop constraint crews_kind_check;
alter table crews
  add constraint crews_kind_check
  check (kind in ('production', 'phc', 'stump', 'unassigned', 'clam'));

insert into crews (name, kind, display_order, is_active) values
  ('Clam', 'clam', 10, true)
on conflict (name) do nothing;

insert into crew_members (name, home_crew_id, is_foreman, display_order)
select v.name, c.id, false, v.ord
from (values
  ('Eric Schwagel',     290),
  ('Francisco Fonseca', 300),
  ('Sean Adams',        310)
) as v(name, ord)
join crews c on c.name = 'Clam'
on conflict (name) do nothing;
