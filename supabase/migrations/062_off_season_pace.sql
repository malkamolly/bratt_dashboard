-- ============================================================================
-- 062_off_season_pace.sql
-- ============================================================================
-- Stands up the Off-Season Work (OSW) pace tracker. Bratt Tree pushes tree
-- work into the off-season two ways, and this tool tracks the booking pace of
-- both against a dollar goal:
--
--   * "discounted"  — the fall discounted push (roughly the Nov/Dec window).
--   * "dormant"     — dormant-season work that MUST happen in winter, e.g.
--                     oaks, to limit disease spread (roughly the Jan/March window).
--
-- Replaces last year's giant manual spreadsheet. Each day the office records,
-- per work type, the running total of off-season revenue booked so far and the
-- discount dollars given. The dashboard compares booked-to-date against a
-- straight-line goal ramp (goal * elapsed-days / total-days) so you can see at
-- a glance whether you're ahead of or behind pace, and what the push is costing
-- in discounts.
--
-- Three tables:
--   off_season_seasons  — one row per campaign year (e.g. "2025 / 2026").
--   off_season_targets  — two rows per season (discounted, dormant): the goal
--                         amount and the booking window (start/end dates).
--   off_season_entries  — daily cumulative snapshot per (season, work_type, date).
--
-- Access: this is office/dispatch work, so read + write are open to the same
-- roles that use the Pace hub and PHC scheduling — admin, office (user), and
-- the sales manager. These checks mirror canUseOffSeason() in src/lib/auth.ts;
-- RLS here is the backstop if an app-level check is ever missed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Who can read / write the off-season tracker?
-- ---------------------------------------------------------------------------
create or replace function off_season_can_access() returns boolean
  language sql stable security definer
  set search_path = public
