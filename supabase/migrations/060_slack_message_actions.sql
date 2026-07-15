-- ============================================================================
-- 060_slack_message_actions.sql
-- ============================================================================
-- Per-message manual overrides for the Slack Tags board. The auto-sorter
-- decides a bucket for every tag, but the user can override it by hand:
--
--   'handled'   → "I dealt with this / it doesn't need a reply" — drop it into
--                 the Handled pile regardless of what the sorter thought.
--   'followup'  → "come back to this" — pull it onto a personal follow-up /
--                 to-do list at the top of the board.
--
-- One row per (user, message). message_key is the card id, "channelId:ts".
-- Absence of a row means "trust the auto-sorter". Same per-user RLS as the
-- rest of the Slack tables (migration 059): each user only ever sees their own.
-- ============================================================================

create table if not exists slack_message_actions (
  owner_email text        not null,
  message_key text        not null, -- "<channel_id>:<message_ts>"
  action      text        not null check (action in ('handled', 'followup')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (owner_email, message_key)
);

drop trigger if exists slack_message_actions_updated on slack_message_actions;
create trigger slack_message_actions_updated before update on slack_message_actions
  for each row execute function set_updated_at();

alter table slack_message_actions enable row level security;

drop policy if exists slack_message_actions_self on slack_message_actions;
create policy slack_message_actions_self on slack_message_actions
  for all
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = lower(owner_email))
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = lower(owner_email));
