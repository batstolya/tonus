-- Daily cal.com sync at 05:00 UTC.
-- Replace REPLACE_WITH_CRON_SECRET with the CRON_SECRET set in Edge Function secrets.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('cal-sync-daily')
where exists (select 1 from cron.job where jobname = 'cal-sync-daily');

select cron.schedule(
  'cal-sync-daily',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/sync-cal',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'REPLACE_WITH_CRON_SECRET'),
    body := '{}'::jsonb
  );
  $$
);
