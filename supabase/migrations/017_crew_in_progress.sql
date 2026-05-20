-- ============================================================================
-- 017_crew_in_progress.sql
-- ============================================================================
-- Tracks long-running ("in progress") jobs that haven't been booked as
-- revenue yet. The arborist business has multi-week jobs where revenue
-- doesn't post until the job closes, so MTD numbers look artificially low.
-- Leadership wants this folded into the production pace view.
--
-- Data model: ONE row per crew, holding the current dollar value of work
-- in progress. Not tied to a year/month — it's a live snapshot that the
-- crew adjusts as work progresses. When the job actually closes, it gets
-- booked as a normal production_entries row and the in-progress amount
-- comes back down.
-- ============================================================================

create table if not exists crew_in_progress (
  crew_id     uuid primary key references crews(id) on delete cascade,
  amount      numeric(12,2) not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Reuse the shared updated_at trigger function defined in 001.
drop trigger if exists crew_in_progress_updated on crew_in_progress;
create trigger crew_in_progress_updated before update on crew_in_progress
  for each row execute function set_updated_at();

-- Row Level Security: any allowed user can read OR write (matches
-- production_entries — the same people who enter daily jobs maintain WIP).
alter table crew_in_progress enable row level security;

drop policy if exists crew_in_progress_read on crew_in_progress;
drop policy if exists crew_in_progress_write on crew_in_progress;

create policy crew_in_progress_read on crew_in_progress
  for select using (is_allowed_user());

create policy crew_in_progress_write on crew_in_progress
  for all using (is_allowed_user()) with check (is_allowed_user());
