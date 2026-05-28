-- ============================================================================
-- 036_meeting_topic_deck_link.sql
-- ============================================================================
-- Adds an optional `topic_slug` column to the meetings table so a meeting can
-- be linked to a topic deck (the standalone slide decks in /content/topics).
-- When set, the meeting's educational section presents the topic deck instead
-- of the inline markdown body.
--
-- This is just a string slug — there's no foreign key, because topic decks
-- live as source files in the repo, not in the database.
-- ============================================================================

alter table meetings
  add column if not exists topic_slug text;

-- Cheap index in case we ever want to look up "which meetings used this deck"
-- without a full scan. Most meetings won't have a topic_slug set, so this is
-- a tiny index.
create index if not exists meetings_topic_slug_idx
  on meetings (topic_slug)
  where topic_slug is not null;
