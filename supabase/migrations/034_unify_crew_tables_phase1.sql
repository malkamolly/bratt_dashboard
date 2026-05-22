-- ============================================================================
-- 032_unify_crew_tables_phase1.sql
-- ============================================================================
-- PHASE 1 of merging crew_members (production/sales side) into
-- field_crew_employees (Field Crew Hub) so there's ONE canonical "person"
-- record across the whole app.
--
-- This phase is additive — both the old and new columns coexist after
-- it runs, so the app keeps working. Phase 2 (a follow-up migration)
-- drops crew_members and the legacy crew_member_id columns once the
-- code has been switched over.
--
-- What this does:
--   1. Adds field_crew_employees.home_crew_id (the operational daily crew
--      they run with — Bucket 1, Nifty, etc).
--   2. For every crew_members row that has no matching field_crew_employees
--      row by name, auto-creates the field-crew record.
--   3. Backfills field_crew_employees.home_crew_id and leads_crew from
--      crew_members.
--   4. Adds employee_slug to the three downstream tables that referenced
--      crew_members:
--        - production_member_entries
--        - production_member_historicals
--        - sales_addon_attributions
--      and backfills employee_slug via the name match.
--   5. Asserts full backfill coverage and locks employee_slug as NOT NULL.
--
-- Old columns (crew_member_id) and the crew_members table itself are
-- left intact for now — Phase 2 drops them once the application code
-- has been deployed to read/write employee_slug instead.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Add home_crew_id to field_crew_employees.
-- ---------------------------------------------------------------------------
alter table field_crew_employees
  add column if not exists home_crew_id uuid references crews(id);

create index if not exists field_crew_employees_home_crew_idx
  on field_crew_employees(home_crew_id);

-- ---------------------------------------------------------------------------
-- 2. Auto-create field_crew_employees rows for any crew_members that don't
--    already have one (matched by lower-trimmed name).
--    - slug:  generated from name (lowercased, non-alnum → "-")
--    - code:  uses two-letter initials + a 4-char hash suffix so two
--             people with the same initials don't collide. Admin can
--             clean this up in /admin/crew/employees after the fact.
-- ---------------------------------------------------------------------------
with new_rows as (
  select
    cm.id,
    cm.name,
    cm.home_crew_id,
    cm.is_foreman,
    cm.is_active,
    cm.display_order,
    regexp_replace(
      regexp_replace(lower(trim(cm.name)), '[^a-z0-9]+', '-', 'g'),
      '(^-|-$)', '', 'g'
    ) as new_slug
  from crew_members cm
  where not exists (
    select 1 from field_crew_employees fce
    where lower(trim(fce.name)) = lower(trim(cm.name))
  )
),
slugged as (
  select
    *,
    -- Two-letter initials (first letter of first + last word).
    upper(
      coalesce(left(split_part(name, ' ', 1), 1), '') ||
      coalesce(left(split_part(name, ' ', array_length(string_to_array(name, ' '), 1)), 1), '')
    ) as initials,
    -- 4-char stable hash from name → makes the code unique.
    upper(substring(md5(name), 1, 4)) as hash_suffix
  from new_rows
)
insert into field_crew_employees
  (slug, code, name, leads_crew, active, display_order, home_crew_id)
select
  new_slug,
  initials || '-' || hash_suffix,
  name,
  is_foreman,
  is_active,
  display_order,
  home_crew_id
from slugged
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Backfill home_crew_id + leads_crew on field_crew_employees from
--    crew_members for rows that already existed.
-- ---------------------------------------------------------------------------
update field_crew_employees fce
   set home_crew_id = cm.home_crew_id
  from crew_members cm
 where lower(trim(fce.name)) = lower(trim(cm.name))
   and fce.home_crew_id is null
   and cm.home_crew_id is not null;

update field_crew_employees fce
   set leads_crew = cm.is_foreman
  from crew_members cm
 where lower(trim(fce.name)) = lower(trim(cm.name))
   and cm.is_foreman = true
   and fce.leads_crew = false;

-- ---------------------------------------------------------------------------
-- 4. Downstream tables: add employee_slug + backfill via name match.
-- ---------------------------------------------------------------------------

-- production_member_entries
alter table production_member_entries
  add column if not exists employee_slug text references field_crew_employees(slug) on delete restrict;

update production_member_entries pme
   set employee_slug = fce.slug
  from crew_members cm
  join field_crew_employees fce
    on lower(trim(fce.name)) = lower(trim(cm.name))
 where pme.crew_member_id = cm.id
   and pme.employee_slug is null;

create index if not exists production_member_entries_employee_slug_idx
  on production_member_entries(employee_slug);

-- production_member_historicals
alter table production_member_historicals
  add column if not exists employee_slug text references field_crew_employees(slug) on delete restrict;

update production_member_historicals pmh
   set employee_slug = fce.slug
  from crew_members cm
  join field_crew_employees fce
    on lower(trim(fce.name)) = lower(trim(cm.name))
 where pmh.crew_member_id = cm.id
   and pmh.employee_slug is null;

create index if not exists production_member_historicals_employee_slug_idx
  on production_member_historicals(employee_slug);

-- sales_addon_attributions
alter table sales_addon_attributions
  add column if not exists employee_slug text references field_crew_employees(slug) on delete restrict;

update sales_addon_attributions saa
   set employee_slug = fce.slug
  from crew_members cm
  join field_crew_employees fce
    on lower(trim(fce.name)) = lower(trim(cm.name))
 where saa.crew_member_id = cm.id
   and saa.employee_slug is null;

create index if not exists sales_addon_attributions_employee_slug_idx
  on sales_addon_attributions(employee_slug);

-- ---------------------------------------------------------------------------
-- 5. Safety: fail loudly if any row still has no employee_slug. Phase 2
--    can't drop crew_member_id safely if anything is unmatched.
-- ---------------------------------------------------------------------------
do $$
declare
  m1 int; m2 int; m3 int;
begin
  select count(*) into m1 from production_member_entries where employee_slug is null;
  select count(*) into m2 from production_member_historicals where employee_slug is null;
  select count(*) into m3 from sales_addon_attributions where employee_slug is null;

  if m1 + m2 + m3 > 0 then
    raise exception
      'Backfill incomplete: production_member_entries=%, production_member_historicals=%, sales_addon_attributions=% (rows with no employee_slug). Check crew_members for names that don''t match field_crew_employees.',
      m1, m2, m3;
  end if;
end $$;

-- Lock employee_slug NOT NULL now that we know coverage is full.
alter table production_member_entries
  alter column employee_slug set not null;
alter table production_member_historicals
  alter column employee_slug set not null;
alter table sales_addon_attributions
  alter column employee_slug set not null;

-- production_member_historicals has crew_member_id as part of the
-- composite primary key (year, month, crew_member_id). Postgres won't
-- let us relax NOT NULL on a PK column, so first swap the PK to use
-- employee_slug instead — which is the desired end state anyway.
alter table production_member_historicals
  drop constraint production_member_historicals_pkey;
alter table production_member_historicals
  add primary key (year, month, employee_slug);

-- Now relax NOT NULL on the legacy crew_member_id columns so the new
-- application code (which only writes employee_slug) doesn't trip the
-- old constraint while both columns coexist. The columns themselves
-- go away in 035.
alter table production_member_entries
  alter column crew_member_id drop not null;
alter table production_member_historicals
  alter column crew_member_id drop not null;
alter table sales_addon_attributions
  alter column crew_member_id drop not null;

commit;
