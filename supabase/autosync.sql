-- Авто-синхронизация Apple Health через Health Auto Export (SPEC-AUTOSYNC).
-- ВСЁ изолировано: боевые metrics_daily / sleep_sessions НЕ трогаются,
-- пока mode='shadow'. Данные идут в staging для сверки.

-- Токен на пользователя (кладётся в URL вебхука HAE)
create table if not exists ingest_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text unique not null,
  mode text not null default 'shadow',   -- 'shadow' | 'live'
  created_at timestamptz default now(),
  last_ingest_at timestamptz,
  last_status text
);
alter table ingest_tokens enable row level security;
create policy "user ingest_tokens" on ingest_tokens for all using (auth.uid() = user_id);

-- Сырой JSON как пришёл (для отладки/реплея; чистится cron'ом)
create table if not exists ingest_raw (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  received_at timestamptz default now(),
  payload jsonb
);
alter table ingest_raw enable row level security;
create policy "user ingest_raw" on ingest_raw for all using (auth.uid() = user_id);
create index if not exists idx_ingest_raw_user on ingest_raw (user_id, received_at desc);

-- Staging-зеркала боевых таблиц
-- зеркало боевой metrics_daily (те же колонки avg/min/max/sum_val)
create table if not exists metrics_daily_staging (
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  metric text not null,
  avg_val real,
  min_val real,
  max_val real,
  sum_val real,
  updated_at timestamptz default now(),
  primary key (user_id, date, metric)
);
alter table metrics_daily_staging enable row level security;
create policy "user metrics_daily_staging" on metrics_daily_staging for all using (auth.uid() = user_id);

create table if not exists sleep_sessions_staging (
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  duration_hours real,
  deep_hours real,
  rem_hours real,
  core_hours real,
  bedtime text,
  wake_time text,
  updated_at timestamptz default now(),
  primary key (user_id, date)
);
alter table sleep_sessions_staging enable row level security;
create policy "user sleep_sessions_staging" on sleep_sessions_staging for all using (auth.uid() = user_id);
