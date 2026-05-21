-- ============================================================================
-- 026_avant_528_use_forwarding_machine.sql
-- ============================================================================
-- Re-target the Avant 528 Operator training module so passing the test
-- completes the existing 'forwarding_machine' training instead of a
-- standalone 'avant_528_operator' line. The module + test stay; only the
-- catalog mapping changes.
-- ============================================================================

begin;

-- 1. Point the module at the existing training key ---------------------------
update field_crew_training_modules
   set training_key = 'forwarding_machine'
 where slug = 'avant_528_operator';

-- 2. Clean up any employee_trainings rows that referenced the old key.
--    (Defensive — no one has passed yet, so likely zero rows.)
delete from field_crew_employee_trainings
 where training_key = 'avant_528_operator';

-- 3. Drop the now-deprecated catalog entry -----------------------------------
delete from field_crew_trainings
 where key = 'avant_528_operator';

commit;
