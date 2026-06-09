-- ============================================================================
-- 048_personal_projects.sql
-- ============================================================================
-- Rebuilds the private "My Projects" hub as a proper project tree for the
-- single dashboard owner:
--
--   personal_projects        — a named project with a status
--     personal_project_items  — tasks/notes under a project, each with a status
--       (sub-tasks)           — an item whose parent_item_id points at another
--                               item in the same table (one self-join level)
--
-- Status is the same three-value set everywhere: not_started / in_progress /
-- done. We keep tasks and sub-tasks in ONE table (self-referencing via
-- parent_item_id) so the structure is uniform and there's no third table to
-- maintain — a sub-task is just an item that has a parent.
--
-- Like the rest of this hub, access is gated HARD at the database layer: the
-- RLS policies hardcode the owner's email, so even another signed-in admin
-- can't read or write these rows. Keep the address in sync with OWNER_EMAIL
-- in src/lib/auth.ts.
--
-- Note: this supersedes the flat personal_tasks table from migration 047.
-- That table is left in place (harmless) rather than dropped — say the word
-- and we'll remove it in a follow-up migration.
-- ============================================================================

-- 1. Projects ----------------------------------------------------------------
create table if not exists personal_projects (
  id          uuid primary key default gen_random_uuid(),
  owner_email text        not null,
  name        text        not null,
  status      text        not null default 'not_started'
                check (status in ('not_started', 'in_progress', 'done')),
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. Tasks / sub-tasks (one self-referencing table) --------------------------
create table if not exists personal_project_items (
  id             uuid primary key default gen_random_uuid(),
  owner_email    text        not null,
  project_id     uuid        not null
                   references personal_projects (id) on delete cascade,
  -- NULL = a top-level task; set = a sub-task of another item. Deleting a
  -- parent task cascades to its sub-tasks.
  parent_item_id uuid
                   references personal_project_items (id) on delete cascade,
  title          text        not null,
  status         text        not null default 'not_started'
                   check (status in ('not_started', 'in_progress', 'done')),
  sort_order     integer     not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists personal_project_items_project_idx
  on personal_project_items (project_id, parent_item_id, sort_order);

-- 3. updated_at triggers (reuse the shared function from migration 001) ------
drop trigger if exists personal_projects_updated on personal_projects;
create trigger personal_projects_updated before update on personal_projects
  for each row execute function set_updated_at();

drop trigger if exists personal_project_items_updated on personal_project_items;
create trigger personal_project_items_updated before update on personal_project_items
  for each row execute function set_updated_at();

-- 4. Row Level Security: owner email only ------------------------------------
alter table personal_projects      enable row level security;
alter table personal_project_items enable row level security;

drop policy if exists personal_projects_owner      on personal_projects;
drop policy if exists personal_project_items_owner on personal_project_items;

create policy personal_projects_owner on personal_projects
  for all
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'molly@bratttree.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'molly@bratttree.com');

create policy personal_project_items_owner on personal_project_items
  for all
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'molly@bratttree.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'molly@bratttree.com');
