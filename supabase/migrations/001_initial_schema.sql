-- ============================================================================
-- Bratt Tree Dashboard - Initial Database Schema
-- ============================================================================
-- This file creates every table the dashboard needs. Run it once in Supabase
-- (Database > SQL Editor > paste this in > Run). After that, edits happen
-- through new migration files numbered 002_, 003_, etc.
--
-- Design notes:
--   - Money is stored as numeric(12,2) so we never lose cents to floats.
--   - Dates are real DATE columns, not strings.
--   - "Soft delete" via is_active flags so historical reports stay intact
--     when a salesperson or crew leaves.
--   - Row Level Security is enabled at the bottom; only authenticated users
--     on the allowlist can read or write.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- People & teams
-- ---------------------------------------------------------------------------

create table salespeople (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  display_order int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table crews (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  -- 'production' = Black, Blue I, ..., Other
  -- 'phc'        = Plant Healthcare (Douglas & Karenna)
  kind        text not null check (kind in ('production', 'phc')),
  display_order int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Allowlist of email addresses permitted to log in
-- ---------------------------------------------------------------------------
create table allowed_emails (
  email       text primary key,
  role        text not null default 'user' check (role in ('user', 'admin')),
  added_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Daily sales entries (one row per salesperson per date)
-- ---------------------------------------------------------------------------
create table sales_entries (
  id            uuid primary key default gen_random_uuid(),
  entry_date    date not null,
  salesperson_id uuid not null references salespeople(id) on delete restrict,
  amount        numeric(12,2) not null default 0,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (entry_date, salesperson_id)
);
create index sales_entries_date_idx on sales_entries(entry_date);

-- ---------------------------------------------------------------------------
-- Daily production / PHC entries (one row per crew per date)
-- ---------------------------------------------------------------------------
create table production_entries (
  id           uuid primary key default gen_random_uuid(),
  entry_date   date not null,
  crew_id      uuid not null references crews(id) on delete restrict,
  jobs         int not null default 0 check (jobs >= 0),
  revenue      numeric(12,2) not null default 0,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (entry_date, crew_id)
);
create index production_entries_date_idx on production_entries(entry_date);

-- ---------------------------------------------------------------------------
-- Monthly budgets
--   - For sales: one row per month with company_goal (and optional per-person)
--   - For each crew: monthly budget revenue (and jobs target if needed)
-- ---------------------------------------------------------------------------
create table sales_monthly_settings (
  year         int not null,
  month        int not null check (month between 1 and 12),
  company_goal numeric(12,2) not null default 0,
  -- per-salesperson goals stored as jsonb keyed by salesperson_id (uuid as text)
  -- example: { "uuid-a": 100000, "uuid-b": 75000 }
  per_person_goals jsonb not null default '{}'::jsonb,
  budgeted_days_override int,  -- null = auto-compute from working_calendar
  primary key (year, month)
);

create table crew_monthly_budgets (
  year         int not null,
  month        int not null check (month between 1 and 12),
  crew_id      uuid not null references crews(id) on delete cascade,
  budget_revenue numeric(12,2) not null default 0,
  primary key (year, month, crew_id)
);

create table production_monthly_settings (
  year         int not null,
  month        int not null check (month between 1 and 12),
  budgeted_days_override int,  -- null = auto-compute from working_calendar
  primary key (year, month)
);

-- ---------------------------------------------------------------------------
-- Yearly target (one row per year, used for YTD-vs-annual on landing page)
-- ---------------------------------------------------------------------------
create table yearly_targets (
  year         int primary key,
  annual_goal  numeric(14,2) not null default 0,
  notes        text
);

-- ---------------------------------------------------------------------------
-- Reconciliation entries
--   One per month per dashboard. Adjusts MTD totals at the column level.
--   Sales: adjustments stored as jsonb keyed by salesperson_id.
--   Production: adjustments stored as jsonb keyed by crew_id (jobs + revenue).
-- ---------------------------------------------------------------------------
create table sales_reconciliations (
  year         int not null,
  month        int not null check (month between 1 and 12),
  -- example: { "uuid-a": -500.00, "uuid-b":  250.00 }
  adjustments  jsonb not null default '{}'::jsonb,
  note         text,
  updated_at   timestamptz not null default now(),
  primary key (year, month)
);

create table production_reconciliations (
  year         int not null,
  month        int not null check (month between 1 and 12),
  -- example: { "uuid-a": { "jobs": -1, "revenue": -250.00 } }
  adjustments  jsonb not null default '{}'::jsonb,
  note         text,
  updated_at   timestamptz not null default now(),
  primary key (year, month)
);

-- ---------------------------------------------------------------------------
-- Working calendar
--   Holidays the company observes. Budgeted-days calculator subtracts these
--   from the Mon-Fri count.
-- ---------------------------------------------------------------------------
create table holidays (
  holiday_date date primary key,
  label        text not null,
  observed     boolean not null default true  -- toggle without deleting
);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_email  text,
  action       text not null,
  table_name   text,
  record_id    text,
  details      jsonb,
  created_at   timestamptz not null default now()
);
create index audit_log_created_idx on audit_log(created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger sales_entries_updated      before update on sales_entries
  for each row execute function set_updated_at();
create trigger production_entries_updated before update on production_entries
  for each row execute function set_updated_at();
create trigger sales_recon_updated        before update on sales_reconciliations
  for each row execute function set_updated_at();
create trigger production_recon_updated   before update on production_reconciliations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--   Only logged-in users whose email is in `allowed_emails` can read/write.
-- ---------------------------------------------------------------------------
alter table salespeople                enable row level security;
alter table crews                      enable row level security;
alter table allowed_emails             enable row level security;
alter table sales_entries              enable row level security;
alter table production_entries         enable row level security;
alter table sales_monthly_settings     enable row level security;
alter table crew_monthly_budgets       enable row level security;
alter table production_monthly_settings enable row level security;
alter table yearly_targets             enable row level security;
alter table sales_reconciliations      enable row level security;
alter table production_reconciliations enable row level security;
alter table holidays                   enable row level security;
alter table audit_log                  enable row level security;

create or replace function is_allowed_user()
returns boolean as $$
  select exists (
    select 1 from allowed_emails
     where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$ language sql stable security definer;

create or replace function is_admin_user()
returns boolean as $$
  select exists (
    select 1 from allowed_emails
     where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and role = 'admin'
  );
$$ language sql stable security definer;

-- Read access for all tables: any allowed user
do $$
declare
  t text;
begin
  foreach t in array array[
    'salespeople','crews','allowed_emails','sales_entries','production_entries',
    'sales_monthly_settings','crew_monthly_budgets','production_monthly_settings',
    'yearly_targets','sales_reconciliations','production_reconciliations',
    'holidays','audit_log'
  ] loop
    execute format('create policy %I_read on %I for select using (is_allowed_user())', t, t);
  end loop;
end $$;

-- Write access:
--   - sales_entries / production_entries: any allowed user (anyone enters daily data)
--   - everything else: admins only
create policy sales_entries_write      on sales_entries
  for all using (is_allowed_user()) with check (is_allowed_user());
create policy production_entries_write on production_entries
  for all using (is_allowed_user()) with check (is_allowed_user());

do $$
declare
  t text;
begin
  foreach t in array array[
    'salespeople','crews','allowed_emails','sales_monthly_settings',
    'crew_monthly_budgets','production_monthly_settings','yearly_targets',
    'sales_reconciliations','production_reconciliations','holidays'
  ] loop
    execute format('create policy %I_admin_write on %I for all using (is_admin_user()) with check (is_admin_user())', t, t);
  end loop;
end $$;
