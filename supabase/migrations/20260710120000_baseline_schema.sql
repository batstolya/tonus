-- Baseline schema (Фаза B, спека architecture-hardening/db-contract).
-- Идемпотентная консолидация root SQL-файлов; источник помечен в секциях.
-- Данные не удаляются; cron — в scripts/db/ (операционно).

-- ══════════ from supabase/schema.sql ══════════
-- Run this in Supabase SQL Editor

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  timezone text default 'Europe/Berlin',
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
do $policy$ begin
  create policy "own profile" on public.profiles using (auth.uid() = id) with check (auth.uid() = id);
exception when duplicate_object then null; end $policy$;

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Import log
create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  period_start date,
  period_end date,
  records_added int default 0,
  imported_at timestamptz default now()
);
alter table public.imports enable row level security;
do $policy$ begin
  create policy "own imports" on public.imports using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Daily metrics (one row per user+date+metric)
create table if not exists public.metrics_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  metric text not null,
  avg_val numeric,
  min_val numeric,
  max_val numeric,
  sum_val numeric,
  count_val int,
  json_val jsonb,
  constraint metrics_daily_unique unique (user_id, date, metric)
);
alter table public.metrics_daily enable row level security;
do $policy$ begin
  create policy "own metrics" on public.metrics_daily using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;
create index if not exists metrics_daily_user_date on public.metrics_daily(user_id, date);

-- Sleep sessions (one row per user+date)
create table if not exists public.sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  bedtime timestamptz,
  wake_time timestamptz,
  duration_hours numeric,
  deep_hours numeric,
  rem_hours numeric,
  core_hours numeric,
  constraint sleep_sessions_unique unique (user_id, date)
);
alter table public.sleep_sessions enable row level security;
do $policy$ begin
  create policy "own sleep" on public.sleep_sessions using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Intake events (coffee, alcohol, meals, etc.)
create table if not exists public.intake_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null,
  type text not null,
  amount numeric,
  unit text,
  note text,
  created_at timestamptz default now()
);
alter table public.intake_events enable row level security;
do $policy$ begin
  create policy "own intake" on public.intake_events using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;
create index if not exists intake_events_user_ts on public.intake_events(user_id, ts);

-- Calendar events (from .ics, cal.com, Google Calendar)
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  uid text not null,
  title text not null,
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  description text,
  location text,
  source text default 'ics',
  constraint calendar_events_unique unique (user_id, uid)
);
alter table public.calendar_events enable row level security;
do $policy$ begin
  create policy "own calendar" on public.calendar_events using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;
create index if not exists calendar_events_user_ts on public.calendar_events(user_id, start_ts);

-- Heart rate samples (last 90 days, for stress map)
create table if not exists public.heart_rate_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null,
  bpm int not null,
  source text,
  constraint hr_samples_unique unique (user_id, ts)
);
alter table public.heart_rate_samples enable row level security;
do $policy$ begin
  create policy "own hr" on public.heart_rate_samples using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;
create index if not exists hr_samples_user_ts on public.heart_rate_samples(user_id, ts);

-- ══════════ from supabase/phase5_supplements.sql ══════════
-- Supplements registry
create table if not exists supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  default_dose text,
  unit text,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table supplements enable row level security;
do $policy$ begin
  create policy "user supplements" on supplements for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Daily supplement logs
create table if not exists supplement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  supplement_id uuid references supplements(id) on delete cascade not null,
  date date not null,
  taken boolean default true,
  dose text,
  note text,
  created_at timestamptz default now(),
  unique(user_id, supplement_id, date)
);

alter table supplement_logs enable row level security;
do $policy$ begin
  create policy "user supplement_logs" on supplement_logs for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- ══════════ from supabase/phase5_labs.sql ══════════
-- Lab files (PDFs and photos)
create table if not exists lab_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  file_name text not null,
  file_path text,
  file_type text,
  date date,
  extracted_text text,
  created_at timestamptz default now()
);

