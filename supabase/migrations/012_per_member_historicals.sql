-- ============================================================================
-- Bratt Tree Dashboard - Per-member production historicals
-- ============================================================================
-- 1. Adds production_member_historicals so closed months can be drilled down
--    to the individual technician level for auditing against ServiceTitan.
-- 2. Inserts inactive crew_members for the technicians who appeared in
--    ServiceTitan Jan-Apr data but aren't on the active roster (former
--    employees + a ServiceTitan placeholder). is_active=false keeps them
--    off the daily entry form but lets the audit table reference them.
-- ============================================================================

create table production_member_historicals (
  year           int not null,
  month          int not null check (month between 1 and 12),
  crew_member_id uuid not null references crew_members(id) on delete restrict,
  crew_id        uuid not null references crews(id) on delete restrict,
  jobs           int not null default 0 check (jobs >= 0),
  revenue        numeric(12,2) not null default 0,
  source_note    text,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (year, month, crew_member_id)
);
create index production_member_historicals_crew_idx on production_member_historicals(crew_id);
create index production_member_historicals_year_idx on production_member_historicals(year);

create trigger production_member_historicals_updated before update on production_member_historicals
  for each row execute function set_updated_at();

alter table production_member_historicals enable row level security;
create policy production_member_historicals_read on production_member_historicals
  for select using (is_allowed_user());
create policy production_member_historicals_admin_write on production_member_historicals
  for all using (is_admin_user()) with check (is_admin_user());

-- Inactive members for former employees + ServiceTitan placeholder, so
-- historical audit rows can reference them by id.
insert into crew_members (name, home_crew_id, is_foreman, display_order, is_active)
select v.name, c.id, false, v.ord, false
from (values
  ('Brian Fleck',             'Clam',  500),
  ('Los Ramirez',             'Clam',  510),
  ('Nate Weekley',            'Other', 520),
  ('Nick Lampman',            'Other', 530),
  ('**Unassigned Tree Crew',  'Other', 540)
) as v(name, crew_name, ord)
join crews c on c.name = v.crew_name
on conflict (name) do nothing;
