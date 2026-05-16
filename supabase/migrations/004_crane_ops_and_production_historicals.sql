-- ============================================================================
-- Bratt Tree Dashboard - Production historicals + Crane Operators crew
-- ============================================================================
-- 1. Adds the Crane Operators production crew (was missing from the seed).
-- 2. Adds production_monthly_historicals - the production-side equivalent of
--    sales_monthly_historicals. One rolled-up (jobs, revenue) pair per
--    (year, month, crew_id) for closed months we don't have day-by-day for.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- New crew
-- ---------------------------------------------------------------------------
insert into crews (name, kind, display_order) values
  ('Crane Operators', 'production', 95)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Production monthly historicals
-- ---------------------------------------------------------------------------
create table production_monthly_historicals (
  year           int not null,
  month          int not null check (month between 1 and 12),
  crew_id        uuid not null references crews(id) on delete restrict,
  jobs           int not null default 0 check (jobs >= 0),
  revenue        numeric(12,2) not null default 0,
  source_note    text,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (year, month, crew_id)
);
create index production_monthly_historicals_year_idx on production_monthly_historicals(year);

create trigger production_monthly_historicals_updated before update on production_monthly_historicals
  for each row execute function set_updated_at();

alter table production_monthly_historicals enable row level security;

create policy production_monthly_historicals_read on production_monthly_historicals
  for select using (is_allowed_user());

create policy production_monthly_historicals_admin_write on production_monthly_historicals
  for all using (is_admin_user()) with check (is_admin_user());
