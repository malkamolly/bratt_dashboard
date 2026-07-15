-- ============================================================================
-- 061_slack_action_snapshot.sql
-- ============================================================================
-- The Slack Tags board now shows one week at a time (Sunday–Saturday), but the
-- Follow-up list must NOT reset when the week rolls over. A follow-up item can
-- point at a message from an earlier week that this week's search won't return,
-- so we can't rebuild its card from the weekly fetch anymore.
--
-- Fix: when the user flags a message "Follow up", we snapshot the card (author,
-- text, channel, permalink, timestamp, thread ids) into this column. The
-- Follow-up list then renders from the snapshot, independent of which week is
-- selected. "Handled" doesn't need a snapshot — it only ever shows within its
-- own week — so this stays null for those rows.
-- ============================================================================

alter table slack_message_actions
  add column if not exists card jsonb;
