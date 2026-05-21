-- ============================================================================
-- 019_field_crew_hub.sql
-- ============================================================================
-- Stands up the Field Crew Hub: the new 'field_manager' role plus all the
-- tables that hold the crew skill / training / development-plan tracker
-- migrated from the field_training Jekyll repo.
--
-- Design notes:
--   - Catalog tables (positions, skills, trainings, specialties) drive the
--     UI dropdowns and column layouts. They're seeded here from the legacy
--     _config.yml; admins can add rows later without code changes.
--   - field_crew_employees is the spine. The slug (e.g. 'andy-l') is the
--     stable URL handle; `code` (e.g. 'AL') is the short internal handle
--     that plans reference. Both are unique.
--   - Skills and trainings are stored as separate rows (one per
--     employee + skill_key / training_key) rather than a JSON blob so we
--     can index, aggregate, and edit them cleanly.
--   - "Trainings" are the user-facing name; the legacy YAML key was
--     `certifications:`. We call them trainings everywhere new.
--   - Privacy: this dashboard is already access-gated by allowed_emails,
--     so we use real first names + last initial here (`name` column).
--     The legacy "codes only" privacy model is no longer needed — the data
--     never reaches the public internet.
-- ============================================================================

-- 1. Expand allowed_emails role enum to include 'field_manager' --------------
alter table allowed_emails
  drop constraint if exists allowed_emails_role_check;

alter table allowed_emails
  add constraint allowed_emails_role_check
  check (role in (
    'admin', 'user', 'sales_arborist', 'sales_manager',
    'field_manager', 'field_crew'
  ));

-- ---------------------------------------------------------------------------
-- 2. Helper: who can read / write Field Crew Hub data?
-- ---------------------------------------------------------------------------
-- Centralize the role checks so every policy below stays consistent. These
-- mirror HUB_ACCESS['crew'] + canEditCrew() in src/lib/auth.ts.

create or replace function fc_can_read() returns boolean
  language sql stable security definer
  set search_path = public
as $$
  select exists (
    select 1 from allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('admin', 'user', 'field_manager', 'field_crew')
  );
$$;

create or replace function fc_can_write() returns boolean
  language sql stable security definer
  set search_path = public