alter table lab_files enable row level security;
do $policy$ begin
  create policy "user lab_files" on lab_files for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Extracted biomarkers for trend charts
create table if not exists lab_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  lab_file_id uuid references lab_files(id) on delete cascade not null,
  marker text not null,
  value numeric,
  unit text,
  date date not null,
  created_at timestamptz default now()
);

alter table lab_results enable row level security;
do $policy$ begin
  create policy "user lab_results" on lab_results for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Supabase Storage bucket (run manually in dashboard or via CLI):
-- insert into storage.buckets (id, name, public) values ('lab-files', 'lab-files', false);
-- do $policy$ begin
  create policy "user lab files storage" on storage.objects for all using (auth.uid()::text = (storage.foldername(name))[1]);
exception when duplicate_object then null; end $policy$;

-- ══════════ from supabase/phase5_chat.sql ══════════
-- Chat sessions
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  period_start date,
  period_end date,
  context_snapshot text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table chat_sessions enable row level security;
do $policy$ begin
  create policy "user chat_sessions" on chat_sessions for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Chat messages
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  session_id uuid references chat_sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tokens_used int,
  created_at timestamptz default now()
);

alter table chat_messages enable row level security;
do $policy$ begin
  create policy "user chat_messages" on chat_messages for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Context notes (daily journal)
create table if not exists context_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  note text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);

alter table context_notes enable row level security;
do $policy$ begin
  create policy "user context_notes" on context_notes for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- ══════════ from supabase/phase7_tables.sql ══════════
-- Telegram links (one per user)
create table if not exists telegram_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  telegram_chat_id text not null,
  telegram_username text,
  status text not null default 'active', -- active | paused
  linked_at timestamptz default now()
);
alter table telegram_links enable row level security;
do $policy$ begin
  create policy "own" on telegram_links using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Saved biweekly reports
create table if not exists scheduled_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  period_start date not null,
  period_end date not null,
  content text not null,
  channel text,
  delivered_at timestamptz,
  created_at timestamptz default now()
);
alter table scheduled_reports enable row level security;
do $policy$ begin
  create policy "own" on scheduled_reports using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Report settings
create table if not exists report_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  paused boolean default false,
  frequency_days integer default 14,
  next_report_at timestamptz
);
alter table report_settings enable row level security;
do $policy$ begin
  create policy "own" on report_settings using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- One-time tokens for linking Telegram account (expires in 10 min)
create table if not exists telegram_link_tokens (
  token text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
-- No RLS needed — only service role uses this table

-- ══════════ from supabase/phase8_tables.sql ══════════
-- AI recommendations
create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  metric text not null,
  text text not null,
  rationale text,
  suggested_target numeric,
  suggested_target_label text,
  status text not null default 'new', -- new | accepted | dismissed | snoozed
  source text default 'ai',
  created_at timestamptz default now()
);
alter table recommendations enable row level security;
do $policy$ begin
  create policy "own" on recommendations using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- User goals
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  metric text not null,
  title text not null,
  baseline_value numeric,
  target_value numeric not null,
  direction text not null, -- up | down | earlier | habit
  start_date date not null default current_date,
  end_date date not null,
  status text not null default 'active', -- active | paused | achieved | failed
  recommendation_id uuid references recommendations(id),
  step_size numeric,
  created_at timestamptz default now()
);
alter table goals enable row level security;
do $policy$ begin
  create policy "own" on goals using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Daily goal progress snapshots (optional, for history)
create table if not exists goal_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  goal_id uuid references goals(id) on delete cascade not null,
  date date not null,
  value numeric,
  on_target boolean,
  created_at timestamptz default now(),
  unique(goal_id, date)
);
alter table goal_progress enable row level security;
do $policy$ begin
  create policy "own" on goal_progress using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- ══════════ from supabase/phase9_tables.sql ══════════
