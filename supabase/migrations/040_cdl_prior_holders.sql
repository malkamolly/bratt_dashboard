-- ============================================================================
-- 040_cdl_prior_holders.sql
-- ============================================================================
-- Crew who already hold a CDL (obtained before this system existed). We mark
-- the CDL training as completed but with NO date on file — exact dates are
-- unknown — using status 'completed_date_tbd', which the UI now reads as
-- "Completed". These folks aren't put on the active tracker (they're done).
--
-- "Caleb" from the source list isn't a field-crew employee, so he's omitted.
-- ============================================================================

begin;

insert into field_crew_employee_trainings
  (employee_slug, training_key, completed, status, last_updated)
values
  ('francisco-f',  'cdl', null, 'completed_date_tbd', current_date),
  ('eric-s',       'cdl', null, 'completed_date_tbd', current_date),
  ('charles-p',    'cdl', null, 'completed_date_tbd', current_date),
  ('nick-s',       'cdl', null, 'completed_date_tbd', current_date),
  ('taylor-m',     'cdl', null, 'completed_date_tbd', current_date),
  ('jaidyn-a',     'cdl', null, 'completed_date_tbd', current_date),
  ('sean-paul-m',  'cdl', null, 'completed_date_tbd', current_date),
  ('ross-a',       'cdl', null, 'completed_date_tbd', current_date),
  ('ezra-v',       'cdl', null, 'completed_date_tbd', current_date),
  ('jackson-s',    'cdl', null, 'completed_date_tbd', current_date)
on conflict (employee_slug, training_key) do update
  set status       = 'completed_date_tbd',
      last_updated = current_date;

commit;
