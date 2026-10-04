-- ============================================================================
-- Attendance reminders: run the "attendance-reminders" function every minute.
--
-- Run this ONCE in Supabase → SQL Editor, AFTER deploying the function
-- (Edge Functions → attendance-reminders, with "Verify JWT" turned off).
-- Safe to run again; it replaces the old schedule rather than adding a second.
--
-- Each run is tiny: it asks the database "did any class just start that
-- takes attendance and hasn't been reminded?" and almost always gets "no".
-- To stop reminders entirely:
--   select cron.unschedule('tnbbi-attendance-reminders');
-- ============================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'tnbbi-attendance-reminders';

select cron.schedule(
  'tnbbi-attendance-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://qcxtfrfpldprblukybao.supabase.co/functions/v1/attendance-reminders',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Old run records pile up; keep only the last week of them.
select cron.unschedule(jobid) from cron.job where jobname = 'tnbbi-cron-cleanup';
select cron.schedule(
  'tnbbi-cron-cleanup',
  '17 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days' $$
);
