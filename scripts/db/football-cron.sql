-- pg_cron jobs для футбольных функций (операционный скрипт, не миграция).
-- Применять по security runbook; проверь, что headers содержат x-cron-secret.

select cron.unschedule('sync-football-fixtures-every-30-min')
where exists (select 1 from cron.job where jobname = 'sync-football-fixtures-every-30-min');

select cron.schedule(
  'sync-football-fixtures-every-30-min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/sync-football-fixtures',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

select cron.unschedule('send-football-reminders-every-5-min')
where exists (select 1 from cron.job where jobname = 'send-football-reminders-every-5-min');

select cron.schedule(
  'send-football-reminders-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/send-football-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