-- Health concerns (список проблем)
create table if not exists health_concerns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text not null default 'other', -- skin | hair | breathing | gut | other
  status text not null default 'active', -- active | improving | resolved
  started_at date,
  notes text,
  created_at timestamptz default now()
);
alter table health_concerns enable row level security;
do $policy$ begin
  create policy "own" on health_concerns using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Observation logs per concern
create table if not exists concern_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  concern_id uuid references health_concerns(id) on delete cascade not null,
  date date not null default current_date,
  severity integer check (severity between 1 and 5),
  note text,
  photo_path text,
  created_at timestamptz default now()
);
alter table concern_logs enable row level security;
do $policy$ begin
  create policy "own" on concern_logs using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Hair entries (monthly check-ins)
create table if not exists hair_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  shedding_level integer check (shedding_level between 1 and 5),
  density_rating integer check (density_rating between 1 and 5),
  hairline_rating integer check (hairline_rating between 1 and 5),
  scalp_note text,
  photo_top text,
  photo_hairline text,
  photo_temples text,
  notes text,
  created_at timestamptz default now(),
  unique(user_id, date)
);
alter table hair_entries enable row level security;
do $policy$ begin
  create policy "own" on hair_entries using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Storage buckets (run separately if needed)
-- insert into storage.buckets (id, name, public) values ('health-photos', 'health-photos', false) on conflict do nothing;

-- ══════════ from supabase/daily-scores.sql ══════════
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
do $policy$ begin
  create policy "user daily_scores" on daily_scores for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;
create index if not exists idx_daily_scores_user_date on daily_scores (user_id, date desc);

-- ══════════ from supabase/ai_usage.sql ══════════
-- AI usage log: tracks all Gemini API calls and token counts
create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  source text not null, -- 'chat', 'analyze', 'extract-lab'
  tokens_used integer,
  created_at timestamptz default now()
);

alter table ai_usage enable row level security;
do $policy$ begin
  create policy "Users see own usage" on ai_usage for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;
do $policy$ begin
  create policy "Users insert own usage" on ai_usage for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- User budget setting
alter table profiles add column if not exists ai_budget_usd numeric(6,2) default 5.00;

-- ══════════ from supabase/ai_analyses.sql ══════════
create table if not exists ai_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  period_start date not null,
  period_end date not null,
  created_at timestamptz default now(),
  summary text not null,
  good jsonb not null default '[]',
  improve jsonb not null default '[]',
  focus jsonb not null default '[]',
  model text not null,
  tokens_used integer
);

alter table ai_analyses enable row level security;
do $policy$ begin
  create policy "users see own analyses" on ai_analyses for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- ══════════ from supabase/ai-prompts.sql ══════════
