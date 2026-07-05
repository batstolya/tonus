-- Историческая заметка: этот файл задумывался как create table health_alerts
-- для стража здоровья (F1, smart-tonus), но таблица уже существовала —
-- lab-ranges.sql создал её раньше как дедуп-леджер напоминаний
-- (id, user_id, type, created_at). Применение было no-op
-- («already exists, skipping»). Реальное расширение таблицы под стража —
-- в 20260705220000_health_alerts_anomaly.sql.
select 1;