as $$
  select exists (
    select 1 from allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('admin', 'user', 'sales_manager')
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Seasons (campaign years)
-- ---------------------------------------------------------------------------
create table off_season_seasons (
  id         uuid primary key default gen_random_uuid(),
  -- Human label, e.g. "2025 / 2026".
  label      text not null,
  -- Exactly one season is the "current" one shown on the dashboard by default.
  -- Enforced by a partial unique index below.
  is_current boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one current season at a time.
create unique index off_season_seasons_one_current
  on off_season_seasons (is_current) where is_current;

create trigger off_season_seasons_updated
  before update on off_season_seasons
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Targets: the goal + booking window for each work type in a season
-- ---------------------------------------------------------------------------
create table off_season_targets (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references off_season_seasons(id) on delete cascade,
  -- 'discounted' (fall push) or 'dormant' (winter dormant-season work).
  work_type    text not null check (work_type in ('discounted', 'dormant')),
  -- Dollar goal for booked off-season revenue in this window.
  goal_amount  numeric(12,2) not null default 0,
  -- Booking window. The dashboard ramps the goal linearly from window_start
  -- (0) to window_end (goal_amount) to judge "ahead/behind pace".
  window_start date not null,
  window_end   date not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (season_id, work_type)
);

create trigger off_season_targets_updated
  before update on off_season_targets
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Daily entries: cumulative booked revenue + discounts, per work type
-- ---------------------------------------------------------------------------
create table off_season_entries (
  id                uuid primary key default gen_random_uuid(),
  season_id         uuid not null references off_season_seasons(id) on delete cascade,
  work_type         text not null check (work_type in ('discounted', 'dormant')),
  entry_date        date not null,
  -- Running total of off-season revenue booked for this work type as of this
  -- date (a cumulative snapshot, the way the spreadsheet tracked it).
  scheduled_revenue numeric(12,2) not null default 0,
  -- Running total of discount dollars given on that work.
  discount_given    numeric(12,2) not null default 0,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (season_id, work_type, entry_date)
);

create index off_season_entries_lookup_idx
  on off_season_entries (season_id, work_type, entry_date);

create trigger off_season_entries_updated
  before update on off_season_entries
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------
alter table off_season_seasons enable row level security;
alter table off_season_targets enable row level security;
alter table off_season_entries enable row level security;

create policy off_season_seasons_read  on off_season_seasons for select using (off_season_can_access());
create policy off_season_seasons_write on off_season_seasons for all    using (off_season_can_access()) with check (off_season_can_access());

create policy off_season_targets_read  on off_season_targets for select using (off_season_can_access());
create policy off_season_targets_write on off_season_targets for all    using (off_season_can_access()) with check (off_season_can_access());

create policy off_season_entries_read  on off_season_entries for select using (off_season_can_access());
create policy off_season_entries_write on off_season_entries for all    using (off_season_can_access()) with check (off_season_can_access());

-- ---------------------------------------------------------------------------
-- 6. Seed data
-- ---------------------------------------------------------------------------
-- Last season ("2025 / 2026") is loaded as a completed reference so the tool
-- works on day one and you can compare this year against last year. The daily
-- numbers are the off-season scheduled-revenue columns from the spreadsheet.
-- The goals here are editable placeholders ($850k discounted, $1.0M dormant)
-- chosen to sit a little above what last season actually booked, since the old
-- sheet's headline goals ($1.8M) were TOTAL-revenue targets, not off-season-
-- only. Adjust both on the Goals screen. The current season ("2026 / 2027")
-- starts empty, ready for daily entry.

insert into off_season_seasons (label, is_current) values
  ('2025 / 2026', false),
  ('2026 / 2027', true);

-- Targets for last season.
insert into off_season_targets (season_id, work_type, goal_amount, window_start, window_end)
select s.id, t.work_type, t.goal_amount, t.window_start::date, t.window_end::date
from (values
  ('discounted', 850000,  '2025-08-01', '2025-12-31'),
  ('dormant',    1000000, '2025-12-01', '2026-03-31')
) as t(work_type, goal_amount, window_start, window_end)
cross join (select id from off_season_seasons where label = '2025 / 2026') s;

-- Targets for the current season (same goals; windows shifted a year forward).
insert into off_season_targets (season_id, work_type, goal_amount, window_start, window_end)
select s.id, t.work_type, t.goal_amount, t.window_start::date, t.window_end::date
from (values
  ('discounted', 850000,  '2026-08-01', '2026-12-31'),
  ('dormant',    1000000, '2026-12-01', '2027-03-31')
) as t(work_type, goal_amount, window_start, window_end)
cross join (select id from off_season_seasons where label = '2026 / 2027') s;

-- Last season's daily snapshots (imported from the 2025/2026 spreadsheet).
insert into off_season_entries (season_id, work_type, entry_date, scheduled_revenue, discount_given)
select s.id, v.work_type, v.entry_date::date, v.scheduled_revenue, v.discount_given
from (values
    ('2025-08-28','discounted',281222.0,26631.0),
    ('2025-08-29','discounted',289610.68,28221.0),
    ('2025-08-30','discounted',305626.37,29058.0),
    ('2025-08-31','discounted',313533.37,29225.0),
    ('2025-09-01','discounted',313533.37,30224.59),
    ('2025-09-02','discounted',335503.0,32692.0),
    ('2025-09-03','discounted',348616.0,33038.0),
    ('2025-09-04','discounted',358532.6,34619.92),
    ('2025-09-05','discounted',374365.43,36163.55),
    ('2025-09-06','discounted',403198.92,37724.13),
    ('2025-09-07','discounted',411392.02,38315.65),
    ('2025-09-08','discounted',411392.02,39157.85),
    ('2025-09-09','discounted',401734.48,39476.48),
    ('2025-09-10','discounted',408139.08,42338.09),
    ('2025-09-11','discounted',433036.47,47177.89),
    ('2025-09-12','discounted',465581.07,47555.34),
    ('2025-09-13','discounted',465581.07,47555.34),
    ('2025-09-14','discounted',487893.87,47912.34),
    ('2025-09-15','discounted',487245.87,49279.77),
    ('2025-09-16','discounted',508496.45,49895.77),
    ('2025-09-17','discounted',510102.95,51607.96),
    ('2025-09-18','discounted',527467.0,52096.66),
    ('2025-09-21','discounted',564687.78,53683.85),
    ('2025-09-22','discounted',565574.95,55305.38),
    ('2025-09-23','discounted',593510.63,56205.38),
    ('2025-09-24','discounted',600692.63,56295.6),
    ('2025-09-25','discounted',611293.13,56740.52),
    ('2025-09-28','discounted',613333.13,56752.61),
    ('2025-09-29','discounted',609480.0,57028.61),
    ('2025-09-30','discounted',610140.91,57597.61),
    ('2025-10-01','discounted',622700.91,57941.11),
    ('2025-10-07','discounted',621497.57,59273.15),
    ('2025-10-08','discounted',621497.57,59273.15),
    ('2025-10-09','discounted',634028.04,60618.18),
    ('2025-10-12','discounted',641858.39,60576.11),
    ('2025-10-13','discounted',649544.71,62091.29),
    ('2025-10-14','discounted',649544.71,61944.2),
    ('2025-10-15','discounted',651250.17,62093.4),
    ('2025-10-16','discounted',659562.79,62093.4),
    ('2025-10-20','discounted',664058.54,62306.93),
    ('2025-10-21','discounted',663898.54,62306.93),
    ('2025-10-22','discounted',676380.69,63351.43),
    ('2025-10-23','discounted',675726.86,63325.63),
    ('2025-10-26','discounted',673174.49,63532.29),
    ('2025-10-27','discounted',677585.49,63532.29),
    ('2025-10-29','discounted',678485.49,63532.29),
    ('2025-10-30','discounted',673500.49,63532.29),
    ('2025-11-02','discounted',670391.09,63981.99),
    ('2025-11-03','discounted',670391.09,63981.99),
    ('2025-11-04','discounted',670447.79,63797.99),
    ('2025-11-05','discounted',653082.89,64158.79),
    ('2025-11-06','discounted',668652.59,64158.79),
    ('2025-11-09','discounted',668326.59,64663.79),
    ('2025-11-10','discounted',652655.5,64663.79),
    ('2025-11-11','discounted',652555.5,64663.79),
    ('2025-11-13','discounted',651981.5,65218.07),
    ('2025-11-16','discounted',660995.48,65218.07),
    ('2025-11-17','discounted',660854.61,65646.97),
    ('2025-11-19','discounted',660156.29,65641.97),
    ('2025-11-23','discounted',654129.22,65641.97),
    ('2025-11-24','discounted',654129.22,65641.97),
    ('2025-12-01','discounted',635247.42,65546.97),
    ('2025-12-05','discounted',638029.46,65850.17),
    ('2025-12-08','discounted',639582.26,65850.17),
    ('2025-12-09','discounted',639582.26,65850.17),
    ('2025-12-10','discounted',646276.23,65850.17),
    ('2025-12-16','discounted',645572.83,65943.57),
    ('2025-12-18','discounted',645572.83,65943.57),
    ('2025-12-19','discounted',639571.23,65641.57),
    ('2025-12-22','discounted',639571.23,65641.57),
    ('2025-12-23','discounted',639646.23,65641.57),
    ('2025-12-24','discounted',639646.23,65641.57),
    ('2025-12-29','discounted',639646.23,65641.57),
    ('2025-12-30','discounted',639646.23,65641.57),
    ('2025-12-31','discounted',638046.23,65641.57),
    ('2026-01-05','discounted',645896.73,66362.07),
    ('2026-01-06','discounted',646035.48,66362.07),
    ('2026-01-07','discounted',646035.48,66362.07),
    ('2026-01-08','discounted',646035.48,66362.07),
    ('2026-01-09','discounted',646095.48,66362.07),
    ('2026-01-12','discounted',646095.48,66362.07),
    ('2026-01-13','discounted',646095.48,66362.07),
    ('2026-01-14','discounted',646095.48,66362.07),
    ('2026-01-15','discounted',646095.48,66362.07),
    ('2026-01-16','discounted',646095.48,66362.07),
    ('2026-01-19','discounted',646095.48,66362.07),
    ('2026-01-20','discounted',646095.48,66362.07),
    ('2026-01-21','discounted',646095.48,66362.07),
    ('2026-01-22','discounted',640212.48,66362.07),
    ('2026-01-23','discounted',640212.48,66362.07),
    ('2026-01-26','discounted',640212.48,66451.39),
    ('2026-01-27','discounted',640212.48,66451.39),
    ('2026-01-28','discounted',640212.48,66451.39),
    ('2026-01-29','discounted',640212.48,66451.39),
    ('2026-01-30','discounted',639912.48,66451.39),
    ('2026-02-02','discounted',639912.48,66451.39),
    ('2026-02-04','discounted',639912.48,66451.39),
    ('2026-02-05','discounted',639912.48,66451.39),
    ('2026-02-06','discounted',639912.48,66451.39),
    ('2026-02-09','discounted',637811.48,66451.39),
    ('2026-02-10','discounted',637811.48,66451.39),
    ('2026-02-11','discounted',637811.48,66451.39),
    ('2026-02-12','discounted',637811.48,66451.39),
    ('2026-02-13','discounted',637811.48,66451.39),
    ('2026-02-16','discounted',637811.48,66451.39),
    ('2026-02-17','discounted',637811.48,66451.39),
    ('2026-02-18','discounted',635689.28,66451.39),
    ('2026-02-19','discounted',635689.28,66451.39),
    ('2026-02-20','discounted',635689.28,66451.39),
    ('2026-02-23','discounted',635689.28,66451.39),
    ('2026-02-24','discounted',635689.28,66566.39),
    ('2026-02-25','discounted',635689.28,66566.39),
    ('2026-02-26','discounted',635689.28,66566.39),
    ('2026-02-27','discounted',635689.28,66566.39),
    ('2026-03-02','discounted',635689.28,66566.39),
    ('2026-03-03','discounted',635689.28,66566.39),
    ('2026-03-04','discounted',635689.28,66566.39),
    ('2026-03-05','discounted',635689.28,66566.39),
    ('2026-03-06','discounted',635689.28,66566.39),
    ('2026-03-09','discounted',635689.28,66566.39),
    ('2026-03-10','discounted',635689.28,66566.39),
    ('2026-03-11','discounted',635689.28,66566.39),
    ('2026-03-12','discounted',635689.28,66566.39),
    ('2026-03-13','discounted',635689.28,66566.39),
    ('2026-03-16','discounted',635689.28,66566.39),
    ('2026-03-17','discounted',635689.28,66566.39),
    ('2026-03-18','discounted',635689.28,66566.39),
    ('2026-03-19','discounted',635689.28,66566.39),
    ('2026-03-20','discounted',635689.28,66566.39),
    ('2026-03-23','discounted',635689.28,66566.39),
    ('2026-03-24','discounted',635689.28,66566.39),
    ('2026-03-25','discounted',635689.28,66566.39),
    ('2026-03-26','discounted',635689.28,66566.39),
    ('2026-03-27','discounted',635689.28,66566.39),
    ('2026-03-30','discounted',635689.28,66566.39),
    ('2026-03-31','discounted',635689.28,66566.39),
    ('2025-09-09','dormant',13365.2,673.9),
    ('2025-09-10','dormant',13365.2,673.9),
    ('2025-09-11','dormant',13365.2,995.9),
    ('2025-09-12','dormant',15912.2,2273.74),
    ('2025-09-13','dormant',15912.2,2840.96),
    ('2025-09-14','dormant',37040.04,2840.96),
    ('2025-09-15','dormant',37040.04,5998.56),
    ('2025-09-16','dormant',47551.26,6853.56),
    ('2025-09-17','dormant',54384.26,7959.81),
    ('2025-09-18','dormant',54102.26,9402.11),
    ('2025-09-21','dormant',73512.31,10283.56),
    ('2025-09-22','dormant',73512.31,11812.05),
    ('2025-09-23','dormant',89397.6,13463.6),
    ('2025-09-24','dormant',91079.6,14433.83),
    ('2025-09-25','dormant',107323.33,15488.72),
    ('2025-09-28','dormant',118789.47,18371.27),
    ('2025-09-29','dormant',124155.93,19412.4),
    ('2025-09-30','dormant',152247.2,20577.71),
    ('2025-10-01','dormant',170769.62,21218.5),
    ('2025-10-07','dormant',199672.06,24611.2),
    ('2025-10-08','dormant',210059.45,25273.86),
    ('2025-10-09','dormant',222600.48,28951.31),
    ('2025-10-12','dormant',232830.39,34550.94),
    ('2025-10-13','dormant',232830.39,34639.98),
    ('2025-10-14','dormant',283124.11,37387.97),
    ('2025-10-15','dormant',306524.16,39239.43),
    ('2025-10-16','dormant',338068.79,40515.49),
    ('2025-10-20','dormant',377633.9,44136.45),
    ('2025-10-21','dormant',382424.9,45859.52),
    ('2025-10-22','dormant',423795.97,49040.92),
    ('2025-10-23','dormant',427041.27,50314.82),
    ('2025-10-26','dormant',457652.86,54532.53),
    ('2025-10-27','dormant',454742.86,55303.1),
    ('2025-10-29','dormant',489327.26,58011.16),
    ('2025-10-30','dormant',503991.28,58714.16),
    ('2025-11-02','dormant',542548.66,64629.46),
    ('2025-11-03','dormant',542548.66,66080.95),
    ('2025-11-04','dormant',587119.24,66886.35),
    ('2025-11-05','dormant',598889.81,67024.35),
    ('2025-11-06','dormant',609679.6,67545.85),
    ('2025-11-09','dormant',618914.67,68785.28),
    ('2025-11-10','dormant',635380.14,69313.31),
    ('2025-11-11','dormant',642922.14,70189.31),
    ('2025-11-13','dormant',654276.31,71754.68),
    ('2025-11-16','dormant',656098.38,72163.59),
    ('2025-11-17','dormant',669249.73,72740.29),
    ('2025-11-19','dormant',681329.75,74508.77),
    ('2025-11-23','dormant',696887.46,75031.67),
    ('2025-11-24','dormant',695116.26,75031.67),
    ('2025-12-01','dormant',726221.53,78614.21),
    ('2025-12-05','dormant',742565.42,79562.21),
    ('2025-12-08','dormant',744428.42,80207.01),
    ('2025-12-09','dormant',744428.42,80662.86),
    ('2025-12-10','dormant',741353.45,80662.86),
    ('2025-12-16','dormant',763801.43,82624.73),
    ('2025-12-18','dormant',765628.43,82624.73),
    ('2025-12-19','dormant',765628.43,82778.73),
    ('2025-12-22','dormant',768311.93,83035.23),
    ('2025-12-23','dormant',773608.67,83463.09),
    ('2025-12-24','dormant',773608.67,83463.09),
    ('2025-12-29','dormant',767069.27,83463.09),
    ('2025-12-30','dormant',771430.96,83947.72),
    ('2025-12-31','dormant',771430.96,83947.72),
    ('2026-01-05','dormant',771430.96,83947.72),
    ('2026-01-06','dormant',771430.96,84940.28),
    ('2026-01-07','dormant',767152.63,85081.86),
    ('2026-01-08','dormant',770550.81,85132.76),
    ('2026-01-09','dormant',761489.05,85132.76),
    ('2026-01-12','dormant',761489.05,85700.78),
    ('2026-01-13','dormant',761459.05,85700.78),
    ('2026-01-14','dormant',761459.05,86628.78),
    ('2026-01-15','dormant',761510.55,86628.78),
    ('2026-01-16','dormant',761510.55,86628.78),
    ('2026-01-19','dormant',761510.55,86783.98),
    ('2026-01-20','dormant',761510.55,86783.98),
    ('2026-01-21','dormant',765458.55,86867.98),
    ('2026-01-22','dormant',765458.55,87065.06),
    ('2026-01-23','dormant',765458.55,87065.06),
    ('2026-01-26','dormant',765458.55,87065.06),
    ('2026-01-27','dormant',765458.55,87065.06),
    ('2026-01-28','dormant',765458.55,87065.06),
    ('2026-01-29','dormant',766220.55,87065.06),
    ('2026-01-30','dormant',766220.55,87065.06),
    ('2026-02-02','dormant',765845.55,87065.06),
    ('2026-02-04','dormant',761533.43,87065.06),
    ('2026-02-05','dormant',767403.83,87988.96),
    ('2026-02-06','dormant',766503.83,87988.96),
    ('2026-02-09','dormant',766531.83,87988.96),
    ('2026-02-10','dormant',766531.83,88300.96),
    ('2026-02-11','dormant',767354.83,88504.46),
    ('2026-02-12','dormant',767354.83,88767.46),
    ('2026-02-13','dormant',767722.83,89029.46),
    ('2026-02-16','dormant',767722.83,90443.49),
    ('2026-02-17','dormant',768015.83,90517.89),
    ('2026-02-18','dormant',746681.93,90517.89),
    ('2026-02-19','dormant',746796.93,90711.39),
    ('2026-02-20','dormant',746796.93,90711.39),
    ('2026-02-23','dormant',746796.93,91045.39),
    ('2026-02-24','dormant',742313.93,90711.39),
    ('2026-02-25','dormant',738573.2,90711.39),
    ('2026-02-26','dormant',738773.2,90711.39),
    ('2026-02-27','dormant',738773.2,90711.39),
    ('2026-03-02','dormant',738773.2,90711.39),
    ('2026-03-03','dormant',738773.2,90711.39),
    ('2026-03-04','dormant',739073.2,90756.39),
    ('2026-03-05','dormant',739073.2,90756.39),
    ('2026-03-06','dormant',739073.2,90756.39),
    ('2026-03-09','dormant',738778.2,90986.39),
    ('2026-03-10','dormant',738778.2,90986.39),
    ('2026-03-11','dormant',739212.18,90896.39),
    ('2026-03-12','dormant',739212.18,90896.39),
    ('2026-03-13','dormant',738612.18,90896.39),
    ('2026-03-16','dormant',738565.18,90896.39),
    ('2026-03-17','dormant',738913.18,90896.39),
    ('2026-03-18','dormant',738913.18,90896.39),
    ('2026-03-19','dormant',738913.18,90896.39),
    ('2026-03-20','dormant',738913.18,90896.39),
    ('2026-03-23','dormant',738973.18,91213.9),
    ('2026-03-24','dormant',738973.18,91213.9),
    ('2026-03-25','dormant',738973.18,91522.93),
    ('2026-03-26','dormant',738973.18,91522.93),
    ('2026-03-27','dormant',738973.18,91522.93),
    ('2026-03-30','dormant',735778.68,91522.93),
    ('2026-03-31','dormant',736412.68,91522.93)
) as v(entry_date, work_type, scheduled_revenue, discount_given)
cross join (select id from off_season_seasons where label = '2025 / 2026') s;
