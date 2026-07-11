-- Авто-синк среды (погода/AQI/пыльца/Kp) раз в сутки вместо ручной кнопки.
--
-- Секрет НЕ хранится в репо: миграция создаёт helper, который планирует
-- pg_cron-джобу с переданным секретом (тот же паттерн, что у джоб,
-- заведённых через dashboard). Вызов после db push:
--   select public.schedule_env_sync('<секрет>');  -- через PostgREST rpc
-- Тот же секрет кладётся в env функции: supabase secrets set ENV_CRON_SECRET=…

create or replace function public.schedule_env_sync(p_secret text)
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
begin
  if exists (select 1 from cron.job where jobname = 'fetch-environment-daily') then
    perform cron.unschedule('fetch-environment-daily');
  end if;
  perform cron.schedule(
    'fetch-environment-daily',
    '30 3 * * *',  -- 03:30 UTC ежедневно (после ночного ingest)
    format(
      $job$
      select net.http_post(
        url := 'https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/fetch-environment',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', %L),
        body := '{}'::jsonb
      );
      $job$, p_secret)
  );
end;
$$;

revoke all on function public.schedule_env_sync(text) from public, anon, authenticated;
grant execute on function public.schedule_env_sync(text) to service_role;
