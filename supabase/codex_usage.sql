-- Снимок лимитов Codex (как claude_usage). Пишет локальный monitor.py,
-- читает telegram-bot в /usage. Одна строка id=1.
create table if not exists public.codex_usage (
  id int primary key,
  session_pct double precision,        -- primary (5ч)
  session_resets_at timestamptz,
  weekly_pct double precision,         -- secondary (неделя)
  weekly_resets_at timestamptz,
  plan_type text,
  updated_at timestamptz               -- время последнего события лимитов Codex
);
alter table public.codex_usage enable row level security;  -- доступ только service_role
