-- ============================================================================
-- 062_off_season_pace.sql
-- ============================================================================
-- Off-Season Work (OSW) pace tracker. Bratt Tree pushes tree work into the
-- off-season two ways, and each is tracked across two delivery windows -- so
-- there are FOUR tracks in a 2x2 grid:
--
--                    | Nov-Dec              | Jan-March
--   -----------------+----------------------+---------------------
--   Discounted OSW   | discounted, nov_dec  | discounted, jan_march
--   Dormant Season   | dormant, nov_dec     | dormant, jan_march
--
--   * "discounted" -- the discounted push (the sheet's "Off-Season Scheduled
--                     Revenue, discounted revenue only" columns M/N).
--   * "dormant"    -- dormant-season work that must be done cold, like oaks, to
--                     limit disease spread (the sheet's "OSW Tagged Revenue"
--                     columns K/L).
--
-- Each day the office records, per track, the running total of off-season
-- revenue on the books and the discount dollars given. The dashboard shows
-- each track vs a straight-line goal ramp (ahead/behind pace) plus season
-- totals across all four tracks.
--
-- Access: office/dispatch, so read + write are open to admin, office (user),
-- and the sales manager -- mirrors canUseOffSeason() in src/lib/auth.ts.
--
-- This migration is idempotent: it drops and recreates its own tables, so it
-- is safe to run again if an earlier version was already applied.
-- ============================================================================

drop table if exists off_season_entries cascade;
drop table if exists off_season_targets cascade;
drop table if exists off_season_seasons cascade;

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
  label      text not null,
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
-- 3. Targets: goal + booking window for each of the four tracks in a season.
--    os_window is 'nov_dec' or 'jan_march' (avoid the reserved word "window").
-- ---------------------------------------------------------------------------
create table off_season_targets (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references off_season_seasons(id) on delete cascade,
  work_type    text not null check (work_type in ('discounted', 'dormant')),
  os_window    text not null check (os_window in ('nov_dec', 'jan_march')),
  goal_amount  numeric(12,2) not null default 0,
  window_start date not null,
  window_end   date not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (season_id, work_type, os_window)
);

create trigger off_season_targets_updated
  before update on off_season_targets
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Daily entries: cumulative booked revenue + discounts, per track.
-- ---------------------------------------------------------------------------
create table off_season_entries (
  id                uuid primary key default gen_random_uuid(),
  season_id         uuid not null references off_season_seasons(id) on delete cascade,
  work_type         text not null check (work_type in ('discounted', 'dormant')),
  os_window         text not null check (os_window in ('nov_dec', 'jan_march')),
  entry_date        date not null,
  scheduled_revenue numeric(12,2) not null default 0,
  discount_given    numeric(12,2) not null default 0,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (season_id, work_type, os_window, entry_date)
);

create index off_season_entries_lookup_idx
  on off_season_entries (season_id, work_type, os_window, entry_date);

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
-- Last season ("2025 / 2026") is loaded from the spreadsheet as a completed
-- reference. Goals are editable placeholders set a little above what each track
-- actually booked (the old sheet's headline goals were total-revenue targets,
-- not off-season-only). Dormant work is mandatory, so its discount columns seed
-- to $0. Adjust everything on the Goals screen. The current season
-- ("2026 / 2027") starts empty, ready for daily entry.

insert into off_season_seasons (label, is_current) values
  ('2025 / 2026', false),
  ('2026 / 2027', true);

insert into off_season_targets (season_id, work_type, os_window, goal_amount, window_start, window_end)
select s.id, t.work_type, t.os_window, t.goal_amount, t.window_start::date, t.window_end::date
from (values
  ('discounted','nov_dec',750000,'2025-08-01','2025-12-31'),
  ('discounted','jan_march',850000,'2025-10-01','2026-03-31'),
  ('dormant','nov_dec',650000,'2025-08-01','2025-12-31'),
  ('dormant','jan_march',700000,'2025-10-01','2026-03-31')
) as t(work_type, os_window, goal_amount, window_start, window_end)
cross join (select id from off_season_seasons where label = '2025 / 2026') s;

insert into off_season_targets (season_id, work_type, os_window, goal_amount, window_start, window_end)
select s.id, t.work_type, t.os_window, t.goal_amount, t.window_start::date, t.window_end::date
from (values
  ('discounted','nov_dec',750000,'2026-08-01','2026-12-31'),
  ('discounted','jan_march',850000,'2026-10-01','2027-03-31'),
  ('dormant','nov_dec',650000,'2026-08-01','2026-12-31'),
  ('dormant','jan_march',700000,'2026-10-01','2027-03-31')
) as t(work_type, os_window, goal_amount, window_start, window_end)
cross join (select id from off_season_seasons where label = '2026 / 2027') s;

insert into off_season_entries (season_id, work_type, os_window, entry_date, scheduled_revenue, discount_given)
select s.id, v.work_type, v.os_window, v.entry_date::date, v.scheduled_revenue, v.discount_given
from (values
  ('2025-08-28','discounted','nov_dec',281222.0,26631.0),
  ('2025-08-29','discounted','nov_dec',289610.68,28221.0),
  ('2025-08-30','discounted','nov_dec',305626.37,29058.0),
  ('2025-08-31','discounted','nov_dec',313533.37,29225.0),
  ('2025-09-01','discounted','nov_dec',313533.37,30224.59),
  ('2025-09-02','discounted','nov_dec',335503.0,32692.0),
  ('2025-09-03','discounted','nov_dec',348616.0,33038.0),
  ('2025-09-04','discounted','nov_dec',358532.6,34619.92),
  ('2025-09-05','discounted','nov_dec',374365.43,36163.55),
  ('2025-09-06','discounted','nov_dec',403198.92,37724.13),
  ('2025-09-07','discounted','nov_dec',411392.02,38315.65),
  ('2025-09-08','discounted','nov_dec',411392.02,39157.85),
  ('2025-09-09','discounted','jan_march',13365.2,673.9),
  ('2025-09-09','discounted','nov_dec',401734.48,39476.48),
  ('2025-09-10','discounted','jan_march',13365.2,673.9),
  ('2025-09-10','discounted','nov_dec',408139.08,42338.09),
  ('2025-09-11','discounted','jan_march',13365.2,995.9),
  ('2025-09-11','discounted','nov_dec',433036.47,47177.89),
  ('2025-09-11','dormant','jan_march',33103.4,0.0),
  ('2025-09-11','dormant','nov_dec',277232.59,0.0),
  ('2025-09-12','discounted','jan_march',15912.2,2273.74),
  ('2025-09-12','discounted','nov_dec',465581.07,47555.34),
  ('2025-09-12','dormant','jan_march',33103.4,0.0),
  ('2025-09-12','dormant','nov_dec',277232.59,0.0),
  ('2025-09-13','discounted','jan_march',15912.2,2840.96),
  ('2025-09-13','discounted','nov_dec',465581.07,47555.34),
  ('2025-09-13','dormant','jan_march',33103.4,0.0),
  ('2025-09-13','dormant','nov_dec',277232.59,0.0),
  ('2025-09-14','discounted','jan_march',37040.04,2840.96),
  ('2025-09-14','discounted','nov_dec',487893.87,47912.34),
  ('2025-09-14','dormant','jan_march',33103.4,0.0),
  ('2025-09-14','dormant','nov_dec',284918.59,0.0),
  ('2025-09-15','discounted','jan_march',37040.04,5998.56),
  ('2025-09-15','discounted','nov_dec',487245.87,49279.77),
  ('2025-09-15','dormant','jan_march',34230.4,0.0),
  ('2025-09-15','dormant','nov_dec',288488.14,0.0),
  ('2025-09-16','discounted','jan_march',47551.26,6853.56),
  ('2025-09-16','discounted','nov_dec',508496.45,49895.77),
  ('2025-09-16','dormant','jan_march',34230.0,0.0),
  ('2025-09-16','dormant','nov_dec',296982.84,0.0),
  ('2025-09-17','discounted','jan_march',54384.26,7959.81),
  ('2025-09-17','discounted','nov_dec',510102.95,51607.96),
  ('2025-09-17','dormant','jan_march',35047.15,0.0),
  ('2025-09-17','dormant','nov_dec',310280.84,0.0),
  ('2025-09-18','discounted','jan_march',54102.26,9402.11),
  ('2025-09-18','discounted','nov_dec',527467.0,52096.66),
  ('2025-09-18','dormant','jan_march',35047.15,0.0),
  ('2025-09-18','dormant','nov_dec',322992.44,0.0),
  ('2025-09-21','discounted','jan_march',73512.31,10283.56),
  ('2025-09-21','discounted','nov_dec',564687.78,53683.85),
  ('2025-09-21','dormant','jan_march',35047.15,0.0),
  ('2025-09-21','dormant','nov_dec',323097.69,0.0),
  ('2025-09-22','discounted','jan_march',73512.31,11812.05),
  ('2025-09-22','discounted','nov_dec',565574.95,55305.38),
  ('2025-09-22','dormant','jan_march',36449.65,0.0),
  ('2025-09-22','dormant','nov_dec',323245.19,0.0),
  ('2025-09-23','discounted','jan_march',89397.6,13463.6),
  ('2025-09-23','discounted','nov_dec',593510.63,56205.38),
  ('2025-09-23','dormant','jan_march',36449.65,0.0),
  ('2025-09-23','dormant','nov_dec',325360.69,0.0),
  ('2025-09-24','discounted','jan_march',91079.6,14433.83),
  ('2025-09-24','discounted','nov_dec',600692.63,56295.6),
  ('2025-09-24','dormant','jan_march',36449.65,0.0),
  ('2025-09-24','dormant','nov_dec',328360.69,0.0),
  ('2025-09-25','discounted','jan_march',107323.33,15488.72),
  ('2025-09-25','discounted','nov_dec',611293.13,56740.52),
  ('2025-09-25','dormant','jan_march',36449.65,0.0),
  ('2025-09-25','dormant','nov_dec',338409.69,0.0),
  ('2025-09-28','discounted','jan_march',118789.47,18371.27),
  ('2025-09-28','discounted','nov_dec',613333.13,56752.61),
  ('2025-09-28','dormant','jan_march',37330.9,0.0),
  ('2025-09-28','dormant','nov_dec',340397.27,0.0),
  ('2025-09-29','discounted','jan_march',124155.93,19412.4),
  ('2025-09-29','discounted','nov_dec',609480.0,57028.61),
  ('2025-09-29','dormant','jan_march',36449.65,0.0),
  ('2025-09-29','dormant','nov_dec',340397.27,0.0),
  ('2025-09-30','discounted','jan_march',152247.2,20577.71),
  ('2025-09-30','discounted','nov_dec',610140.91,57597.61),
  ('2025-09-30','dormant','jan_march',39885.05,0.0),
  ('2025-09-30','dormant','nov_dec',380547.5,0.0),
  ('2025-10-01','discounted','jan_march',170769.62,21218.5),
  ('2025-10-01','discounted','nov_dec',622700.91,57941.11),
  ('2025-10-01','dormant','jan_march',39885.05,0.0),
  ('2025-10-01','dormant','nov_dec',388178.82,0.0),
  ('2025-10-07','discounted','jan_march',199672.06,24611.2),
  ('2025-10-07','discounted','nov_dec',621497.57,59273.15),
  ('2025-10-07','dormant','jan_march',39785.05,0.0),
  ('2025-10-07','dormant','nov_dec',396135.29,0.0),
  ('2025-10-08','discounted','jan_march',210059.45,25273.86),
  ('2025-10-08','discounted','nov_dec',621497.57,59273.15),
  ('2025-10-08','dormant','jan_march',39785.05,0.0),
  ('2025-10-08','dormant','nov_dec',397955.29,0.0),
  ('2025-10-09','discounted','jan_march',222600.48,28951.31),
  ('2025-10-09','discounted','nov_dec',634028.04,60618.18),
  ('2025-10-09','dormant','jan_march',39785.05,0.0),
  ('2025-10-09','dormant','nov_dec',398167.29,0.0),
  ('2025-10-12','discounted','jan_march',232830.39,34550.94),
  ('2025-10-12','discounted','nov_dec',641858.39,60576.11),
  ('2025-10-12','dormant','jan_march',39785.05,0.0),
  ('2025-10-12','dormant','nov_dec',398167.29,0.0),
  ('2025-10-13','discounted','jan_march',232830.39,34639.98),
  ('2025-10-13','discounted','nov_dec',649544.71,62091.29),
  ('2025-10-13','dormant','jan_march',39785.05,0.0),
  ('2025-10-13','dormant','nov_dec',398167.29,0.0),
  ('2025-10-14','discounted','jan_march',283124.11,37387.97),
  ('2025-10-14','discounted','nov_dec',649544.71,61944.2),
  ('2025-10-14','dormant','jan_march',39785.05,0.0),
  ('2025-10-14','dormant','nov_dec',404775.29,0.0),
  ('2025-10-15','discounted','jan_march',306524.16,39239.43),
  ('2025-10-15','discounted','nov_dec',651250.17,62093.4),
  ('2025-10-15','dormant','jan_march',41685.05,0.0),
  ('2025-10-15','dormant','nov_dec',408922.74,0.0),
  ('2025-10-16','discounted','jan_march',338068.79,40515.49),
  ('2025-10-16','discounted','nov_dec',659562.79,62093.4),
  ('2025-10-16','dormant','jan_march',41909.3,0.0),
  ('2025-10-16','dormant','nov_dec',410007.74,0.0),
  ('2025-10-20','discounted','jan_march',377633.9,44136.45),
  ('2025-10-20','discounted','nov_dec',664058.54,62306.93),
  ('2025-10-20','dormant','jan_march',44176.3,0.0),
  ('2025-10-20','dormant','nov_dec',411848.74,0.0),
  ('2025-10-21','discounted','jan_march',382424.9,45859.52),
  ('2025-10-21','discounted','nov_dec',663898.54,62306.93),
  ('2025-10-21','dormant','jan_march',44176.3,0.0),
  ('2025-10-21','dormant','nov_dec',412223.74,0.0),
  ('2025-10-22','discounted','jan_march',423795.97,49040.92),
  ('2025-10-22','discounted','nov_dec',676380.69,63351.43),
  ('2025-10-22','dormant','jan_march',44176.3,0.0),
  ('2025-10-22','dormant','nov_dec',413972.37,0.0),
  ('2025-10-23','discounted','jan_march',427041.27,50314.82),
  ('2025-10-23','discounted','nov_dec',675726.86,63325.63),
  ('2025-10-23','dormant','jan_march',45101.3,0.0),
  ('2025-10-23','dormant','nov_dec',414403.62,0.0),
  ('2025-10-26','discounted','jan_march',457652.86,54532.53),
  ('2025-10-26','discounted','nov_dec',673174.49,63532.29),
  ('2025-10-26','dormant','jan_march',45780.55,0.0),
  ('2025-10-26','dormant','nov_dec',429016.46,0.0),
  ('2025-10-27','discounted','jan_march',454742.86,55303.1),
  ('2025-10-27','discounted','nov_dec',677585.49,63532.29),
  ('2025-10-27','dormant','jan_march',47105.55,0.0),
  ('2025-10-27','dormant','nov_dec',434924.85,0.0),
  ('2025-10-29','discounted','jan_march',489327.26,58011.16),
  ('2025-10-29','discounted','nov_dec',678485.49,63532.29),
  ('2025-10-29','dormant','jan_march',47105.55,0.0),
  ('2025-10-29','dormant','nov_dec',485471.24,0.0),
  ('2025-10-30','discounted','jan_march',503991.28,58714.16),
  ('2025-10-30','discounted','nov_dec',673500.49,63532.29),
  ('2025-10-30','dormant','jan_march',60250.4,0.0),
  ('2025-10-30','dormant','nov_dec',588347.26,0.0),
  ('2025-11-02','discounted','jan_march',542548.66,64629.46),
  ('2025-11-02','discounted','nov_dec',670391.09,63981.99),
  ('2025-11-02','dormant','jan_march',62080.9,0.0),
  ('2025-11-02','dormant','nov_dec',568795.08,0.0),
  ('2025-11-03','discounted','jan_march',542548.66,66080.95),
  ('2025-11-03','discounted','nov_dec',670391.09,63981.99),
  ('2025-11-03','dormant','jan_march',88623.4,0.0),
  ('2025-11-03','dormant','nov_dec',516471.99,0.0),
  ('2025-11-04','discounted','jan_march',587119.24,66886.35),
  ('2025-11-04','discounted','nov_dec',670447.79,63797.99),
  ('2025-11-04','dormant','jan_march',94618.4,0.0),
  ('2025-11-04','dormant','nov_dec',503304.19,0.0),
  ('2025-11-05','discounted','jan_march',598889.81,67024.35),
  ('2025-11-05','discounted','nov_dec',653082.89,64158.79),
  ('2025-11-05','dormant','jan_march',94618.4,0.0),
  ('2025-11-05','dormant','nov_dec',493100.82,0.0),
  ('2025-11-06','discounted','jan_march',609679.6,67545.85),
  ('2025-11-06','discounted','nov_dec',668652.59,64158.79),
  ('2025-11-06','dormant','jan_march',100048.4,0.0),
  ('2025-11-06','dormant','nov_dec',479140.89,0.0),
  ('2025-11-09','discounted','jan_march',618914.67,68785.28),
  ('2025-11-09','discounted','nov_dec',668326.59,64663.79),
  ('2025-11-09','dormant','jan_march',108976.7,0.0),
  ('2025-11-09','dormant','nov_dec',479659.26,0.0),
  ('2025-11-10','discounted','jan_march',635380.14,69313.31),
  ('2025-11-10','discounted','nov_dec',652655.5,64663.79),
  ('2025-11-10','dormant','jan_march',151719.73,0.0),
  ('2025-11-10','dormant','nov_dec',473149.1,0.0),
  ('2025-11-11','discounted','jan_march',642922.14,70189.31),
  ('2025-11-11','discounted','nov_dec',652555.5,64663.79),
  ('2025-11-11','dormant','jan_march',156557.98,0.0),
  ('2025-11-11','dormant','nov_dec',457175.82,0.0),
  ('2025-11-13','discounted','jan_march',654276.31,71754.68),
  ('2025-11-13','discounted','nov_dec',651981.5,65218.07),
  ('2025-11-13','dormant','jan_march',203458.09,0.0),
  ('2025-11-13','dormant','nov_dec',493262.32,0.0),
  ('2025-11-16','discounted','jan_march',656098.38,72163.59),
  ('2025-11-16','discounted','nov_dec',660995.48,65218.07),
  ('2025-11-16','dormant','jan_march',204749.29,0.0),
  ('2025-11-16','dormant','nov_dec',469258.19,0.0),
  ('2025-11-17','discounted','jan_march',669249.73,72740.29),
  ('2025-11-17','discounted','nov_dec',660854.61,65646.97),
  ('2025-11-17','dormant','jan_march',214753.65,0.0),
  ('2025-11-17','dormant','nov_dec',455945.83,0.0),
  ('2025-11-19','discounted','jan_march',681329.75,74508.77),
  ('2025-11-19','discounted','nov_dec',660156.29,65641.97),
  ('2025-11-19','dormant','jan_march',225615.4,0.0),
  ('2025-11-19','dormant','nov_dec',412309.67,0.0),
  ('2025-11-23','discounted','jan_march',696887.46,75031.67),
  ('2025-11-23','discounted','nov_dec',654129.22,65641.97),
  ('2025-11-23','dormant','jan_march',296988.25,0.0),
  ('2025-11-23','dormant','nov_dec',386459.15,0.0),
  ('2025-11-24','discounted','jan_march',695116.26,75031.67),
  ('2025-11-24','discounted','nov_dec',654129.22,65641.97),
  ('2025-11-24','dormant','jan_march',329610.48,0.0),
  ('2025-11-24','dormant','nov_dec',363599.71,0.0),
  ('2025-12-01','discounted','jan_march',726221.53,78614.21),
  ('2025-12-01','discounted','nov_dec',635247.42,65546.97),
  ('2025-12-01','dormant','jan_march',374994.12,0.0),
  ('2025-12-01','dormant','nov_dec',323538.23,0.0),
  ('2025-12-05','discounted','jan_march',742565.42,79562.21),
  ('2025-12-05','discounted','nov_dec',638029.46,65850.17),
  ('2025-12-05','dormant','jan_march',400987.34,0.0),
  ('2025-12-05','dormant','nov_dec',255367.9,0.0),
  ('2025-12-08','discounted','jan_march',744428.42,80207.01),
  ('2025-12-08','discounted','nov_dec',639582.26,65850.17),
  ('2025-12-08','dormant','jan_march',400705.09,0.0),
  ('2025-12-08','dormant','nov_dec',240246.8,0.0),
  ('2025-12-09','discounted','jan_march',744428.42,80662.86),
  ('2025-12-09','discounted','nov_dec',639582.26,65850.17),
  ('2025-12-09','dormant','jan_march',440106.73,0.0),
  ('2025-12-09','dormant','nov_dec',218454.03,0.0),
  ('2025-12-10','discounted','jan_march',741353.45,80662.86),
  ('2025-12-10','discounted','nov_dec',646276.23,65850.17),
  ('2025-12-10','dormant','jan_march',454063.45,0.0),
  ('2025-12-10','dormant','nov_dec',205417.13,0.0),
  ('2025-12-16','discounted','jan_march',763801.43,82624.73),
  ('2025-12-16','discounted','nov_dec',645572.83,65943.57),
  ('2025-12-16','dormant','jan_march',514416.74,0.0),
  ('2025-12-16','dormant','nov_dec',139493.44,0.0),
  ('2025-12-18','discounted','jan_march',765628.43,82624.73),
  ('2025-12-18','discounted','nov_dec',645572.83,65943.57),
  ('2025-12-18','dormant','jan_march',541085.24,0.0),
  ('2025-12-18','dormant','nov_dec',105953.84,0.0),
  ('2025-12-19','discounted','jan_march',765628.43,82778.73),
  ('2025-12-19','discounted','nov_dec',639571.23,65641.57),
  ('2025-12-19','dormant','jan_march',552253.49,0.0),
  ('2025-12-19','dormant','nov_dec',88405.59,0.0),
  ('2025-12-22','discounted','jan_march',768311.93,83035.23),
  ('2025-12-22','discounted','nov_dec',639571.23,65641.57),
  ('2025-12-22','dormant','jan_march',551070.24,0.0),
  ('2025-12-22','dormant','nov_dec',70993.94,0.0),
  ('2025-12-23','discounted','jan_march',773608.67,83463.09),
  ('2025-12-23','discounted','nov_dec',639646.23,65641.57),
  ('2025-12-23','dormant','jan_march',554195.49,0.0),
  ('2025-12-23','dormant','nov_dec',57390.87,0.0),
  ('2025-12-24','discounted','jan_march',773608.67,83463.09),
  ('2025-12-24','discounted','nov_dec',639646.23,65641.57),
  ('2025-12-24','dormant','jan_march',570935.52,0.0),
  ('2025-12-24','dormant','nov_dec',45302.87,0.0),
  ('2025-12-29','discounted','jan_march',767069.27,83463.09),
  ('2025-12-29','discounted','nov_dec',639646.23,65641.57),
  ('2025-12-29','dormant','jan_march',586459.08,0.0),
  ('2025-12-29','dormant','nov_dec',34341.43,0.0),
  ('2025-12-30','discounted','jan_march',771430.96,83947.72),
  ('2025-12-30','discounted','nov_dec',639646.23,65641.57),
  ('2025-12-30','dormant','jan_march',601976.0,0.0),
  ('2025-12-30','dormant','nov_dec',23228.0,0.0),
  ('2025-12-31','discounted','jan_march',771430.96,83947.72),
  ('2025-12-31','discounted','nov_dec',638046.23,65641.57),
  ('2025-12-31','dormant','jan_march',604623.25,0.0),
  ('2025-12-31','dormant','nov_dec',5073.5,0.0),
  ('2026-01-05','discounted','jan_march',771430.96,83947.72),
  ('2026-01-05','discounted','nov_dec',645896.73,66362.07),
  ('2026-01-05','dormant','jan_march',604619.33,0.0),
  ('2026-01-06','discounted','jan_march',771430.96,84940.28),
  ('2026-01-06','discounted','nov_dec',646035.48,66362.07),
  ('2026-01-06','dormant','jan_march',596255.58,0.0),
  ('2026-01-07','discounted','jan_march',767152.63,85081.86),
  ('2026-01-07','discounted','nov_dec',646035.48,66362.07),
  ('2026-01-07','dormant','jan_march',589203.33,0.0),
  ('2026-01-08','discounted','jan_march',770550.81,85132.76),
  ('2026-01-08','discounted','nov_dec',646035.48,66362.07),
  ('2026-01-08','dormant','jan_march',568534.92,0.0),
  ('2026-01-09','discounted','jan_march',761489.05,85132.76),
  ('2026-01-09','discounted','nov_dec',646095.48,66362.07),
  ('2026-01-09','dormant','jan_march',568534.92,0.0),
  ('2026-01-12','discounted','jan_march',761489.05,85700.78),
  ('2026-01-12','discounted','nov_dec',646095.48,66362.07),
  ('2026-01-12','dormant','jan_march',600534.11,0.0),
  ('2026-01-13','discounted','jan_march',761459.05,85700.78),
  ('2026-01-13','discounted','nov_dec',646095.48,66362.07),
  ('2026-01-13','dormant','jan_march',589030.86,0.0),
  ('2026-01-14','discounted','jan_march',761459.05,86628.78),
  ('2026-01-14','discounted','nov_dec',646095.48,66362.07),
  ('2026-01-14','dormant','jan_march',578057.76,0.0),
  ('2026-01-15','discounted','jan_march',761510.55,86628.78),
  ('2026-01-15','discounted','nov_dec',646095.48,66362.07),
  ('2026-01-15','dormant','jan_march',571363.16,0.0),
  ('2026-01-16','discounted','jan_march',761510.55,86628.78),
  ('2026-01-16','discounted','nov_dec',646095.48,66362.07),
  ('2026-01-16','dormant','jan_march',572632.93,0.0),
  ('2026-01-19','discounted','jan_march',761510.55,86783.98),
  ('2026-01-19','discounted','nov_dec',646095.48,66362.07),
  ('2026-01-19','dormant','jan_march',574703.67,0.0),
  ('2026-01-20','discounted','jan_march',761510.55,86783.98),
  ('2026-01-20','discounted','nov_dec',646095.48,66362.07),
  ('2026-01-20','dormant','jan_march',574229.57,0.0),
  ('2026-01-21','discounted','jan_march',765458.55,86867.98),
  ('2026-01-21','discounted','nov_dec',646095.48,66362.07),
  ('2026-01-21','dormant','jan_march',535309.57,0.0),
  ('2026-01-22','discounted','jan_march',765458.55,87065.06),
  ('2026-01-22','discounted','nov_dec',640212.48,66362.07),
  ('2026-01-22','dormant','jan_march',541836.37,0.0),
  ('2026-01-23','discounted','jan_march',765458.55,87065.06),
  ('2026-01-23','discounted','nov_dec',640212.48,66362.07),
  ('2026-01-23','dormant','jan_march',596225.09,0.0),
  ('2026-01-26','discounted','jan_march',765458.55,87065.06),
  ('2026-01-26','discounted','nov_dec',640212.48,66451.39),
  ('2026-01-26','dormant','jan_march',576507.06,0.0),
  ('2026-01-27','discounted','jan_march',765458.55,87065.06),
  ('2026-01-27','discounted','nov_dec',640212.48,66451.39),
  ('2026-01-27','dormant','jan_march',589365.84,0.0),
  ('2026-01-28','discounted','jan_march',765458.55,87065.06),
  ('2026-01-28','discounted','nov_dec',640212.48,66451.39),
  ('2026-01-28','dormant','jan_march',590726.73,0.0),
  ('2026-01-29','discounted','jan_march',766220.55,87065.06),
  ('2026-01-29','discounted','nov_dec',640212.48,66451.39),
  ('2026-01-29','dormant','jan_march',590454.43,0.0),
  ('2026-01-30','discounted','jan_march',766220.55,87065.06),
  ('2026-01-30','discounted','nov_dec',639912.48,66451.39),
  ('2026-01-30','dormant','jan_march',559340.53,0.0),
  ('2026-02-02','discounted','jan_march',765845.55,87065.06),
  ('2026-02-02','discounted','nov_dec',639912.48,66451.39),
  ('2026-02-02','dormant','jan_march',547886.68,0.0),
  ('2026-02-04','discounted','jan_march',761533.43,87065.06),
  ('2026-02-04','discounted','nov_dec',639912.48,66451.39),
  ('2026-02-04','dormant','jan_march',550191.54,0.0),
  ('2026-02-05','discounted','jan_march',767403.83,87988.96),
  ('2026-02-05','discounted','nov_dec',639912.48,66451.39),
  ('2026-02-05','dormant','jan_march',496832.29,0.0),
  ('2026-02-06','discounted','jan_march',766503.83,87988.96),
  ('2026-02-06','discounted','nov_dec',639912.48,66451.39),
  ('2026-02-06','dormant','jan_march',482162.04,0.0),
  ('2026-02-09','discounted','jan_march',766531.83,87988.96),
  ('2026-02-09','discounted','nov_dec',637811.48,66451.39),
  ('2026-02-09','dormant','jan_march',469124.89,0.0),
  ('2026-02-10','discounted','jan_march',766531.83,88300.96),
  ('2026-02-10','discounted','nov_dec',637811.48,66451.39),
  ('2026-02-10','dormant','jan_march',472699.94,0.0),
  ('2026-02-11','discounted','jan_march',767354.83,88504.46),
  ('2026-02-11','discounted','nov_dec',637811.48,66451.39),
  ('2026-02-11','dormant','jan_march',464538.91,0.0),
  ('2026-02-12','discounted','jan_march',767354.83,88767.46),
  ('2026-02-12','discounted','nov_dec',637811.48,66451.39),
  ('2026-02-12','dormant','jan_march',459300.41,0.0),
  ('2026-02-13','discounted','jan_march',767722.83,89029.46),
  ('2026-02-13','discounted','nov_dec',637811.48,66451.39),
  ('2026-02-13','dormant','jan_march',440162.21,0.0),
  ('2026-02-16','discounted','jan_march',767722.83,90443.49),
  ('2026-02-16','discounted','nov_dec',637811.48,66451.39),
  ('2026-02-16','dormant','jan_march',424590.24,0.0),
  ('2026-02-17','discounted','jan_march',768015.83,90517.89),
  ('2026-02-17','discounted','nov_dec',637811.48,66451.39),
  ('2026-02-17','dormant','jan_march',402123.84,0.0),
  ('2026-02-18','discounted','jan_march',746681.93,90517.89),
  ('2026-02-18','discounted','nov_dec',635689.28,66451.39),
  ('2026-02-18','dormant','jan_march',396163.74,0.0),
  ('2026-02-19','discounted','jan_march',746796.93,90711.39),
  ('2026-02-19','discounted','nov_dec',635689.28,66451.39),
  ('2026-02-19','dormant','jan_march',391899.34,0.0),
  ('2026-02-20','discounted','jan_march',746796.93,90711.39),
  ('2026-02-20','discounted','nov_dec',635689.28,66451.39),
  ('2026-02-20','dormant','jan_march',362012.59,0.0),
  ('2026-02-23','discounted','jan_march',746796.93,91045.39),
  ('2026-02-23','discounted','nov_dec',635689.28,66451.39),
  ('2026-02-23','dormant','jan_march',346296.99,0.0),
  ('2026-02-24','discounted','jan_march',742313.93,90711.39),
  ('2026-02-24','discounted','nov_dec',635689.28,66566.39),
  ('2026-02-24','dormant','jan_march',335800.77,0.0),
  ('2026-02-25','discounted','jan_march',738573.2,90711.39),
  ('2026-02-25','discounted','nov_dec',635689.28,66566.39),
  ('2026-02-25','dormant','jan_march',332961.77,0.0),
  ('2026-02-26','discounted','jan_march',738773.2,90711.39),
  ('2026-02-26','discounted','nov_dec',635689.28,66566.39),
  ('2026-02-26','dormant','jan_march',278390.69,0.0),
  ('2026-02-27','discounted','jan_march',738773.2,90711.39),
  ('2026-02-27','discounted','nov_dec',635689.28,66566.39),
  ('2026-02-27','dormant','jan_march',263325.77,0.0),
  ('2026-03-02','discounted','jan_march',738773.2,90711.39),
  ('2026-03-02','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-02','dormant','jan_march',239504.47,0.0),
  ('2026-03-03','discounted','jan_march',738773.2,90711.39),
  ('2026-03-03','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-03','dormant','jan_march',229242.37,0.0),
  ('2026-03-04','discounted','jan_march',739073.2,90756.39),
  ('2026-03-04','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-04','dormant','jan_march',197382.36,0.0),
  ('2026-03-05','discounted','jan_march',739073.2,90756.39),
  ('2026-03-05','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-05','dormant','jan_march',197490.79,0.0),
  ('2026-03-06','discounted','jan_march',739073.2,90756.39),
  ('2026-03-06','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-06','dormant','jan_march',188995.18,0.0),
  ('2026-03-09','discounted','jan_march',738778.2,90986.39),
  ('2026-03-09','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-09','dormant','jan_march',181029.43,0.0),
  ('2026-03-10','discounted','jan_march',738778.2,90986.39),
  ('2026-03-10','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-10','dormant','jan_march',169604.93,0.0),
  ('2026-03-11','discounted','jan_march',739212.18,90896.39),
  ('2026-03-11','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-11','dormant','jan_march',154056.4,0.0),
  ('2026-03-12','discounted','jan_march',739212.18,90896.39),
  ('2026-03-12','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-12','dormant','jan_march',144229.88,0.0),
  ('2026-03-13','discounted','jan_march',738612.18,90896.39),
  ('2026-03-13','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-13','dormant','jan_march',114667.95,0.0),
  ('2026-03-16','discounted','jan_march',738565.18,90896.39),
  ('2026-03-16','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-16','dormant','jan_march',102397.88,0.0),
  ('2026-03-17','discounted','jan_march',738913.18,90896.39),
  ('2026-03-17','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-17','dormant','jan_march',97987.13,0.0),
  ('2026-03-18','discounted','jan_march',738913.18,90896.39),
  ('2026-03-18','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-18','dormant','jan_march',78582.03,0.0),
  ('2026-03-19','discounted','jan_march',738913.18,90896.39),
  ('2026-03-19','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-19','dormant','jan_march',67423.03,0.0),
  ('2026-03-20','discounted','jan_march',738913.18,90896.39),
  ('2026-03-20','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-20','dormant','jan_march',66652.89,0.0),
  ('2026-03-23','discounted','jan_march',738973.18,91213.9),
  ('2026-03-23','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-23','dormant','jan_march',56886.53,0.0),
  ('2026-03-24','discounted','jan_march',738973.18,91213.9),
  ('2026-03-24','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-24','dormant','jan_march',39680.63,0.0),
  ('2026-03-25','discounted','jan_march',738973.18,91522.93),
  ('2026-03-25','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-25','dormant','jan_march',29710.63,0.0),
  ('2026-03-26','discounted','jan_march',738973.18,91522.93),
  ('2026-03-26','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-26','dormant','jan_march',22635.63,0.0),
  ('2026-03-27','discounted','jan_march',738973.18,91522.93),
  ('2026-03-27','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-27','dormant','jan_march',16913.65,0.0),
  ('2026-03-30','discounted','jan_march',735778.68,91522.93),
  ('2026-03-30','discounted','nov_dec',635689.28,66566.39),
  ('2026-03-30','dormant','jan_march',5259.04,0.0),
  ('2026-03-31','discounted','jan_march',736412.68,91522.93),
  ('2026-03-31','discounted','nov_dec',635689.28,66566.39)
) as v(entry_date, work_type, os_window, scheduled_revenue, discount_given)
cross join (select id from off_season_seasons where label = '2025 / 2026') s;