-- Версионирование промптов (new-speca-refactoring #3).
-- Промпты живут в БД, а не только в коде: можно сравнить версии и понять,
-- почему ответы/отчёты изменились со временем.
create table if not exists ai_prompts (
  id uuid primary key default gen_random_uuid(),
  name text not null,           -- логическое имя промпта (chat-health-system и т.п.)
  version int not null,         -- номер версии
  prompt text not null,
  active boolean not null default true, -- активная версия для этого name
  note text,                    -- что изменилось
  created_at timestamptz default now(),
  unique (name, version)
);

-- общий справочник, читается всеми (RLS — только чтение для авторизованных)
alter table ai_prompts enable row level security;
do $policy$ begin
  create policy "read ai_prompts" on ai_prompts for select using (true);
exception when duplicate_object then null; end $policy$;

-- какая версия промпта использовалась в вызове
alter table ai_usage add column if not exists prompt_version int;

-- ── Сид текущих промптов как версия 1 ──────────────────────────
insert into ai_prompts (name, version, prompt, note) values
('chat-health-system', 1, $p$Ты — персональный ассистент по здоровью. Отвечаешь на русском языке.
Твоя роль: помогать пользователю понять его данные здоровья простым языком.
Строгие правила:
- Никаких медицинских диагнозов. Только наблюдения на основе данных.
- Если в данных есть тревожные значения — мягко рекомендуй обратиться к врачу.
- Не выдумывай данные, которых нет в контексте.
- Отвечай кратко и конкретно (2-4 предложения, если не просят подробнее).
- Опирайся на личные тренды пользователя, а не на абсолютные нормы.$p$, 'initial'),
('telegram-chat-system', 1, $p$Ты — персональный ассистент по здоровью в Telegram. Отвечаешь на русском.
Помогаешь пользователю понять его данные здоровья простым языком.
Строгие правила:
- Никаких медицинских диагнозов. Только наблюдения по данным.
- Если есть тревожные значения — мягко советуй обратиться к врачу.
- Не выдумывай данные, которых нет в контексте.
- Отвечай кратко (2-4 предложения), это мессенджер.
- Опирайся на личные тренды пользователя, не на абсолютные нормы.$p$, 'initial')
on conflict (name, version) do nothing;

-- ══════════ from supabase/autosync.sql ══════════
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
do $policy$ begin
  create policy "user ingest_tokens" on ingest_tokens for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Сырой JSON как пришёл (для отладки/реплея; чистится cron'ом)
create table if not exists ingest_raw (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  received_at timestamptz default now(),
  payload jsonb
);
alter table ingest_raw enable row level security;
do $policy$ begin
  create policy "user ingest_raw" on ingest_raw for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;
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
do $policy$ begin
  create policy "user metrics_daily_staging" on metrics_daily_staging for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

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
do $policy$ begin
  create policy "user sleep_sessions_staging" on sleep_sessions_staging for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- ══════════ from supabase/bot_ai_chat.sql ══════════
-- B3: AI chat in Telegram bot — store conversation session per telegram link
alter table telegram_links add column if not exists tg_session_id uuid;

-- ══════════ from supabase/cal-sync.sql ══════════
-- Per-user cal.com auto-sync config + encrypted credentials.
create table if not exists cal_sync (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  cal_email        text not null,
  cal_password_enc text not null,            -- base64( iv(12B) || AES-GCM ciphertext )
  enabled          boolean not null default true,
  last_sync_at     timestamptz,
  last_status      text,
  event_count      int,
  updated_at       timestamptz not null default now()
);

alter table cal_sync enable row level security;

-- Owner may READ their row (UI selects only non-secret columns; never cal_password_enc).
drop policy if exists "cal_sync owner read" on cal_sync;
do $policy$ begin
  create policy "cal_sync owner read" on cal_sync
  for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- No client insert/update/delete policy on purpose: all writes go through the
-- sync-cal edge function using the service role (bypasses RLS).

-- ══════════ from supabase/coach.sql ══════════
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
do $policy$ begin
  create policy "user coach_profile" on coach_profile for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

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
do $policy$ begin
  create policy "user coach_events" on coach_events for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;
create index if not exists idx_coach_events_user on coach_events (user_id, type, created_at desc);

-- ══════════ from supabase/codex_usage.sql ══════════
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

-- ══════════ from supabase/environment.sql ══════════
-- Environment data table (weather + daylight from Open-Meteo)
-- Run once in Supabase SQL Editor

create table if not exists public.environment_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  temp_c numeric,
  pressure_hpa numeric,
  daylight_minutes int,
  precipitation_mm numeric,
  created_at timestamptz not null default now(),
  unique(user_id, date)
);

alter table public.environment_daily enable row level security;

do $policy$ begin
  create policy "users see own environment" on public.environment_daily for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

create index if not exists environment_daily_user_date_idx on public.environment_daily(user_id, date);

-- ══════════ from supabase/environment-air.sql ══════════
-- Add air quality + pollen to environment_daily (Phase 10c)
-- Run once in Supabase SQL Editor (or via Management API). Applied 2026-06-21.

alter table public.environment_daily add column if not exists air_quality int;   -- European AQI, дневное среднее
alter table public.environment_daily add column if not exists pollen numeric;     -- суммарная пыльца grains/m³, дневное среднее

-- ══════════ from supabase/ideas.sql ══════════
-- Личный «ящик идей» по проекту (через Telegram-бота, /idea и /ideas).
-- Не показывается на сайте. Применено 2026-06-21.

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.ideas enable row level security;

do $policy$ begin
  create policy "users manage own ideas" on public.ideas for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

create index if not exists ideas_user_created_idx on public.ideas(user_id, created_at desc);

-- ══════════ from supabase/lab-ranges.sql ══════════
-- Референсные диапазоны и пометки отклонений для анализов
alter table lab_results add column if not exists ref_range text;
alter table lab_results add column if not exists flag text; -- 'low' | 'high' | 'normal'

-- Алерты (проактивные уведомления) — чтобы не слать одно и то же часто
create table if not exists health_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  created_at timestamptz default now()
);
alter table health_alerts enable row level security;
do $policy$ begin
  create policy "user health_alerts" on health_alerts for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;
