-- Расписание тренировок (спека 2026-07-11-workout-schedule-design.md §1).
create table if not exists workout_schedule (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekdays int[] not null default '{}',      -- 1=Пн … 7=Вс (конвенция reminder_settings)
  time text not null default '19:00',        -- локальное HH:MM
  notify_hours_before int not null default 4,
  timezone text not null default 'Europe/Kyiv',
  enabled boolean not null default true,
  last_notified_date date,
  created_at timestamptz default now()
);
alter table workout_schedule enable row level security;
do $policy$ begin
  create policy "own workout_schedule" on workout_schedule
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;
