-- ============================================================================
-- 021_field_crew_training_refresh.sql
-- ============================================================================
-- Refresh the training catalog and add the new "training session log".
--
-- Catalog changes:
--   - Skills: add Stumpgrinding.
--   - Trainings: remove Ground Ops 1-4 + Crane Use Level 2/3.
--   - Trainings: add Stumpgrinding, Steel Cables Ground/Tree, Bucket Removal/
--     Pruning, Nifty Removal/Pruning, Climbing Removal/Pruning. All new
--     trainings are hours-based — they aggregate from session entries.
--
-- New tables:
--   - field_crew_training_sessions: one dated training session per row.
--     The trainer logs ONE date + ONE notes blob per session.
--   - field_crew_training_session_entries: per-training (training_key, hours)
--     rows that belong to a session. The trainings section on the employee
--     profile sums these to show running hours per training.
-- ============================================================================

begin;

-- 1. Drop legacy training records that are about to be removed ---------------
delete from field_crew_employee_trainings
 where training_key in (
   'ground_ops_1','ground_ops_2','ground_ops_3','ground_ops_4',
   'crane_use_level_2','crane_use_level_3'
 );

-- 2. Drop the catalog entries themselves -------------------------------------
delete from field_crew_trainings
 where key in (
   'ground_ops_1','ground_ops_2','ground_ops_3','ground_ops_4',
   'crane_use_level_2','crane_use_level_3'
 );

-- 3. Add the new skill -------------------------------------------------------
insert into field_crew_skills (key, display_name, display_order) values
  ('stumpgrinding', 'Stumpgrinding', 75)
on conflict (key) do nothing;

-- 4. Add the new trainings (all hours-based) ---------------------------------
insert into field_crew_trainings (key, display_name, display_order, card_required, is_hours_based) values
  ('stumpgrinding',       'Stumpgrinding',         200, false, true),
  ('steel_cables_ground', 'Steel Cables Ground',   210, false, true),
  ('steel_cables_tree',   'Steel Cables Tree',     220, false, true),
  ('bucket_removal',      'Bucket Removal',        230, false, true),
  ('bucket_pruning',      'Bucket Pruning',        240, false, true),
  ('nifty_removal',       'Nifty Removal',         250, false, true),
  ('nifty_pruning',       'Nifty Pruning',         260, false, true),
  ('climbing_removal',    'Climbing Removal',      270, false, true),
  ('climbing_pruning',    'Climbing Pruning',      280, false, true)
on conflict (key) do nothing;

-- 5. Training session tables -------------------------------------------------
create table field_crew_training_sessions (
  id             uuid primary key default gen_random_uuid(),
  employee_slug  text not null references field_crew_employees(slug) on delete cascade,
  session_date   date not null,
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     text
);

create index field_crew_training_sessions_emp_idx
  on field_crew_training_sessions(employee_slug, session_date desc);

create table field_crew_training_session_entries (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references field_crew_training_sessions(id) on delete cascade,
  training_key  text not null references field_crew_trainings(key) on delete restrict,
  -- numeric(5,2) gives us up to 999.99 hours per entry — plenty for one session.
  hours         numeric(5,2) not null check (hours > 0)
);

create index field_crew_training_session_entries_session_idx
  on field_crew_training_session_entries(session_id);

create index field_crew_training_session_entries_training_idx
  on field_crew_training_session_entries(training_key);

-- 6. RLS — same pattern as the rest of the hub --------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'field_crew_training_sessions',
    'field_crew_training_session_entries'
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

commit;
