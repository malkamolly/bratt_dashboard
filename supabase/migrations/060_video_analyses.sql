-- ============================================================================
-- 060_video_analyses.sql
-- ============================================================================
-- Stores the AI "findings reports" generated from arborist estimate-walkthrough
-- videos (the /hub/video-notes tool).
--
-- How it works (v1): the arborist uploads a video in the browser; the browser
-- pulls ~1 still frame every several seconds and sends those frames to the
-- server, which asks Claude to describe what it sees (power lines, slopes, wet
-- areas, access/parking concerns, extra trees worth quoting). The structured
-- result is stored here as `findings` (jsonb) so it can be shown later.
--
-- v1 is VISUAL-only. Audio transcription ("what the arborist said") is a v2
-- add-on — extracting audio from large videos server-side is the hard part, and
-- the visual analysis is the piece the owner cares about most.
--
-- Access mirrors HUB_ACCESS['hub'] in src/lib/auth.ts: admin, user,
-- sales_manager, sales_arborist. Same allowed_emails + JWT-email pattern the
-- Field Crew Hub uses (migration 019).
-- ============================================================================

-- Who can use the video-notes tool? (read + create their own analyses)
create or replace function vn_can_use() returns boolean
  language sql stable security definer
  set search_path = public
as $$
  select exists (
    select 1 from allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('admin', 'user', 'sales_manager', 'sales_arborist')
  );
$$;

create table video_analyses (
  id              uuid primary key default gen_random_uuid(),
  created_by      text not null,              -- email of the uploader
  created_at      timestamptz not null default now(),

  -- What was analyzed
  video_name      text,                       -- original filename, if provided
  address         text,                       -- property address, if the user typed one
  duration_seconds numeric,                   -- length of the source video
  frame_count     int not null default 0,     -- how many stills we analyzed

  -- Result
  status          text not null default 'complete'
                    check (status in ('processing', 'complete', 'error')),
  model           text,                        -- which Claude model produced it
  findings        jsonb,                       -- the structured findings report
  error_message   text                         -- populated when status = 'error'
);

-- Newest-first listing per user is the common read pattern.
create index video_analyses_created_by_idx
  on video_analyses (created_by, created_at desc);

alter table video_analyses enable row level security;

-- Anyone with hub access can see the analyses (small internal team; the videos
-- are already access-gated by login). Tighten to created_by later if wanted.
create policy video_analyses_select on video_analyses
  for select using (vn_can_use());

-- You can only create rows attributed to yourself.
create policy video_analyses_insert on video_analyses
  for insert with check (
    vn_can_use()
    and lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
