-- A6: чистка сырых полезных нагрузок старше 30 дней (раз в сутки в 04:00 UTC).
create extension if not exists pg_cron;

select cron.unschedule('ingest-raw-cleanup')
where exists (select 1 from cron.job where jobname = 'ingest-raw-cleanup');

select cron.schedule(
  'ingest-raw-cleanup',
  '0 4 * * *',
  $$ delete from ingest_raw where received_at < now() - interval '30 days'; $$
);
