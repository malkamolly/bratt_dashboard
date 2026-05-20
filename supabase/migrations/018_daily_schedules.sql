-- ============================================================================
-- 018_daily_schedules.sql
-- ============================================================================
-- Stores the scheduler's "tomorrow's schedule" log. One row per calendar
-- date that the scheduler builds out — the list of jobs is kept as a JSONB
-- array on that row. This is a small internal tool (~10 users, ~30 jobs/
-- day at most), so denormalizing into a single row per day keeps reads
-- and writes to one round-trip and avoids needing a parent/child join.
-- If we later need analytics on individual jobs (e.g. compare scheduled
-- vs actual against production_entries), we can either query the JSONB
-- directly or migrate to a normalized table.
--
-- Each element of `jobs` looks like:
--   {
--     "id":       <uuid string, client-generated>,
--     "category": "field-crew" | "phc" | "stump" | "clam-hauling",
--     "label":    <string, may be empty>,
--     "revenue":  <number, full contract value in dollars>,
--     "days":     <integer >= 1, total days the job runs>
--   }
-- ============================================================================

create table if not exists daily_schedules (
  schedule_date date primary key,
  jobs          jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now(),
  updated_by    text
);

-- Reuse the shared updated_at trigger function defined in 001.
drop trigger if exists daily_schedules_updated on daily_schedules;
create trigger daily_schedules_updated before update on daily_schedules
  for each row execute function set_updated_at();

-- Row Level Security: any allowed user can read or write. The /schedule
-- page itself is already gated to the 'pace' hub at the app layer.
alter table daily_schedules enable row level security;

drop policy if exists daily_schedules_read on daily_schedules;
drop policy if exists daily_schedules_write on daily_schedules;

create policy daily_schedules_read on daily_schedules
  for select using (is_allowed_user());

create policy daily_schedules_write on daily_schedules
  for all using (is_allowed_user()) with check (is_allowed_user());
