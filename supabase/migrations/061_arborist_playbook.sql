-- ============================================================================
-- 061_arborist_playbook.sql
-- ============================================================================
-- The "Bratt Tree Sales Arborist Playbook" — the accumulated expertise that the
-- video-notes analyzer applies to every walkthrough. Two sources fill it:
--   source = 'library' : distilled from the Training Library (topic decks +
--                         meeting educational content). Refreshed as a batch by
--                         an admin (see /api/video-notes/ingest-library).
--   source = 'coach'   : lessons captured in Coach Mode, where a senior arborist
--                         teaches the analyzer and approves what gets saved.
--
-- Every active entry is injected into the analysis prompt, so the analysis gets
-- smarter as the playbook grows. Access mirrors the video_analyses table
-- (migration 060): hub roles can read; hub roles can add their own approved
-- entries. The library batch job writes with the service-role client.
-- ============================================================================

create table arborist_playbook (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  text not null,                 -- email of who added/approved it

  category    text not null,                 -- e.g. "Tree ID", "Hazard flags"
  title       text not null,                 -- short label
  content     text not null,                 -- the actual guidance (concise)

  source      text not null default 'coach'
                check (source in ('library', 'coach')),
  source_ref  text,                          -- e.g. the topic-deck slug, optional
  active      boolean not null default true  -- lets us retire an entry without deleting
);

create index arborist_playbook_active_idx
  on arborist_playbook (active, category);

alter table arborist_playbook enable row level security;

-- Hub roles can read the playbook (vn_can_use() was defined in migration 060).
create policy arborist_playbook_select on arborist_playbook
  for select using (vn_can_use());

-- Hub roles can add entries attributed to themselves (Coach Mode approvals).
-- The Library batch import runs with the service-role client, which bypasses
-- RLS, so it doesn't need its own delete/insert policy here.
create policy arborist_playbook_insert on arborist_playbook
  for insert with check (
    vn_can_use()
    and lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- You can retire (deactivate) or edit your own entries; admins can edit any.
create policy arborist_playbook_update on arborist_playbook
  for update using (
    lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or exists (
      select 1 from allowed_emails
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role = 'admin'
    )
  );
