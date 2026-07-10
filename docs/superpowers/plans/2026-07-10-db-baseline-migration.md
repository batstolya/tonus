# DB Baseline Migration (Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One idempotent baseline migration that builds the full current schema on an empty DB and safely converges on production; root SQL files retired into the migration or `scripts/db/`.

**Architecture:** New migration `supabase/migrations/20260710120000_baseline_schema.sql` assembled from the 28 DDL root files (per-file fates fixed in the Phase A inventory), with `cron.schedule`/destructive ops excluded, `create policy` made idempotent via DO-blocks, and canonical `daily_metrics` view (security_invoker, prod column order + appended `wrist_temperature`, `respiratory_rate`) + `daily_summary` compat alias defined last. Operational scripts move to `scripts/db/`.

**Tech Stack:** Postgres 17 (prod), Supabase CLI (linked, no Docker locally — empty-DB reset verified later in CI/with Docker), vitest for repo checks.

**Source spec:** `docs/superpowers/specs/architecture-hardening/2026-07-09-database-contract-and-migrations-design.md` (Фазы A+B only; C по мере касания; D отложена кроме разовой генерации типов).
**Gate artifact:** `docs/superpowers/specs/architecture-hardening/2026-07-10-db-inventory.md` — file fates, prod facts, view evidence.

---

### Task 1: Branch + commit inventory

- [ ] `git checkout main && git checkout -b feature/db-baseline`
- [ ] `git add docs/superpowers/specs/architecture-hardening/2026-07-10-db-inventory.md docs/superpowers/plans/2026-07-10-db-baseline-migration.md && git commit -m "docs(db): phase A inventory + baseline plan"`

### Task 2: Move operational scripts out of supabase/

**Files:** create `scripts/db/`, git mv: `dedup-metrics.sql`, `autosync-cron.sql`, `cal-cron.sql`, `coach-cron.sql` → `scripts/db/`. Add `scripts/db/README.md` (one paragraph: одноразовые/операционные скрипты, НЕ применяются при reset; cron-скрипты содержат placeholder-секреты — применять по security runbook).

- [ ] git mv the 4 files, write README, commit `chore(db): move operational sql to scripts/db`

### Task 3: Assemble baseline migration

**File:** Create `supabase/migrations/20260710120000_baseline_schema.sql`

Concatenate root files in dependency order, applying transformations:

**Order:** schema.sql → phase5_supplements → phase5_labs → phase5_chat → phase7_tables (БЕЗ daily_summary view — уедет в Task 4) → phase8_tables → phase9_tables → daily-scores → ai_usage → ai_analyses → ai-prompts → autosync.sql → bot_ai_chat → cal-sync → coach.sql → codex_usage → environment.sql → environment-air → football-reminders.sql (DDL-часть: таблицы/индексы/RLS; БЕЗ `cron.schedule` и БЕЗ delete/update-строк; RPC не дублировать — уже в 20260704200000) → ideas → lab-ranges → meal-nutrition → profile_location → profiles-location → reminders.sql (DDL-часть, БЕЗ `cron.schedule`) → research → settings-update → supplements_profile_age → wellbeing.

**Transformations (обязательные):**
1. Каждый `create policy` → идемпотентная обёртка:
```sql
do $$ begin
  create policy "..." on <table> ...;
exception when duplicate_object then null; end $$;
```
2. Убрать все `cron.schedule(...)` и `create extension pg_cron` вместе с ними (cron — операционный шаг).
3. Убрать `delete from` / `update … set` строки данных (repair-操作), `truncate`.
4. `create table` → `create table if not exists`; `create index` → `if not exists`; `alter table add column` → `add column if not exists` (большинство уже так).
5. Секций-заголовок с источником: `-- ── from supabase/<file>.sql ──`.

- [ ] Assemble, commit `feat(db): baseline migration part 1 — consolidated DDL`

### Task 4: Canonical views (versioned daily_metrics + daily_summary alias)

Append to the same migration (views last — after all tables):

```sql
-- ── canonical read-model: daily_metrics (spec §2.2) ──
-- Порядок первых 8 колонок = порядок текущего prod view (см. inventory);
-- новые колонки только добавляются в конец. security_invoker: RLS исходных
-- таблиц сохраняется для пользовательского JWT.
create or replace view daily_metrics with (security_invoker = true) as
select
  d.user_id,
  d.date,
  max(d.avg_val) filter (where d.metric = 'restingHeartRate') as resting_heart_rate,
  max(d.avg_val) filter (where d.metric = 'hrv')              as hrv,
  max(d.sum_val) filter (where d.metric = 'steps')            as steps,
  max(d.sum_val) filter (where d.metric = 'activeEnergy')     as active_energy,
  max(d.avg_val) filter (where d.metric = 'oxygenSaturation') as oxygen_saturation,
  max(s.duration_hours)                                       as sleep_hours,
  max(d.avg_val) filter (where d.metric = 'wristTemperature') as wrist_temperature,
  max(d.avg_val) filter (where d.metric = 'respiratoryRate')  as respiratory_rate
from (
  select user_id, date from metrics_daily
  union
  select user_id, date from sleep_sessions
) days
left join metrics_daily d using (user_id, date)
left join sleep_sessions s using (user_id, date)
group by d.user_id, d.date;
```

