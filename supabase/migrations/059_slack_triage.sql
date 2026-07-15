-- ============================================================================
-- 059_slack_triage.sql
-- ============================================================================
-- Backs the "Slack Tags" board — a personal triage screen that shows the
-- logged-in user every Slack message they've been tagged in, sorted by what
-- actually needs their attention.
--
-- Two tables, both keyed by the user's hub email:
--
--   slack_connections   one row per user who has connected their Slack account
--                       via OAuth. Stores the user-token (xoxp-…) ENCRYPTED at
--                       the app layer (see src/lib/crypto.ts) — the column
--                       never holds a plaintext token. Read-only scopes only in
--                       v1; no write scopes are requested.
--
--   slack_triage_cache  one row per user holding the last computed board as
--                       JSON, so the page paints instantly on load and only
--                       hits the (rate-limited) Slack search API on refresh.
--
-- v1 is a single-user feature (the dashboard owner), but the RLS policies below
-- are written per-user — each signed-in user can only ever touch their OWN row,
-- matched on their JWT email. That means opening this up to the rest of the
-- team later (v2) needs no schema change: they just connect their own Slack and
-- get their own private row. Nobody can read anyone else's token or board.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Connections: one encrypted token per user.
-- ---------------------------------------------------------------------------
create table if not exists slack_connections (
  owner_email            text        primary key,
  -- The Slack member ID of the connected user (e.g. U08ABCD). We search for
  -- this user's own <@ID> mentions, and use it to tell "the user spoke" from
  -- "someone else spoke" when bucketing a thread.
  slack_user_id          text        not null,
  -- The OAuth user token, encrypted with AES-256-GCM before it ever reaches
  -- the database. NEVER store a raw xoxp- token here.
  access_token_encrypted text        not null,
  -- Space-separated scopes actually granted, for debugging / future checks.
  scopes                 text        not null default '',
  connected_at           timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists slack_connections_updated on slack_connections;
create trigger slack_connections_updated before update on slack_connections
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Cache: the last computed board, so the page paints without a live API call.
-- ---------------------------------------------------------------------------
create table if not exists slack_triage_cache (
  owner_email text        primary key,
  -- The full board: { needs_reply: [...], waiting: [...], handled: [...],
  -- fyi: [...], truncated: bool }. Shape lives in src/lib/slack-triage.ts.
  board       jsonb       not null default '{}'::jsonb,
  fetched_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists slack_triage_cache_updated on slack_triage_cache;
create trigger slack_triage_cache_updated before update on slack_triage_cache
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: a signed-in user may only touch the row whose
-- owner_email matches their own JWT email. Case-insensitive. This is the
-- backstop behind the app-layer requireOwner() guard — even a bug in the UI
-- can never leak one person's Slack token or board to another.
-- ---------------------------------------------------------------------------
alter table slack_connections   enable row level security;
alter table slack_triage_cache  enable row level security;

drop policy if exists slack_connections_self on slack_connections;
create policy slack_connections_self on slack_connections
  for all
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = lower(owner_email))
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = lower(owner_email));

drop policy if exists slack_triage_cache_self on slack_triage_cache;
create policy slack_triage_cache_self on slack_triage_cache
  for all
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = lower(owner_email))
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = lower(owner_email));
