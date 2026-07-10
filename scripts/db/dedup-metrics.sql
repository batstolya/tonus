-- ════════════════════════════════════════════════════════════════
-- ПОЛНАЯ ОЧИСТКА метрик и сна + констрейнты.
-- Старые значения посчитаны битым парсером (инфляция шагов/сна), а среди
-- дублей «максимум» оставил бы именно битые. Поэтому чистим начисто и
-- перезаливаем экспорт — новый парсер пересчитает ВСЮ историю верно
-- (Apple export.xml содержит все годы), а констрейнт не даст плодить дубли.
--
-- ВАЖНО: после этого SQL ОБЯЗАТЕЛЬНО перезалей export.zip в приложении.
-- ════════════════════════════════════════════════════════════════

delete from metrics_daily;
delete from sleep_sessions;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'metrics_daily_unique') then
    alter table metrics_daily add constraint metrics_daily_unique unique (user_id, date, metric);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sleep_sessions_unique') then
    alter table sleep_sessions add constraint sleep_sessions_unique unique (user_id, date);
  end if;
end $$;
