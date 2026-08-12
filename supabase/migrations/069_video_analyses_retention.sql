-- ============================================================================
-- 069_video_analyses_retention.sql
-- ============================================================================
-- Auto-delete analyses in `video_analyses` older than 14 days.
--
-- WHY
-- Nothing in the app reads this table — it's written by /api/video-notes/analyze
-- and never listed anywhere — so rows accumulate unread forever. Each one holds a
-- property address and a findings report about a customer's property, so keeping
-- them indefinitely for no purpose is worse than housekeeping: it's customer data
-- with no reader and no expiry.
--
-- WHAT IS *NOT* DELETED
-- Playbook entries. Anything learned by coaching an analysis lives in
-- `arborist_playbook` as its own rows, with no foreign key to this table, so a
-- purge here never removes team knowledge. Verified: nothing references
-- video_analyses.
--
-- WHY IN THE DATABASE RATHER THAN A VERCEL CRON
-- The project is on Vercel Hobby, which allows two cron jobs, and vercel.json
-- already uses both for the daily Slack tags report. pg_cron also keeps a data
-- housekeeping job next to the data, with no route, no shared secret, and no
-- dependence on a deploy being live.
--
-- IF YOU LATER BUILD A "PAST ANALYSES" LIST
-- 14 days becomes the length of that history. Raise the interval below first if
-- you want more, and note the change applies going forward only — rows already
-- purged are gone.
-- ============================================================================

create extension if not exists pg_cron;

-- Re-running this migration must not stack duplicate jobs.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge_old_video_analyses') then
    perform cron.unschedule('purge_old_video_analyses');
  end if;
end $$;

-- Daily at 09:17 UTC — roughly 4am Central, well clear of the working day, and
-- deliberately off the hour so it isn't competing with every other cron job in
-- the world for the same minute.
--
-- Runs as the scheduling role, which bypasses row-level security. That matters:
-- the table has SELECT and INSERT policies only, so no application role can
-- delete from it. Retention is deliberately not something the app can trigger.
--
-- To change the window, edit the interval and re-run this whole file.
-- To stop it entirely: select cron.unschedule('purge_old_video_analyses');
-- To see it: select * from cron.job where jobname = 'purge_old_video_analyses';
-- To check it ran: select * from cron.job_run_details
--                  where jobid = (select jobid from cron.job
--                                 where jobname = 'purge_old_video_analyses')
--                  order by start_time desc limit 10;
select cron.schedule(
  'purge_old_video_analyses',
  '17 9 * * *',
  $$ delete from public.video_analyses where created_at < now() - interval '14 days' $$
);
