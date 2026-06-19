-- ИИ-коуч: накопительный профиль пользователя (память поверх 14-дневного окна)
create table if not exists coach_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  summary text,                 -- краткий портрет: кто, цели, привычки, контекст
  facts jsonb not null default '[]',  -- список ключевых фактов (строки)
  focus jsonb,                  -- текущий фокус недели (C3)
  enabled boolean not null default true,
  tone text not null default 'supportive',
  updated_at timestamptz default now()
);

alter table coach_profile enable row level security;
create policy "user coach_profile" on coach_profile for all using (auth.uid() = user_id);

-- Инициативы коуча (для дедупа и follow-up в C2–C5)
create table if not exists coach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,           -- weekly | nudge | focus | followup
  payload jsonb,
  status text default 'sent',
  created_at timestamptz default now()
);
alter table coach_events enable row level security;
create policy "user coach_events" on coach_events for all using (auth.uid() = user_id);
create index if not exists idx_coach_events_user on coach_events (user_id, type, created_at desc);
