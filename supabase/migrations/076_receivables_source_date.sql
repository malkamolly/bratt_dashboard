-- ============================================================================
-- 076_receivables_source_date.sql
-- Give each uploaded report the day it is FOR, as a queryable column.
--
-- WHY THIS EXISTS — a real bug, not tidiness.
--
-- The "since the last upload" comparison picked whichever report was active
-- before this one, with no notion of which day each was for. So two uploads on
-- the same day made the second one compare against the FIRST UPLOAD OF THE SAME
-- DAY: collected read as roughly nothing, comparedTo showed today's date, and
-- the following day then compared against the wrong baseline. That happened for
-- real on 2026-08-24.
--
-- sourceDate was already written inside the payload JSON, but comparing reports
-- means asking "the most recent snapshot for a DIFFERENT day", and that is a
-- query, not a field read. Hence a real column with an index.
--
-- Backfilled from the payload where it's there. Rows uploaded before sourceDate
-- existed keep NULL, which the comparison treats as "some other day" — the
-- honest reading, since we genuinely don't know what day they were for.
-- ============================================================================

alter table receivables_uploads
  add column if not exists source_date date;

-- Backfill from the payload for rows that carry it.
update receivables_uploads
   set source_date = (payload -> 'meta' ->> 'sourceDate')::date
 where source_date is null
   and payload -> 'meta' ->> 'sourceDate' ~ '^\d{4}-\d{2}-\d{2}$';

-- The comparison query: most recent snapshot for a different day.
create index if not exists receivables_uploads_source_date_idx
  on receivables_uploads (source_date desc, uploaded_at desc);
