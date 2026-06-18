-- ════════════════════════════════════════════════════════════════
-- Дедуп metrics_daily: были по 2 ряда на (user_id, date, metric) из-за
-- двух выгрузок (Apple + Xiaomi) и отсутствия рабочего unique-констрейнта.
-- Оставляем самое полное значение (max), затем ставим констрейнт.
-- ════════════════════════════════════════════════════════════════

-- 1) Сохранить схлопнутые значения во временную таблицу
drop table if exists md_dedup;
create temp table md_dedup as
select user_id, date, metric,
       max(sum_val) as sum_val,
       max(avg_val) as avg_val,
       max(min_val) as min_val,
       max(max_val) as max_val
from metrics_daily
group by user_id, date, metric;

-- 2) Очистить и залить уникальные строки
delete from metrics_daily;

insert into metrics_daily (user_id, date, metric, sum_val, avg_val, min_val, max_val)
select user_id, date, metric, sum_val, avg_val, min_val, max_val from md_dedup;

-- 3) Рабочий unique-констрейнт, чтобы апсёрты больше не плодили дубли
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'metrics_daily_unique') then
    alter table metrics_daily add constraint metrics_daily_unique unique (user_id, date, metric);
  end if;
end $$;

drop table if exists md_dedup;

-- ════════════════════════════════════════════════════════════════
-- Дедуп sleep_sessions: были фрагменты/дубли на (user_id, date).
-- Оставляем основной сон — с максимальной длительностью.
-- ════════════════════════════════════════════════════════════════
delete from sleep_sessions s
using sleep_sessions s2
where s.user_id = s2.user_id and s.date = s2.date and s.id <> s2.id
  and (coalesce(s2.duration_hours,0) > coalesce(s.duration_hours,0)
       or (coalesce(s2.duration_hours,0) = coalesce(s.duration_hours,0) and s2.id > s.id));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sleep_sessions_unique') then
    alter table sleep_sessions add constraint sleep_sessions_unique unique (user_id, date);
  end if;
end $$;
