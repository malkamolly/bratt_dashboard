-- ============================================================================
-- 037_cdl_tracker.sql
-- ============================================================================
-- CDL training pipeline tracker. CDL = Commercial Driver's License; crew need
-- it to drive the bigger trucks. Getting one is a multi-step process, so a
-- single "completed yes/no" training row doesn't capture where someone is.
--
-- Each tracked crew member sits at exactly one of five stages:
--   1. Independent Study
--   2. Permit Test
--   3. 5-Day Course On-Site
--   4. License Test
--   5. CDL License obtained  (done)
--
-- Managers advance people through the stages; the daily progress page shows a
-- pipeline overview. The stage labels themselves live in the app
-- (src/lib/cdl.ts) so wording stays in one place — here we only store the
-- stage number.
-- ============================================================================

begin;

create table if not exists field_crew_cdl_progress (
  employee_slug text primary key
    references field_crew_employees(slug) on delete cascade,
  stage         smallint not null default 1 check (stage between 1 and 5),
  notes         text,
  updated_at    timestamptz not null default now(),
  updated_by    text
);

-- Row-level security mirrors the other field_crew tables: any hub-eligible
-- role can read; only admins / field managers can write. (fc_can_read /
-- fc_can_write are defined in 019_field_crew_hub.sql.)
alter table field_crew_cdl_progress enable row level security;

drop policy if exists field_crew_cdl_progress_select on field_crew_cdl_progress;
create policy field_crew_cdl_progress_select on field_crew_cdl_progress
  for select using (fc_can_read());

drop policy if exists field_crew_cdl_progress_insert on field_crew_cdl_progress;
create policy field_crew_cdl_progress_insert on field_crew_cdl_progress
  for insert with check (fc_can_write());

drop policy if exists field_crew_cdl_progress_update on field_crew_cdl_progress;
create policy field_crew_cdl_progress_update on field_crew_cdl_progress
  for update using (fc_can_write());

drop policy if exists field_crew_cdl_progress_delete on field_crew_cdl_progress;
create policy field_crew_cdl_progress_delete on field_crew_cdl_progress
  for delete using (fc_can_write());

-- Seed the crew currently in Stage 1 (Independent Study / studying for the
-- permit test). "John" from the source list isn't a crew member yet, so he's
-- left out until he's added to field_crew_employees and then to the tracker.
insert into field_crew_cdl_progress (employee_slug, stage)
values
  ('nolan-m',     1),
  ('trevor-n',    1),
  ('berkeley-d',  1),
  ('sean-b',      1),
  ('braeden-r',   1),
  ('finn-k',      1),
  ('bryan-c',     1),
  ('chandler-l',  1)
on conflict (employee_slug) do nothing;

commit;
