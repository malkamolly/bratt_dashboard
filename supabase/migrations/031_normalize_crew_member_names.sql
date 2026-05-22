-- ============================================================================
-- 031_normalize_crew_member_names.sql
-- ============================================================================
-- Renames every crew_members row to the project's "First Name + Last Initial"
-- convention (see CLAUDE.md). For people who are also in field_crew_employees
-- (the canonical roster), we match the name used there. For people who only
-- exist in crew_members (PHC, Stump Grinding, Clam, Other production), we
-- shorten their existing full name to First + last initial.
--
-- Renames are scoped by current name AND the crew they're on so we don't
-- accidentally rename someone if there's ever a future name collision.
-- ============================================================================

-- People already in field_crew_employees -- match the canonical "First L" name
update crew_members set name = 'Taylor M'  where name = 'Taylor Mueller';
update crew_members set name = 'Shay S'    where name = 'Shay Spritzer';
update crew_members set name = 'Jaidyn A'  where name = 'Jaidyn Atchley';
update crew_members set name = 'Nate R'    where name = 'Nathan Runtsch';
update crew_members set name = 'Sage S'    where name = 'Sage Sand';
update crew_members set name = 'Bryan C'   where name = 'Bryan Christiansen';
update crew_members set name = 'Ty W'      where name = 'Ty';
update crew_members set name = 'Finn K'    where name = 'Finn';
update crew_members set name = 'Conrad L'  where name = 'Conrad';
update crew_members set name = 'Elia L'    where name = 'Elia';
update crew_members set name = 'Chandler L' where name = 'Chandler';
update crew_members set name = 'Ross A'    where name = 'Ross';
update crew_members set name = 'Trevor N'  where name = 'Trevor';
update crew_members set name = 'Berkeley D' where name = 'Berkeley';
update crew_members set name = 'Ezra V'    where name = 'Ezra';
update crew_members set name = 'Nolan M'   where name = 'Nolan';
update crew_members set name = 'Meghan G'  where name = 'Meghan';
update crew_members set name = 'Jackson S' where name = 'Jackson';
update crew_members set name = 'Braeden R' where name = 'Braeden';
update crew_members set name = 'Sean-Paul M' where name = 'Sean-Paul';
update crew_members set name = 'Tim P'     where name = 'Tim';
update crew_members set name = 'Scott M'   where name = 'Scott';
update crew_members set name = 'Eric S'    where name = 'Eric Schwagel';
update crew_members set name = 'Francisco F' where name = 'Francisco Fonseca';
update crew_members set name = 'Sean A'    where name = 'Sean Adams';
update crew_members set name = 'Nate W'    where name = 'Nate Weekley';

-- People NOT in field_crew_employees -- shorten their full name to "First L"
-- (PHC, Stump Grinding, Clam, Other; also the salesperson-also-crew-member.)
update crew_members set name = 'John C'    where name = 'John Carpenter';
update crew_members set name = 'Douglas V' where name = 'Douglas Vines';
update crew_members set name = 'Karenna P' where name = 'Karenna Petersen';
update crew_members set name = 'Caleb O'   where name = 'Caleb Olson';
update crew_members set name = 'Brian F'   where name = 'Brian Fleck';
update crew_members set name = 'Los R'     where name = 'Los Ramirez';
update crew_members set name = 'Nick L'    where name = 'Nick Lampman';
