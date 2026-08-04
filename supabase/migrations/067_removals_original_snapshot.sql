-- ============================================================================
-- 067_removals_original_snapshot.sql
-- Remember each job's ORIGINAL field values, so the UI can flag which fields a
-- person adjusted (not just price — DBH, height, crown, species, etc.).
--
-- Price already tracks this via original_price / adjusted_price; this adds the
-- same idea for the other fields, in one JSONB snapshot per row.
--
-- Backfill note: for rows that were ALREADY edited before this migration runs,
-- the snapshot captures their current (edited) values, so those specific earlier
-- edits won't show retroactively. Everything edited from here on is tracked.
-- ============================================================================

alter table removals add column if not exists original jsonb;

update removals
set original = jsonb_build_object(
  'dbh',     dbh,
  'height',  height,
  'crown',   crown,
  'stems',   stems,
  'species', species,
  'seller',  seller,
  'date',    to_char(date, 'YYYY-MM-DD'),
  'haul',    haul,
  'muni',    muni
)
where original is null;
