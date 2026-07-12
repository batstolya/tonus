-- Инцидент 2026-07-11 ~20:00 UTC: reminder_events_status_check в проде не
-- содержит статусов delivery-механики ('processing','failed','delivery_unknown',
-- миграция 20260710150000 добавила колонки и RPC, но НЕ расширила констрейнт).
-- Каждый claim_due_reminder_events падал с 23514 и откатывался: напоминания
-- зависали в pending с attempt_count=0 без единой ошибки в данных.
-- После применения: задеплоенный send-reminders начинает доставлять на
-- следующем 5-минутном тике; отдельного деплоя функций не требуется.

alter table reminder_events drop constraint if exists reminder_events_status_check;
alter table reminder_events add constraint reminder_events_status_check
  check (status in (
    'pending', 'processing', 'sent', 'taken',
    'snoozed', 'skipped', 'missed', 'failed', 'delivery_unknown'
  ));
