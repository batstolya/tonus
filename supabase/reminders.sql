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
create policy "user reminder_settings" on reminder_settings for all using (auth.uid() = user_id);

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
create policy "user reminder_events" on reminder_events for all using (auth.uid() = user_id);

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
create policy "user daily_note_settings" on daily_note_settings for all using (auth.uid() = user_id);

-- Состояние диалога: если стоит дата — следующий свободный ответ = заметка дня (N4)
alter table telegram_links add column if not exists awaiting_note_date date;

-- ════════════════════════════════════════════════════════════════
-- Планировщик: pg_cron дёргает edge-функцию send-reminders каждые 5 мин
-- (обрабатывает и напоминания о препаратах, и вечерний вопрос)
-- ════════════════════════════════════════════════════════════════
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Удалить старую джобу если есть (чтобы не дублировать при повторном запуске)
select cron.unschedule('send-reminders')
where exists (select 1 from cron.job where jobname = 'send-reminders');

select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
