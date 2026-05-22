-- ============================================================================
-- 032_fix_sean_paul_hyphen.sql
-- ============================================================================
-- Sean-Paul's first name is hyphenated. Earlier migrations stored him as
-- "Sean Paul M" (no hyphen) in a few places -- fix those to "Sean-Paul M".
--
-- Also defensively fixes crew_members in case 031 was run with the older
-- (no-hyphen) version of that file before this correction.
-- ============================================================================

update field_crew_employees set name = 'Sean-Paul M' where name = 'Sean Paul M';
update crew_members          set name = 'Sean-Paul M' where name = 'Sean Paul M';
