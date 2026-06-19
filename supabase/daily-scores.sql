-- Вычисленные дневные оценки + персональная базовая линия (rolling 30d).
-- Единый источник: дашборд, коуч, ИИ-контекст читают отсюда, а не считают
-- каждый по-своему (см. new-speca-refactoring #4).
create table if not exists daily_scores (
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  readiness int,        -- 0-100 готовность
  sleep_score int,      -- 0-100
  recovery_score int,   -- 0-100 (HRV+пульс покоя относительно нормы)
  stress_score int,     -- 0-100 (выше = больше нагрузка)
  hrv_baseline real,    -- персональная норма (30 дней до этого дня)
  rhr_baseline real,
  sleep_baseline real,
  steps_baseline real,
  updated_at timestamptz default now(),
  primary key (user_id, date)
);

alter table daily_scores enable row level security;
create policy "user daily_scores" on daily_scores for all using (auth.uid() = user_id);
create index if not exists idx_daily_scores_user_date on daily_scores (user_id, date desc);
