-- iPhone-виджет readiness (F4, spec: 2026-07-05-smart-tonus-design.md).
-- Отдельные токены (не расширяем права ingest-токена): долгоживущий токен
-- для GET widget-data. Выдаётся командой /widget в telegram-bot.
-- После применения задеплоить: widget-data (--no-verify-jwt), telegram-bot.

create table if not exists public.widget_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

-- RLS включён, политик нет: доступ только через service role
-- (widget-data и telegram-bot); клиентскому коду таблица не нужна.
alter table public.widget_tokens enable row level security;
