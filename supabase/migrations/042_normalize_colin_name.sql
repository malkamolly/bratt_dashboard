-- ============================================================================
-- 042_normalize_colin_name.sql
-- ============================================================================
-- Naming convention is First name + last initial (e.g. "Colin H"). "Colin
-- Haave" was added through the admin crew form with a full last name, so fix
-- the stored record. Slug is unaffected (it's a stable id, not the display).
-- ============================================================================

begin;

update field_crew_employees
   set name = 'Colin H'
 where lower(trim(name)) = 'colin haave';

commit;
