# Tonus — Фаза A: инвентаризация production DB (2026-07-10)

Gate-артефакт по спеке `2026-07-09-database-contract-and-migrations-design.md` §3.
Метод: PostgREST OpenAPI + read-only data probes (service key), Supabase CLI
`projects list`. Прямой SQL к pg_catalog недоступен в этой среде (нет Docker/psql,
MCP без access token) — ограничения отмечены ниже.

## Ответы на вопросы спеки (§7)

### 1. `daily_metrics` — это VIEW (не таблица)

Доказательства:
- Значения строки `daily_metrics` за 2026-07-10 **побитно** совпадают с EAV
  `metrics_daily` (rhr 41, hrv 80.35071199560902, steps 1137,
  active_energy 121.32377464952891, o2 0.9629411764705883) — включая все
  десятичные знаки double precision.
- В коде **нет ни одного writer'а** в `daily_metrics` (grep insert/upsert/update
  по src/ и supabase/functions/ — пусто), при этом данные свежие (сегодняшние).
- `daily_metrics` (1009 строк) == `daily_summary` (1009 строк), т.к.
  `daily_summary` — `select … from daily_metrics` (phase7_tables.sql:38).
- День 2026-07-09 присутствует с `sleep_hours: null` → view уже включает дни
  без сна (не inner join по sleep).

Definition view **нигде в репозитории нет** — создан вручную в SQL Editor
(скрытое состояние прода, как и предполагала спека).

### 2. Колонки prod `daily_metrics` vs целевой контракт

Прод (порядок из OpenAPI): `user_id, date, resting_heart_rate, hrv, steps,
active_energy, oxygen_saturation, sleep_hours`.

Отсутствуют против §2.2 спеки: **`wrist_temperature`, `respiratory_rate`**.
Данные в EAV уже есть: `wristTemperature` — 17 строк, `respiratoryRate` — 161
строка (ключ ровно `wristTemperature`, не `wristTemp`). Также в EAV есть ключи
вне wide-модели: `exerciseMinutes` (188), `flightsClimbed`, `distance`,
`heartRate`, `walkingHeartRate` — читаются напрямую из EAV, это допустимо (§3C).

### 3. `security_invoker`

Прод — **Postgres 17.6.1** (`postgres_engine: 17`). `security_invoker` для view
поддерживается (появился в PG 15). Fallback не нужен.

### 4. Materialized view

Не нужен: 1009 строк view / 4522 строк EAV / 508 sleep_sessions — обычный view
с запасом на годы. Пересмотр при заметном multi-user росте.

### 5. Синхронизация migration history

На проде применены 4 миграции из `supabase/migrations/` (football, health_alerts
×2, widget_tokens). Baseline пишется **идемпотентно** (`if not exists`,
`create or replace`, DO-блоки для policies) и добавляется обычной новой
миграцией: на проде `db push` сходится к текущему состоянию без изменения
данных, на пустой БД строит всё с нуля. Repair/backfill history не требуется.

## Фактическое состояние прода

- **57 exposed relations** (полный список — scratchpad `db-inventory/openapi.json`),
  все ожидаемые из root SQL-файлов таблицы существуют → все 33 файла фактически
  применены (в актуальной либо ранней версии).
- **RPC**: 4 футбольные функции (`claim_due_football_reminders`,
  `generate_football_reminders`, `mark_football_reminder_sent/failed`) — уже в
  миграции `20260704200000_football_reminders.sql`.
- **Staging-модели autosync** (`metrics_daily_staging` 301, `sleep_sessions_staging`
  22, `ingest_raw`) — легитимные write-модели HAE-потока (`autosync.sql`,
  используются `ingest-health` и `src/lib/autosync.ts`).
- **Row counts**: metrics_daily 4522, sleep_sessions 508, daily_metrics/summary 1009.
- `src/lib/database.types.ts` — рукописный стаб на 121 строку (~5 таблиц из 57),
  клиент `createClient<any>` — типы фактически не используются.

## Ограничения инвентаризации

Без прямого SQL не сняты: точный текст RLS policies, triggers, список pg_cron
jobs, точный SQL definition views. Компенсация: baseline полностью идемпотентен
и не полагается на предположения о policy-состоянии (drop policy if exists +
create); view пересоздаются `create or replace` с сохранением порядка колонок
прода (см. выше) — при несовпадении порядка Postgres выдаст ошибку, что само по
себе является проверкой.

## Судьба 33 root SQL-файлов (§2.3)

**→ baseline** (DDL, идемпотентный): schema.sql, phase5_chat, phase5_labs,
phase5_supplements, phase7_tables, phase8_tables, phase9_tables, ai-prompts,
ai_analyses, ai_usage, autosync.sql, bot_ai_chat, cal-sync, coach.sql,
codex_usage, daily-scores, environment.sql, environment-air, ideas, lab-ranges,
meal-nutrition, profile_location, profiles-location, research, settings-update,
supplements_profile_age, wellbeing, reminders.sql (DDL-часть),
football-reminders.sql (DDL-часть; RPC уже в миграции).

**→ scripts/ (операционные, НЕ применяются при reset):** dedup-metrics.sql
(деструктивная одноразовая чистка), autosync-cron.sql, cal-cron.sql,
coach-cron.sql, cron-части reminders.sql и football-reminders.sql (содержат
`cron.schedule` с placeholder-секретами → runbook по security-спеке).

**→ archive:** нет чисто исторических файлов; заметки «Applied YYYY-MM-DD»
остаются комментариями в миграции.
