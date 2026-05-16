-- ============================================================================
-- Bratt Tree Dashboard - Crew members + per-member daily entries
-- ============================================================================
-- 1. New `crew_members` table: one row per individual production team member,
--    each with a "home" crew (their typical assignment) and a foreman flag.
-- 2. New `production_member_entries` table: per-member daily (jobs, revenue),
--    with a per-day `crew_id` so members can sub in for another crew.
-- 3. Deactivates the Crane Operators crew (they assist other teams and don't
--    carry revenue of their own).
-- 4. Seeds the visible roster from Molly's team breakdown screenshot.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- crew_members
-- ---------------------------------------------------------------------------
create table crew_members (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  home_crew_id  uuid references crews(id),
  is_foreman    boolean not null default false,
  display_order int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index crew_members_home_crew_idx on crew_members(home_crew_id);

alter table crew_members enable row level security;
create policy crew_members_read on crew_members
  for select using (is_allowed_user());
create policy crew_members_admin_write on crew_members
  for all using (is_admin_user()) with check (is_admin_user());

-- ---------------------------------------------------------------------------
-- production_member_entries
-- ---------------------------------------------------------------------------
create table production_member_entries (
  id             uuid primary key default gen_random_uuid(),
  entry_date     date not null,
  crew_member_id uuid not null references crew_members(id) on delete restrict,
  -- Which crew this member ran with that day. Usually = their home_crew_id,
  -- but can be overridden for the day (subbing in for another crew).
  crew_id        uuid not null references crews(id) on delete restrict,
  jobs           int not null default 0 check (jobs >= 0),
  revenue        numeric(12,2) not null default 0,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (entry_date, crew_member_id)
);
create index production_member_entries_date_idx on production_member_entries(entry_date);
create index production_member_entries_crew_idx on production_member_entries(crew_id);

create trigger production_member_entries_updated before update on production_member_entries
  for each row execute function set_updated_at();

alter table production_member_entries enable row level security;
create policy production_member_entries_write on production_member_entries
  for all using (is_allowed_user()) with check (is_allowed_user());

-- ---------------------------------------------------------------------------
-- Deactivate Crane Operators (they assist other crews, don't carry revenue)
-- ---------------------------------------------------------------------------
update crews set is_active = false where name = 'Crane Operators';

-- ---------------------------------------------------------------------------
-- Seed the visible roster
-- (Other crews' members can be added via the admin panel.)
-- ---------------------------------------------------------------------------
insert into crew_members (name, home_crew_id, is_foreman, display_order) values
  ('Taylor Mueller',     (select id from crews where name = 'Black'),             true,  10),
  ('Shay Spritzer',      (select id from crews where name = 'Black'),             false, 20),
  ('Jaidyn Atchley',     (select id from crews where name = 'Black'),             false, 30),
  ('Nathan Runtsch',     (select id from crews where name = 'Blue I'),            true,  40),
  ('Sage Sand',          (select id from crews where name = 'Blue I'),            false, 50),
  ('Bryan Christiansen', (select id from crews where name = 'Blue I'),            false, 60),
  ('John Carpenter',     (select id from crews where name = 'Stump Grinding'),    true,  70),
  ('Douglas Vines',      (select id from crews where name = 'Douglas & Karenna'), true,  80),
  ('Karenna Petersen',   (select id from crews where name = 'Douglas & Karenna'), false, 90)
on conflict (name) do nothing;
