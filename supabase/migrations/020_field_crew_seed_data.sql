-- ============================================================================
-- 020_field_crew_seed_data.sql
-- ============================================================================
-- Seeds the Field Crew Hub with the 33 active crew members migrated from the
-- legacy field_training Jekyll repo. Generated from _employees/*.md.
--
-- Idempotent: every insert uses ON CONFLICT DO NOTHING so re-running this
-- migration after the trainer has edited rows live in Supabase will NOT
-- clobber their changes. To reset, truncate the field_crew_* tables first.
-- ============================================================================


begin;

-- =========================================
-- field_crew_employees
-- =========================================

-- Employee: Andrew M (AM)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('andrew-m', 'AM', 'Andrew M', 'bucket_crew', FALSE, NULL, TRUE, $body$On JS's bucket crew.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Andy L (AL)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('andy-l', 'AL', 'Andy L', 'climber', TRUE, NULL, TRUE, $body$Foreman of a climbing crew. Proficiency on crane is L2; completed the Crane Use Level 2 training. Forwarding-machine / knuckleboom / clam skill levels not yet recorded.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Berkeley D (BER)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('berkeley-d', 'BER', 'Berkeley D', 'bucket_crew', FALSE, NULL, TRUE, $body$On ROS's bucket crew. Skills not yet assessed on master roster.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Braeden R (BR)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('braeden-r', 'BR', 'Braeden R', 'bucket_crew', FALSE, NULL, TRUE, NULL, 0) ON CONFLICT DO NOTHING;

-- Employee: Bryan C (BC)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('bryan-c', 'BC', 'Bryan C', 'climber', FALSE, NULL, TRUE, NULL, 0) ON CONFLICT DO NOTHING;

-- Employee: Chandler L (CHL)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('chandler-l', 'CHL', 'Chandler L', 'climber', FALSE, NULL, TRUE, $body$On COL's climbing crew.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Charles P (CP)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('charles-p', 'CP', 'Charles P', 'equipment_operator', FALSE, NULL, TRUE, NULL, 0) ON CONFLICT DO NOTHING;

-- Employee: Conrad L (COL)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('conrad-l', 'COL', 'Conrad L', 'climber', TRUE, NULL, TRUE, $body$Foreman of a climbing crew.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Elia L (EL)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('elia-l', 'EL', 'Elia L', 'climber', FALSE, NULL, TRUE, $body$On COL's climbing crew.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Eric S (ERI)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('eric-s', 'ERI', 'Eric S', 'equipment_operator', FALSE, NULL, TRUE, $body$Equipment operator — primary work is the clam and knuckleboom.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Ezra V (EZR)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('ezra-v', 'EZR', 'Ezra V', 'equipment_operator', TRUE, NULL, TRUE, $body$Equipment operator — primary work is the clam.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Finn K (FK)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('finn-k', 'FK', 'Finn K', 'climber', FALSE, NULL, TRUE, NULL, 0) ON CONFLICT DO NOTHING;

-- Employee: Francisco F (FRA)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('francisco-f', 'FRA', 'Francisco F', 'equipment_operator', FALSE, NULL, TRUE, $body$Equipment operator — primary work is the clam.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Jackson S (JS)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('jackson-s', 'JS', 'Jackson S', 'bucket_crew', TRUE, NULL, TRUE, $body$Foreman of a bucket crew.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Jaidyn A (JA)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('jaidyn-a', 'JA', 'Jaidyn A', 'bucket_crew', FALSE, NULL, TRUE, NULL, 0) ON CONFLICT DO NOTHING;

-- Employee: Meghan G (MG)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('meghan-g', 'MG', 'Meghan G', 'nifty_crew', FALSE, NULL, TRUE, NULL, 0) ON CONFLICT DO NOTHING;

-- Employee: Nate R (NR)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('nate-r', 'NR', 'Nate R', 'climber', TRUE, NULL, TRUE, $body$Foreman of a climbing crew.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Nate W (NW)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('nate-w', 'NW', 'Nate W', 'nifty_crew', FALSE, NULL, TRUE, $body$On SB's nifty crew.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Nick H (NH)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('nick-h', 'NH', 'Nick H', 'unassigned', FALSE, NULL, TRUE, NULL, 0) ON CONFLICT DO NOTHING;

-- Employee: Nick S (NS)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('nick-s', 'NS', 'Nick S', 'equipment_operator', FALSE, NULL, TRUE, NULL, 0) ON CONFLICT DO NOTHING;

-- Employee: Nolan M (NM)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('nolan-m', 'NM', 'Nolan M', 'nifty_crew', FALSE, NULL, TRUE, $body$On SB's nifty crew.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Ross A (ROS)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('ross-a', 'ROS', 'Ross A', 'bucket_crew', TRUE, NULL, TRUE, $body$Foreman of a bucket crew.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Roy P (ROY)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('roy-p', 'ROY', 'Roy P', 'unassigned', FALSE, NULL, FALSE, $body$On SPM's crew. Skills not yet assessed on master roster; position to verify.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Sage S (SAS)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('sage-s', 'SAS', 'Sage S', 'climber', FALSE, NULL, TRUE, $body$On AL's climbing crew.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Scott M (SM)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('scott-m', 'SM', 'Scott M', 'unassigned', FALSE, NULL, TRUE, NULL, 0) ON CONFLICT DO NOTHING;

-- Employee: Sean A (SA)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('sean-a', 'SA', 'Sean A', 'equipment_operator', FALSE, NULL, TRUE, NULL, 0) ON CONFLICT DO NOTHING;

-- Employee: Sean B (SB)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('sean-b', 'SB', 'Sean B', 'nifty_crew', TRUE, NULL, TRUE, $body$Foreman of a nifty crew.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Sean Paul M (SPM)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('sean-paul-m', 'SPM', 'Sean Paul M', 'equipment_operator', TRUE, NULL, TRUE, $body$Foreman with cross-discipline ratings (bucket / nifty / climber / crane / knuckleboom). Primary crew assignment pending — appears in the "Needs Primary Position" section on the homepage until set.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Shay S (SHS)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('shay-s', 'SHS', 'Shay S', 'bucket_crew', FALSE, NULL, TRUE, $body$Position inferred from crew assignment under TM. Skills not yet assessed on master roster.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Taylor M (TM)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('taylor-m', 'TM', 'Taylor M', 'bucket_crew', TRUE, NULL, TRUE, $body$Foreman. Master roster shows cross-training across bucket + nifty crews; primary position recorded as `bucket_crew`, change to `nifty_crew` if that's a closer fit.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Tim P (TP)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('tim-p', 'TP', 'Tim P', 'unassigned', FALSE, NULL, TRUE, NULL, 0) ON CONFLICT DO NOTHING;

-- Employee: Trevor N (TRE)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('trevor-n', 'TRE', 'Trevor N', 'bucket_crew', FALSE, NULL, TRUE, $body$On ROS's bucket crew.$body$, 0) ON CONFLICT DO NOTHING;

-- Employee: Ty W (TW)
INSERT INTO field_crew_employees (slug, code, name, position_key, leads_crew, hire_date, active, notes, display_order) VALUES ('ty-w', 'TW', 'Ty W', 'climber', FALSE, NULL, TRUE, NULL, 0) ON CONFLICT DO NOTHING;

-- =========================================
-- field_crew_employee_specialties
-- =========================================

-- Employee: Charles P (CP)
INSERT INTO field_crew_employee_specialties (employee_slug, specialty_key) VALUES ('charles-p', 'crane') ON CONFLICT DO NOTHING;

-- Employee: Eric S (ERI)
INSERT INTO field_crew_employee_specialties (employee_slug, specialty_key) VALUES ('eric-s', 'clam') ON CONFLICT DO NOTHING;

-- Employee: Francisco F (FRA)
INSERT INTO field_crew_employee_specialties (employee_slug, specialty_key) VALUES ('francisco-f', 'clam') ON CONFLICT DO NOTHING;

-- Employee: Nick S (NS)
INSERT INTO field_crew_employee_specialties (employee_slug, specialty_key) VALUES ('nick-s', 'crane') ON CONFLICT DO NOTHING;

-- Employee: Sean A (SA)
INSERT INTO field_crew_employee_specialties (employee_slug, specialty_key) VALUES ('sean-a', 'clam') ON CONFLICT DO NOTHING;

-- Employee: Sean Paul M (SPM)
INSERT INTO field_crew_employee_specialties (employee_slug, specialty_key) VALUES ('sean-paul-m', 'knuckleboom') ON CONFLICT DO NOTHING;

-- =========================================
-- field_crew_employee_skills
-- =========================================

-- Employee: Andrew M (AM)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('andrew-m', 'bucket_pruning', 1) ON CONFLICT DO NOTHING;

-- Employee: Andy L (AL)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('andy-l', 'bucket_removal', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('andy-l', 'bucket_pruning', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('andy-l', 'nifty_removal', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('andy-l', 'nifty_pruning', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('andy-l', 'climber_removal', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('andy-l', 'climber_pruning', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('andy-l', 'crane_proficiency', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('andy-l', 'steel_cables', 3) ON CONFLICT DO NOTHING;

-- Employee: Bryan C (BC)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('bryan-c', 'climber_pruning', 1) ON CONFLICT DO NOTHING;

-- Employee: Chandler L (CHL)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('chandler-l', 'climber_pruning', 1) ON CONFLICT DO NOTHING;

-- Employee: Conrad L (COL)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('conrad-l', 'bucket_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('conrad-l', 'bucket_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('conrad-l', 'nifty_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('conrad-l', 'nifty_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('conrad-l', 'climber_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('conrad-l', 'climber_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('conrad-l', 'crane_proficiency', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('conrad-l', 'steel_cables', 2) ON CONFLICT DO NOTHING;

-- Employee: Elia L (EL)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('elia-l', 'climber_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('elia-l', 'climber_pruning', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('elia-l', 'steel_cables', 1) ON CONFLICT DO NOTHING;

-- Employee: Eric S (ERI)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('eric-s', 'knuckleboom', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('eric-s', 'clam', 3) ON CONFLICT DO NOTHING;

-- Employee: Ezra V (EZR)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('ezra-v', 'clam', 3) ON CONFLICT DO NOTHING;

-- Employee: Francisco F (FRA)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('francisco-f', 'clam', 3) ON CONFLICT DO NOTHING;

-- Employee: Jackson S (JS)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jackson-s', 'bucket_removal', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jackson-s', 'bucket_pruning', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jackson-s', 'nifty_removal', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jackson-s', 'nifty_pruning', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jackson-s', 'climber_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jackson-s', 'climber_pruning', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jackson-s', 'crane_proficiency', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jackson-s', 'steel_cables', 3) ON CONFLICT DO NOTHING;

-- Employee: Jaidyn A (JA)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jaidyn-a', 'bucket_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jaidyn-a', 'bucket_pruning', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jaidyn-a', 'nifty_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jaidyn-a', 'nifty_pruning', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jaidyn-a', 'climber_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jaidyn-a', 'climber_pruning', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('jaidyn-a', 'steel_cables', 1) ON CONFLICT DO NOTHING;

-- Employee: Nate R (NR)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-r', 'bucket_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-r', 'bucket_pruning', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-r', 'nifty_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-r', 'nifty_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-r', 'climber_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-r', 'climber_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-r', 'steel_cables', 1) ON CONFLICT DO NOTHING;

-- Employee: Nate W (NW)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-w', 'bucket_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-w', 'bucket_pruning', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-w', 'nifty_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-w', 'nifty_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-w', 'climber_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-w', 'climber_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-w', 'crane_proficiency', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nate-w', 'steel_cables', 1) ON CONFLICT DO NOTHING;

-- Employee: Nolan M (NM)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nolan-m', 'bucket_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nolan-m', 'bucket_pruning', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nolan-m', 'nifty_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nolan-m', 'nifty_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nolan-m', 'climber_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nolan-m', 'climber_pruning', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('nolan-m', 'steel_cables', 1) ON CONFLICT DO NOTHING;

-- Employee: Ross A (ROS)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('ross-a', 'bucket_removal', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('ross-a', 'bucket_pruning', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('ross-a', 'nifty_removal', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('ross-a', 'nifty_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('ross-a', 'climber_removal', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('ross-a', 'climber_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('ross-a', 'crane_proficiency', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('ross-a', 'steel_cables', 3) ON CONFLICT DO NOTHING;

-- Employee: Sage S (SAS)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sage-s', 'nifty_pruning', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sage-s', 'climber_pruning', 1) ON CONFLICT DO NOTHING;

-- Employee: Sean B (SB)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-b', 'bucket_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-b', 'bucket_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-b', 'nifty_removal', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-b', 'nifty_pruning', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-b', 'climber_removal', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-b', 'climber_pruning', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-b', 'crane_proficiency', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-b', 'steel_cables', 3) ON CONFLICT DO NOTHING;

-- Employee: Sean Paul M (SPM)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-paul-m', 'bucket_removal', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-paul-m', 'bucket_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-paul-m', 'nifty_removal', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-paul-m', 'nifty_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-paul-m', 'climber_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-paul-m', 'climber_pruning', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-paul-m', 'crane_proficiency', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-paul-m', 'steel_cables', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('sean-paul-m', 'knuckleboom', 2) ON CONFLICT DO NOTHING;

-- Employee: Taylor M (TM)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('taylor-m', 'bucket_removal', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('taylor-m', 'bucket_pruning', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('taylor-m', 'nifty_removal', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('taylor-m', 'nifty_pruning', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('taylor-m', 'climber_removal', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('taylor-m', 'climber_pruning', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('taylor-m', 'crane_proficiency', 3) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('taylor-m', 'steel_cables', 3) ON CONFLICT DO NOTHING;

-- Employee: Trevor N (TRE)
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('trevor-n', 'bucket_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('trevor-n', 'bucket_pruning', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('trevor-n', 'climber_removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('trevor-n', 'climber_pruning', 2) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_skills (employee_slug, skill_key, level) VALUES ('trevor-n', 'steel_cables', 1) ON CONFLICT DO NOTHING;

-- =========================================
-- field_crew_employee_trainings
-- =========================================

-- Employee: Andy L (AL)
INSERT INTO field_crew_employee_trainings (employee_slug, training_key, completed, card_received, hours, last_updated, status, notes) VALUES ('andy-l', 'cdl', NULL, NULL, NULL, NULL, 'completed_date_tbd', NULL) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_trainings (employee_slug, training_key, completed, card_received, hours, last_updated, status, notes) VALUES ('andy-l', 'medical_examiners_certificate', NULL, NULL, NULL, NULL, 'card_pending', NULL) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_trainings (employee_slug, training_key, completed, card_received, hours, last_updated, status, notes) VALUES ('andy-l', 'first_aid_cpr', NULL, NULL, NULL, NULL, 'completed_date_tbd', NULL) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_trainings (employee_slug, training_key, completed, card_received, hours, last_updated, status, notes) VALUES ('andy-l', 'forwarding_machine', NULL, NULL, NULL, NULL, 'completed_date_tbd', NULL) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_trainings (employee_slug, training_key, completed, card_received, hours, last_updated, status, notes) VALUES ('andy-l', 'ground_ops_1', NULL, NULL, NULL, NULL, 'completed_date_tbd', NULL) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_trainings (employee_slug, training_key, completed, card_received, hours, last_updated, status, notes) VALUES ('andy-l', 'ground_ops_2', NULL, NULL, NULL, NULL, 'completed_date_tbd', NULL) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_trainings (employee_slug, training_key, completed, card_received, hours, last_updated, status, notes) VALUES ('andy-l', 'ground_ops_3', NULL, NULL, NULL, NULL, 'completed_date_tbd', NULL) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_trainings (employee_slug, training_key, completed, card_received, hours, last_updated, status, notes) VALUES ('andy-l', 'ground_ops_4', NULL, NULL, NULL, NULL, 'completed_date_tbd', NULL) ON CONFLICT DO NOTHING;
INSERT INTO field_crew_employee_trainings (employee_slug, training_key, completed, card_received, hours, last_updated, status, notes) VALUES ('andy-l', 'crane_use_level_2', NULL, NULL, NULL, NULL, 'completed_date_tbd', NULL) ON CONFLICT DO NOTHING;

-- =========================================
-- field_crew_activity
-- =========================================

-- Employee: Andrew M (AM)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('andrew-m', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Andy L (AL)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('andy-l', '2026-05-13', 'Onboarded to tracker. Hire date, saw hours, and cert completion dates pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Berkeley D (BER)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('berkeley-d', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Braeden R (BR)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('braeden-r', '2026-05-14', 'Onboarded to tracker. Hire date, skills, and trainings pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Bryan C (BC)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('bryan-c', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Chandler L (CHL)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('chandler-l', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Charles P (CP)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('charles-p', '2026-05-14', 'Specialty: Crane operator.') ON CONFLICT DO NOTHING;
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('charles-p', '2026-05-14', 'Onboarded to tracker. Hire date, skills, and trainings pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Conrad L (COL)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('conrad-l', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Elia L (EL)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('elia-l', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Eric S (ERI)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('eric-s', '2026-05-14', 'Specialty: Clam operator.') ON CONFLICT DO NOTHING;
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('eric-s', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Ezra V (EZR)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('ezra-v', '2026-05-14', 'Promoted to Foreman.') ON CONFLICT DO NOTHING;
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('ezra-v', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Finn K (FK)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('finn-k', '2026-05-14', 'Onboarded to tracker. Hire date, skills, and trainings pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Francisco F (FRA)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('francisco-f', '2026-05-14', 'Specialty: Clam operator.') ON CONFLICT DO NOTHING;
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('francisco-f', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Jackson S (JS)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('jackson-s', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Jaidyn A (JA)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('jaidyn-a', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Meghan G (MG)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('meghan-g', '2026-05-14', 'Onboarded to tracker. Hire date, skills, and trainings pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Nate R (NR)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('nate-r', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Nate W (NW)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('nate-w', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Nick H (NH)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('nick-h', '2026-05-14', 'Onboarded to tracker. Hire date, skills, and trainings pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Nick S (NS)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('nick-s', '2026-05-14', 'Specialty: Crane operator.') ON CONFLICT DO NOTHING;
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('nick-s', '2026-05-14', 'Onboarded to tracker. Hire date, skills, and trainings pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Nolan M (NM)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('nolan-m', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Ross A (ROS)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('ross-a', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Roy P (ROY)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('roy-p', '2026-05-15', 'Marked inactive.') ON CONFLICT DO NOTHING;
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('roy-p', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Sage S (SAS)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('sage-s', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Scott M (SM)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('scott-m', '2026-05-14', 'Onboarded to tracker. Hire date, skills, and trainings pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Sean A (SA)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('sean-a', '2026-05-14', 'Specialty: Clam operator.') ON CONFLICT DO NOTHING;
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('sean-a', '2026-05-14', 'Onboarded to tracker. Hire date, skills, and trainings pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Sean B (SB)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('sean-b', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Sean Paul M (SPM)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('sean-paul-m', '2026-05-14', 'Assigned: position → Equipment Operator, KB Foreman (knuckleboom specialty).') ON CONFLICT DO NOTHING;
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('sean-paul-m', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Shay S (SHS)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('shay-s', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Taylor M (TM)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('taylor-m', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Tim P (TP)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('tim-p', '2026-05-14', 'Onboarded to tracker. Hire date, skills, and trainings pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Trevor N (TRE)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('trevor-n', '2026-05-13', 'Onboarded from master roster spreadsheet (2025-10-13). Certifications and hire date pending entry.') ON CONFLICT DO NOTHING;

-- Employee: Ty W (TW)
INSERT INTO field_crew_activity (employee_slug, occurred_on, description) VALUES ('ty-w', '2026-05-14', 'Onboarded to tracker. Hire date, skills, and trainings pending entry.') ON CONFLICT DO NOTHING;

commit;
