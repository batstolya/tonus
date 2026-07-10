# Операционные SQL-скрипты

Эти файлы НЕ являются миграциями и НЕ применяются при `supabase db reset`:

- `dedup-metrics.sql` — одноразовая деструктивная чистка дублей метрик/сна
  (уже выполнена на проде; хранится как runbook-артефакт).
- `autosync-cron.sql`, `cal-cron.sql`, `coach-cron.sql` — регистрация pg_cron
  jobs. Содержат placeholder-секреты (`REPLACE_WITH_…`): реальные значения
  подставляются вручную при выполнении по security runbook
  (`docs/guides/security-secrets-runbook.md`), в git секреты не попадают.

Постоянный DDL живёт только в `supabase/migrations/`.