as $$
  select exists (
    select 1 from allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('admin', 'field_manager')
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Catalog tables
-- ---------------------------------------------------------------------------
-- Positions: the disciplines used to group the homepage roster.

create table field_crew_positions (
  key            text primary key,
  display_name   text not null,
  display_order  int  not null default 0,
  is_active      boolean not null default true
);

-- Skills: each row is one skill that employees are rated on (L1/L2/L3).

create table field_crew_skills (
  key            text primary key,
  display_name   text not null,
  display_order  int  not null default 0,
  is_active      boolean not null default true
);

-- Which skills show up as columns for a given position on the homepage
-- roster table. (e.g. climbers see Removal / Pruning / Steel Cables.)

create table field_crew_position_skills (
  position_key   text not null references field_crew_positions(key) on delete cascade,
  skill_key      text not null references field_crew_skills(key) on delete cascade,
  display_order  int  not null default 0,
  short_label    text,
  primary key (position_key, skill_key)
);

-- Trainings: formal trainings / certifications that employees can earn.
-- card_required = the training comes with a physical card we track receipt of.

create table field_crew_trainings (
  key             text primary key,
  display_name    text not null,
  display_order   int  not null default 0,
  card_required   boolean not null default false,
  is_hours_based  boolean not null default false,
  is_active       boolean not null default true,
  notes           text
);

-- Equipment-operator specialties (Knuckleboom, Crane, etc.). One person can
-- hold multiple. Used to display pills next to the name on the roster.

create table field_crew_specialties (
  key            text primary key,
  display_name   text not null,
  display_order  int  not null default 0
);

-- ---------------------------------------------------------------------------
-- 4. People
-- ---------------------------------------------------------------------------
-- The spine of the hub. One row per crew member.

create table field_crew_employees (
  slug           text primary key,             -- url handle, e.g. 'andy-l'
  code           text not null unique,         -- short internal handle, e.g. 'AL'
  name           text not null,                -- display name: first + last initial
  position_key   text references field_crew_positions(key),
  leads_crew     boolean not null default false,
  hire_date      date,
  active         boolean not null default true,
  notes          text,
  display_order  int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index field_crew_employees_position_idx on field_crew_employees(position_key);
create index field_crew_employees_active_idx   on field_crew_employees(active);

-- Equipment-operator specialties: M:N.

create table field_crew_employee_specialties (
  employee_slug  text not null references field_crew_employees(slug) on delete cascade,
  specialty_key  text not null references field_crew_specialties(key) on delete cascade,
  primary key (employee_slug, specialty_key)
);

-- Skill levels per employee per skill. Rows only exist for assessed skills;
-- absence of a row = "not yet rated".

create table field_crew_employee_skills (
  employee_slug  text not null references field_crew_employees(slug) on delete cascade,
  skill_key      text not null references field_crew_skills(key) on delete cascade,
  level          int  not null check (level in (1, 2, 3)),
  updated_at     timestamptz not null default now(),
  primary key (employee_slug, skill_key)
);

-- Training records per employee per training. Mostly date-based, except for
-- saw_hours which is a running tally.

create table field_crew_employee_trainings (
  employee_slug  text not null references field_crew_employees(slug) on delete cascade,
  training_key   text not null references field_crew_trainings(key) on delete cascade,
  completed      date,
  card_received  date,
  hours          int,
  last_updated   date,
  status         text,
  notes          text,
  primary key (employee_slug, training_key)
);

-- ---------------------------------------------------------------------------
-- 5. Activity log
-- ---------------------------------------------------------------------------
-- Per-employee timeline that drives the "Recent activity" section on each
-- profile + the homepage daily feed. The trainer (or a field_manager) adds
-- one line whenever something changes.

create table field_crew_activity (
  id             uuid primary key default gen_random_uuid(),
  employee_slug  text not null references field_crew_employees(slug) on delete cascade,
  occurred_on    date not null,
  description    text not null,
  created_at     timestamptz not null default now(),
  created_by     text
);

create index field_crew_activity_date_idx on field_crew_activity(occurred_on desc);
create index field_crew_activity_emp_idx  on field_crew_activity(employee_slug, occurred_on desc);

-- ---------------------------------------------------------------------------
-- 6. Development plans
-- ---------------------------------------------------------------------------

create table field_crew_plans (
  slug           text primary key,             -- e.g. 'andy-l-bucket_pruning-L2'
  employee_slug  text not null references field_crew_employees(slug) on delete cascade,
  skill_key      text not null references field_crew_skills(key),
  current_level  int  not null check (current_level in (1, 2, 3)),
  target_level   int  not null check (target_level in (1, 2, 3)),
  opened         date not null,
  target_date    date,
  closed         date,
  status         text not null default 'active'
    check (status in ('active', 'completed', 'dropped')),
  goal           text,
  plan_body      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index field_crew_plans_employee_idx on field_crew_plans(employee_slug);
create index field_crew_plans_status_idx   on field_crew_plans(status);

-- One row per progress note appended to a plan's `## Updates` section.

create table field_crew_plan_updates (
  id             uuid primary key default gen_random_uuid(),
  plan_slug      text not null references field_crew_plans(slug) on delete cascade,
  occurred_on    date not null,
  description    text not null,
  created_at     timestamptz not null default now(),
  created_by     text
);

create index field_crew_plan_updates_plan_idx on field_crew_plan_updates(plan_slug, occurred_on desc);

-- ---------------------------------------------------------------------------
-- 7. Daily huddles
-- ---------------------------------------------------------------------------
-- Replaces reports/daily-huddle-YYYY-MM-DD.md. One row per huddle date.

create table field_crew_huddles (
  date           date primary key,
  body           text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     text
);

-- ---------------------------------------------------------------------------
-- 8. Row-Level Security
-- ---------------------------------------------------------------------------
-- All hub tables: anyone who can read the hub can SELECT; only writers
-- (admin + field_manager) can INSERT/UPDATE/DELETE.

do $$
declare
  t text;
  tables text[] := array[
    'field_crew_positions',
    'field_crew_skills',
    'field_crew_position_skills',
    'field_crew_trainings',
    'field_crew_specialties',
    'field_crew_employees',
    'field_crew_employee_specialties',
    'field_crew_employee_skills',
    'field_crew_employee_trainings',
    'field_crew_activity',
    'field_crew_plans',
    'field_crew_plan_updates',
    'field_crew_huddles'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (fc_can_read())',
                   t || '_select', t);
    execute format('create policy %I on %I for insert with check (fc_can_write())',
                   t || '_insert', t);
    execute format('create policy %I on %I for update using (fc_can_write())',
                   t || '_update', t);
    execute format('create policy %I on %I for delete using (fc_can_write())',
                   t || '_delete', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Seed catalog data from the legacy _config.yml
-- ---------------------------------------------------------------------------

-- Positions (homepage section order: climber, bucket, nifty, equipment_operator,
-- phc_technician). 'unassigned' lands first via display_order so it shows up
-- in the "Needs Primary Position" call-out.
insert into field_crew_positions (key, display_name, display_order) values
  ('unassigned',         'Unassigned',         0),
  ('climber',            'Climber',            10),
  ('bucket_crew',        'Bucket Crew',        20),
  ('nifty_crew',         'Nifty Crew',         30),
  ('equipment_operator', 'Equipment Operator', 40),
  ('phc_technician',     'PHC Technician',     50);

insert into field_crew_skills (key, display_name, display_order) values
  ('bucket_removal',     'Bucket Removal',      10),
  ('bucket_pruning',     'Bucket Pruning',      20),
  ('nifty_removal',      'Nifty Removal',       30),
  ('nifty_pruning',      'Nifty Pruning',       40),
  ('climber_removal',    'Climber Removal',     50),
  ('climber_pruning',    'Climber Pruning',     60),
  ('crane_proficiency',  'Crane Proficiency',   70),
  ('steel_cables',       'Steel Cables',        80),
  ('forwarding_machine', 'Forwarding Machine',  90),
  ('knuckleboom',        'Knuckleboom',        100),
  ('clam',               'Clam',               110);

insert into field_crew_trainings
  (key, display_name, display_order, card_required, is_hours_based) values
  ('cdl',                           'CDL',                            10, true,  false),
  ('medical_examiners_certificate', 'Medical Examiner''s Certificate', 20, true,  false),
  ('first_aid_cpr',                 'First Aid / CPR',                30, true,  false),
  ('saw_hours',                     'Saw Hours',                      40, false, true),
  ('forwarding_machine',            'Forwarding Machine',             50, false, false),
  ('aerial_rescue',                 'Aerial Rescue',                  60, false, false),
  ('ground_ops_1',                  'Ground Ops 1',                   70, false, false),
  ('ground_ops_2',                  'Ground Ops 2',                   80, false, false),
  ('ground_ops_3',                  'Ground Ops 3',                   90, false, false),
  ('ground_ops_4',                  'Ground Ops 4',                  100, false, false),
  ('crane_use_level_2',             'Crane Use Level 2',             110, false, false),
  ('crane_use_level_3',             'Crane Use Level 3',             120, false, false);

insert into field_crew_specialties (key, display_name, display_order) values
  ('stump',       'Stump',      10),
  ('clam',        'Clam',       20),
  ('knuckleboom', 'KB',         30),
  ('crane',       'Crane',      40);

-- position → skill column mapping (homepage roster grid).
insert into field_crew_position_skills (position_key, skill_key, display_order, short_label) values
  ('climber',            'climber_removal',     10, 'Removal'),
  ('climber',            'climber_pruning',     20, 'Pruning'),
  ('climber',            'steel_cables',        30, 'Steel Cables'),
  ('bucket_crew',        'bucket_removal',      10, 'Removal'),
  ('bucket_crew',        'bucket_pruning',      20, 'Pruning'),
  ('bucket_crew',        'steel_cables',        30, 'Steel Cables'),
  ('nifty_crew',         'nifty_removal',       10, 'Removal'),
  ('nifty_crew',         'nifty_pruning',       20, 'Pruning'),
  ('nifty_crew',         'steel_cables',        30, 'Steel Cables'),
  ('equipment_operator', 'crane_proficiency',   10, 'Crane'),
  ('equipment_operator', 'forwarding_machine',  20, 'Forwarding'),
  ('equipment_operator', 'knuckleboom',         30, 'Knuckleboom'),
  ('equipment_operator', 'clam',                40, 'Clam');
