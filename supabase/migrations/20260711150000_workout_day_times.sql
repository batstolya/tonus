-- Время тренировки своё для каждого дня + вид спорта (уточнение спеки §1):
-- day_times: {"1": {"time":"18:45","label":"волейбол"}, "3": {"time":"19:00","label":"футбол"}}
alter table workout_schedule
  add column if not exists day_times jsonb not null default '{}'::jsonb;

-- backfill из старой модели (weekdays[] + одно time), если расписание уже задано
update workout_schedule ws
set day_times = (
  select coalesce(jsonb_object_agg(d::text, jsonb_build_object('time', ws.time)), '{}'::jsonb)
  from unnest(ws.weekdays) as d
)
where ws.day_times = '{}'::jsonb and array_length(ws.weekdays, 1) > 0;
