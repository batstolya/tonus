-- Еженедельный разбор коуча: воскресенье 20:00 Киев (17:00 UTC летом)
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('coach-weekly')
where exists (select 1 from cron.job where jobname = 'coach-weekly');

select cron.schedule(
  'coach-weekly',
  '0 17 * * 0',
  $$
  select net.http_post(
    url := 'https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/coach-weekly',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
