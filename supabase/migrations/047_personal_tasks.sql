-- ============================================================================
-- 047_personal_tasks.sql
-- ============================================================================
-- Backs the private "My Projects" hub — a personal project-management
-- checklist for the dashboard owner only. One row per to-do item. Items are
-- optionally grouped under a free-text `project` name (blank = "Inbox"), so
-- there's no separate projects table to maintain: a new project is just a new
-- name typed into the add form.
--
-- This is a single-user feature, so we keep it to one flat table and gate it
-- hard at the database layer: the RLS policy below hardcodes the owner's
-- email, meaning even another signed-in admin cannot read or write these rows.
-- Keep the address in sync with OWNER_EMAIL in src/lib/auth.ts.
-- ============================================================================

create table if not exists personal_tasks (
  id          uuid primary key default gen_random_uuid(),
  owner_email text        not null,
  project     text        not null default '',
  title       text        not null,
  notes       text,
  done        boolean     not null default false,
  due_date    date,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Most reads list a person's open items ordered within their projects.
create index if not exists personal_tasks_owner_idx
  on personal_tasks (lower(owner_email), project, sort_order);

-- Reuse the shared updated_at trigger function defined in 001.
drop trigger if exists personal_tasks_updated on personal_tasks;
create trigger personal_tasks_updated before update on personal_tasks
  for each row execute function set_updated_at();

-- Row Level Security: only the owner email may touch these rows. This is the
-- backstop behind the app-layer requireOwner() guard — defense in depth so a
-- bug in the UI can never leak someone else's personal checklist.
alter table personal_tasks enable row level security;

drop policy if exists personal_tasks_owner on personal_tasks;

create policy personal_tasks_owner on personal_tasks
  for all
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'molly@bratttree.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'molly@bratttree.com');