create index if not exists idx_health_alerts_user on health_alerts (user_id, type, created_at desc);

-- ══════════ from supabase/meal-nutrition.sql ══════════
-- Оценка калорий и БЖУ для событий-еды (из текста, позже — из фото).
alter table intake_events add column if not exists calories int;
alter table intake_events add column if not exists protein_g real;
alter table intake_events add column if not exists carbs_g real;
alter table intake_events add column if not exists fat_g real;

-- ══════════ from supabase/profile_location.sql ══════════
-- Геолокация пользователя для данных среды (погода/давление/AQI/пыльца через Open-Meteo).
-- Применить один раз в Supabase SQL Editor.
-- Если координаты не заданы — fetch-environment использует Мюнхен по умолчанию.

alter table public.profiles
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists location_label text;

-- ══════════ from supabase/profiles-location.sql ══════════
-- Add weather location to profiles (geolocation / city-search for fetch-environment).
-- Without these columns the Settings "Дані середовища" card errors:
--   "Could not find the 'latitude' column of 'profiles' in the schema cache".
-- Run once in Supabase SQL Editor (or via Management API). Applied 2026-06-22.

alter table public.profiles add column if not exists latitude numeric;        -- широта, из геолокации/поиска города
alter table public.profiles add column if not exists longitude numeric;       -- долгота
alter table public.profiles add column if not exists location_label text;      -- человекочитаемая метка (напр. "Мюнхен")

notify pgrst, 'reload schema';

-- ══════════ from supabase/reminders.sql ══════════
-- ════════════════════════════════════════════════════════════════
-- B3: AI chat session per telegram link
-- ════════════════════════════════════════════════════════════════
alter table telegram_links add column if not exists tg_session_id uuid;

-- ════════════════════════════════════════════════════════════════
-- SPEC-REMINDERS: расписание напоминаний о препаратах (R1–R3)
-- ════════════════════════════════════════════════════════════════

-- Расписание напоминаний по препарату
create table if not exists reminder_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  supplement_id uuid references supplements(id) on delete cascade not null,
  times text[] not null default '{}',          -- ['22:00','08:00'] локальное время
  weekdays int[] not null default '{1,2,3,4,5,6,7}', -- 1=Пн..7=Вс
  timezone text not null default 'Europe/Kyiv',
  snooze_options int[] not null default '{60,120}',  -- минуты
  quiet_until text,                            -- 'HH:MM' позже которого не слать (напр. '23:30')
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, supplement_id)
);

alter table reminder_settings enable row level security;
do $policy$ begin
  create policy "user reminder_settings" on reminder_settings for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Конкретные дозы и их статус доставки
create table if not exists reminder_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  supplement_id uuid references supplements(id) on delete cascade not null,
  due_at timestamptz not null,                 -- запланированное время (UTC)
  status text not null default 'pending'
    check (status in ('pending','sent','taken','snoozed','skipped','missed')),
  snooze_until timestamptz,
  responded_at timestamptz,
  tg_message_id bigint,                         -- id отправленного сообщения (для отмены/правки)
  created_at timestamptz default now(),
  unique(user_id, supplement_id, due_at)
);

