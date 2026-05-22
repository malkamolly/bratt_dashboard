-- ============================================================================
-- 033_unify_crew_tables_phase2.sql
-- ============================================================================
-- PHASE 2 cleanup of the crew_members → field_crew_employees merge.
--
-- ⚠️ ORDER MATTERS:
--   1. Apply migration 032_unify_crew_tables_phase1.sql
--   2. Deploy the application code that reads/writes employee_slug
--   3. Confirm the dashboard works end-to-end
--   4. THEN apply this migration
--
-- After this migration runs there is no path back to crew_members.
--
-- What this does:
--   1. Drop crew_member_id columns from the three downstream tables.
--   2. Drop the crew_members table itself.
-- ============================================================================

begin;

-- 1. Drop legacy crew_member_id FK columns. The new employee_slug columns
--    (added in 032) are already NOT NULL and indexed.
alter table production_member_entries
  drop column if exists crew_member_id;

alter table production_member_historicals
  drop column if exists crew_member_id;

alter table sales_addon_attributions
  drop column if exists crew_member_id;

-- 2. Drop the legacy table. No remaining FKs reference it after step 1.
drop table if exists crew_members;

commit;
