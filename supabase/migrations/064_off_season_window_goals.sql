-- ============================================================================
-- 064_off_season_window_goals.sql
-- ============================================================================
-- Goals are combined per WINDOW, not per track. Previously each of the four
-- tracks (discounted/dormant × Nov-Dec/Jan-March) had its own goal. In reality
-- the goal is a single combined number per window — the discounted and dormant
-- work counted together — climbing a milestone ladder in $100k steps ($100k,
-- $200k, $300k, …) toward a top goal. This mirrors the "Off-Season + Dormant
-- Work Tracking" area of the original spreadsheet.
--
-- So off_season_targets is rekeyed from (season, work_type, os_window) to just
-- (season, os_window), and gains a milestone_step. Daily entries are unchanged
-- — work is still recorded per track and simply summed into its window here.
--
-- Only the goals/targets table is rebuilt; off_season_entries (your actual
-- numbers) is left completely alone.
-- ============================================================================

drop table if exists off_season_targets cascade;

create table off_season_targets (
  id             uuid primary key default gen_random_uuid(),
  season_id      uuid not null references off_season_seasons(id) on delete cascade,
  os_window      text not null check (os_window in ('nov_dec', 'jan_march')),
  -- Top of the milestone ladder — the combined (discounted + dormant) goal for
  -- this window.
  goal_amount    numeric(12,2) not null default 0,
  -- Milestone spacing, e.g. 100000 = show/track $100k rungs.
  milestone_step numeric(12,2) not null default 100000,
  -- Booking window, used to judge ahead/behind pace.
  window_start   date not null,
  window_end     date not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (season_id, os_window)
);

create trigger off_season_targets_updated
  before update on off_season_targets
  for each row execute function set_updated_at();

alter table off_season_targets enable row level security;

create policy off_season_targets_read on off_season_targets
  for select using (off_season_can_access());
create policy off_season_targets_write on off_season_targets
  for all using (off_season_can_access()) with check (off_season_can_access());

-- ---------------------------------------------------------------------------
-- Reseed one goal per window, per season. $1.8M tops with $100k rungs, matching
-- the spreadsheet's ladder. These are editable on the Goals screen.
-- ---------------------------------------------------------------------------
insert into off_season_targets (season_id, os_window, goal_amount, milestone_step, window_start, window_end)
select s.id, v.os_window, v.goal, 100000, v.ws::date, v.we::date
from (values
  ('nov_dec',   1800000, '2025-08-01', '2025-12-31'),
  ('jan_march', 1800000, '2025-10-01', '2026-03-31')
) as v(os_window, goal, ws, we)
cross join (select id from off_season_seasons where label = '2025 / 2026') s;

insert into off_season_targets (season_id, os_window, goal_amount, milestone_step, window_start, window_end)
select s.id, v.os_window, v.goal, 100000, v.ws::date, v.we::date
from (values
  ('nov_dec',   1800000, '2026-08-01', '2026-12-31'),
  ('jan_march', 1800000, '2026-10-01', '2027-03-31')
) as v(os_window, goal, ws, we)
cross join (select id from off_season_seasons where label = '2026 / 2027') s;
