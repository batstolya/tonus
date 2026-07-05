-- Страж здоровья (F1, spec: 2026-07-05-smart-tonus-design.md).
-- health_alerts уже существует как дедуп-леджер напоминаний (lab-ranges.sql:
-- id, user_id, type, created_at). Расширяем её под полноценные алерты стража:
-- легаси-строки остаются валидными (новые колонки nullable), записи стража
-- имеют type='anomaly' и заполненные level/findings/message.
-- После применения задеплоить: ingest-health (ОБЯЗАТЕЛЬНО с --no-verify-jwt)
-- и send-reminders (из него убран дублирующий rhr_rise-чек).

alter table public.health_alerts add column if not exists date date;
alter table public.health_alerts add column if not exists level text
  check (level is null or level in ('yellow', 'red'));
alter table public.health_alerts add column if not exists findings jsonb;
alter table public.health_alerts add column if not exists message text;
alter table public.health_alerts add column if not exists acknowledged_at timestamptz;

-- Баннер в вебе: последний незакрытый алерт стража (селект по user+type+created).
-- Индекс (user_id, type, created_at desc) уже есть — idx_health_alerts_user.