**ВНИМАНИЕ:** черновик выше имеет баг — group by по `d.user_id` теряет sleep-only дни (d.* null). Правильная форма (использовать её):

```sql
create or replace view daily_metrics with (security_invoker = true) as
with days as (
  select user_id, date from metrics_daily
  union
  select user_id, date from sleep_sessions
)
select
  days.user_id,
  days.date,
  max(m.avg_val) filter (where m.metric = 'restingHeartRate') as resting_heart_rate,
  max(m.avg_val) filter (where m.metric = 'hrv')              as hrv,
  max(m.sum_val) filter (where m.metric = 'steps')            as steps,
  max(m.sum_val) filter (where m.metric = 'activeEnergy')     as active_energy,
  max(m.avg_val) filter (where m.metric = 'oxygenSaturation') as oxygen_saturation,
  max(s.duration_hours)                                       as sleep_hours,
  max(m.avg_val) filter (where m.metric = 'wristTemperature') as wrist_temperature,
  max(m.avg_val) filter (where m.metric = 'respiratoryRate')  as respiratory_rate
from days
left join metrics_daily m on m.user_id = days.user_id and m.date = days.date
left join sleep_sessions s on s.user_id = days.user_id and s.date = days.date
group by days.user_id, days.date;

-- ── daily_summary: временный compatibility alias (удалить после перевода biweekly-report) ──
create or replace view daily_summary with (security_invoker = true) as
select user_id, date, resting_heart_rate, hrv, sleep_hours, steps,
       active_energy, oxygen_saturation
from daily_metrics;
```

**Contingency:** если на проде `create or replace view daily_metrics` упадёт из-за
несовпадения порядка/типов колонок — НЕ менять на drop cascade молча; снять
фактический definition (`db push` покажет ошибку) и решить отдельной миграцией.

- [ ] Append views, delete daily_summary definition из перенесённого phase7-блока (Task 3 уже исключил), commit `feat(db): canonical daily_metrics view (+wrist_temp, resp_rate) & daily_summary alias`

### Task 5: Retire root SQL files

- [ ] `git rm` перенесённых в baseline 28 файлов (их содержимое живёт в миграции с пометкой источника; история — в git). `supabase/` остаётся: `config.toml`, `migrations/`, `functions/`.
- [ ] Commit `chore(db): retire root sql files consolidated into baseline`

### Task 6: Static verification gate

- [ ] `grep -c "cron.schedule\|^\s*delete from\|truncate" supabase/migrations/20260710120000_baseline_schema.sql` → 0
- [ ] Every `create policy` внутри DO-блока: `grep -B1 "create policy" ... | grep -c "do \$\$"` совпадает с количеством policies
- [ ] `npm test` зелёный; `npm run build` зелёный
- [ ] Commit при необходимости фиксов

### Task 7: Generate database.types.ts (best effort)

- [ ] `npx supabase gen types typescript --linked > src/lib/database.types.gen.ts` — если CLI сгенерирует без Docker. При успехе: заменить содержимое `src/lib/database.types.ts`, проверить `npm run build`, commit `feat(db): generated database types`. При неудаче (нужен Docker/пароль) — отметить в PR как follow-up.

### Task 8: Finish branch

- [ ] Push, PR с summary + чеклистом прод-применения: `npx supabase db push` (идемпотентный; меняет только definition daily_metrics — добавляет 2 колонки), проверка `daily_metrics` возвращает те же строки + 2 новые колонки, `daily_summary` не изменился. Empty-DB `supabase db reset` — проверяется при первом появлении Docker/CI (Фаза D отложена).

## Self-Review
- §2.2 контракт → Task 4 (обе новые колонки, union-семантика, security_invoker, alias); §2.3 судьбы файлов → Tasks 2/3/5 (по inventory); §3B идемпотентность/без удаления данных → трансформации Task 3; §4 контракт миграций → append-only timestamped, без секретов, roll-forward contingency в Task 4. Прод-применение — отдельный ручной шаг с подтверждением юзера.
- Верификация на пустой БД без Docker невозможна локально — задокументировано (Task 8), не блокирует baseline (низкий риск: DDL уже применён на проде).