alter table reminder_events enable row level security;
do $policy$ begin
  create policy "user reminder_events" on reminder_events for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

create index if not exists idx_reminder_events_due
  on reminder_events (status, due_at);

-- ════════════════════════════════════════════════════════════════
-- SPEC-DAILY-NOTE: вечерний вопрос «как прошёл день» (N1–N4)
-- ════════════════════════════════════════════════════════════════

-- Настройка вечернего вопроса (одна на пользователя)
create table if not exists daily_note_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  time text not null default '21:00',          -- локальное время отправки 'HH:MM'
  timezone text not null default 'Europe/Kyiv',
  enabled boolean not null default false,
  last_sent_date date,                          -- защита от повторной отправки в один день
  updated_at timestamptz default now()
);

alter table daily_note_settings enable row level security;
do $policy$ begin
  create policy "user daily_note_settings" on daily_note_settings for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Состояние диалога: если стоит дата — следующий свободный ответ = заметка дня (N4)
alter table telegram_links add column if not exists awaiting_note_date date;

-- ════════════════════════════════════════════════════════════════
-- Планировщик: pg_cron дёргает edge-функцию send-reminders каждые 5 мин
-- (обрабатывает и напоминания о препаратах, и вечерний вопрос)
-- ════════════════════════════════════════════════════════════════
create extension if not exists pg_net;

-- Удалить старую джобу если есть (чтобы не дублировать при повторном запуске)

-- ══════════ from supabase/research.sql ══════════
-- Архив «дип-ресёрча»: каждый запуск со списком связей и разбором ИИ
create table if not exists research_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  period_days int not null,
  findings jsonb not null default '[]',
  reply text,
  created_at timestamptz default now()
);

alter table research_runs enable row level security;
do $policy$ begin
  create policy "user research_runs" on research_runs for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

create index if not exists idx_research_runs_user on research_runs (user_id, created_at desc);

-- ══════════ from supabase/settings-update.sql ══════════
-- ════════════════════════════════════════════════════════════════
-- Настройки отчёта (частота уже есть: frequency_days) + подробность + B4
-- ════════════════════════════════════════════════════════════════

-- Подробность отчёта: 'short' | 'medium' | 'full'
alter table report_settings add column if not exists detail_level text not null default 'full';

-- B4: слать ли в Telegram чувствительное (анализы/препараты) — по умолчанию только сводка
alter table report_settings add column if not exists send_sensitive boolean not null default false;

-- B4: утренняя сводка самочувствия — выкл по умолчанию
alter table report_settings add column if not exists morning_summary boolean not null default false;
alter table report_settings add column if not exists morning_time text not null default '09:00';
alter table report_settings add column if not exists morning_last_sent date;
alter table report_settings add column if not exists timezone text not null default 'Europe/Kyiv';

-- ══════════ from supabase/supplements_profile_age.sql ══════════
-- Age + sex on profiles, for the AI "ideal supplement timing" feature.
-- Without these columns the supplements page AI schedule errors:
--   "Could not find the 'birth_year' column of 'profiles' in the schema cache".
-- Run once in Supabase SQL Editor (or via Management API).

alter table public.profiles add column if not exists birth_year int;   -- год рождения (для возраста)
alter table public.profiles add column if not exists sex text;          -- 'male' | 'female' | null

notify pgrst, 'reload schema';

-- ══════════ from supabase/wellbeing.sql ══════════
-- Самочувствие 1–5 как субъективный исход дня (вводится из вечернего вопроса в Telegram).
alter table context_notes add column if not exists wellbeing smallint;
-- Разрешаем строку без текстовой заметки (день, где есть только оценка 1–5).
alter table context_notes alter column note drop not null;

