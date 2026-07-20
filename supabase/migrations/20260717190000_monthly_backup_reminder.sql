-- Monthly offsite-backup reminder to the owner's Telegram (ops-reminder fn).
-- Same secret-passing pattern as schedule_env_sync (20260711150000): the
-- migration only creates the helper; the secret is supplied after db push:
--   select public.schedule_backup_reminder('<secret>');  -- via PostgREST rpc
-- The same secret goes to the function env: supabase secrets set OPS_CRON_SECRET=...
--
-- Edge functions to deploy after this migration: ops-reminder.

create or replace function public.schedule_backup_reminder(p_secret text)
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
begin
  if exists (select 1 from cron.job where jobname = 'ops-backup-reminder-monthly') then
    perform cron.unschedule('ops-backup-reminder-monthly');
  end if;
  perform cron.schedule(
    'ops-backup-reminder-monthly',
    '0 8 1 * *',  -- 1st of month, 08:00 UTC (09:00-10:00 Berlin)
    format(
      $job$
      select net.http_post(
        url := 'https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/ops-reminder',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', %L),
        body := '{}'::jsonb
      );
      $job$, p_secret)
  );
end;
$$;

revoke all on function public.schedule_backup_reminder(text) from public, anon, authenticated;
grant execute on function public.schedule_backup_reminder(text) to service_role;
