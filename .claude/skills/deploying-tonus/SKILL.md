---
name: deploying-tonus
description: Use when deploying Tonus — frontend deploys when green GitHub Actions CI triggers the Vercel deploy hook, Supabase edge functions deploy separately via CLI with critical flags (ingest-health needs --no-verify-jwt)
---

# Деплой Tonus

## Фронтенд — через зелёный CI

Push в `main` (`github.com/batstolya/tonus`) → GitHub Actions CI (тесты, сборка,
e2e, lint-потолок) → при зелёном CI job `deploy` дёргает Vercel Deploy Hook.
**Красный CI = прод не обновится** — чини тесты, а не жди деплоя.
Авто-деплой Vercel выключен в `vercel.json`; hook хранится в GitHub Secrets
(`VERCEL_DEPLOY_HOOK`). Прод-ключи Supabase живут в Vercel env, локальный
`.env.local` на прод не влияет. Статус: `gh run list --repo batstolya/tonus`.

## Edge-функции — только вручную

Vercel их **не** деплоит. Для каждой изменённой функции:

```bash
npx supabase functions deploy <name> --project-ref <ref>
```

Логин CLI хранится в macOS Keychain. Если токена в окружении нет — попроси
пользователя задеплоить или дай точную команду.

## Критично

- **`ingest-health` деплоить только с `--no-verify-jwt`** — иначе Apple Health
  авто-синк (HAE) получает 401 и молча ломается (уже случалось).
- Формулы скорингов живут в ОДНОМ месте: `supabase/functions/_shared/scores.ts`
  (клиент импортирует его через фасад `src/lib/scores.ts`). Правишь формулы —
  задеплой ingest-health, иначе автосинк пишет скоры в daily_scores по-старому.
- Общий код функций лежит в `supabase/functions/_shared/` — при его изменении
  передеплой все функции, которые его импортируют (таблица ниже).

## Кто импортирует `_shared/` (что редеплоить)

| Модуль | Редеплоить |
|---|---|
| `scores.ts` | ingest-health (**только с `--no-verify-jwt`**) |
| `costGuard.ts` | analyze-health, biweekly-report, chat-health, classify-meal, coach-profile, coach-weekly, deep-research, extract-lab, generate-recommendations, suggest-experiments, supplement-schedule, telegram-bot |
| `healthContext.ts` | telegram-bot |
| `football.ts` | send-football-reminders, sync-football-fixtures, telegram-bot |
| `time.ts` | send-reminders, telegram-bot |
| `prompts.ts` | chat-health, telegram-bot |
| `classifyPrompt.ts` | telegram-bot |
| `saveIntent.ts` | telegram-bot |
| `staleness.ts` | biweekly-report, telegram-bot |
| `userTimezone.ts` | biweekly-report, chat-health, telegram-bot |

Таблица может устареть — перед редеплоем сверься:
`grep -rl "_shared/<module>" supabase/functions --include=index.ts`

## Миграции БД

- Файлы в `supabase/migrations/`, нейминг `YYYYMMDDhhmmss_описание.sql`.
- Выполнение: Supabase dashboard → SQL Editor (или MCP `apply_migration`).
  Локального стека нет — миграция уходит сразу в прод, перечитай перед запуском.
- В комментариях миграции перечисляй edge-функции, которые надо задеплоить
  после неё (см. `20260704200000_football_reminders.sql` как образец).

## Проверка после деплоя

- Фронт: Vercel dashboard или прод-URL.
- Функции: `npx supabase functions list --project-ref <ref>`, логи — в
  Supabase dashboard → Edge Functions → Logs.

## Deploy discipline (a deploy is the whole change)

A change is not "deployed" until **every component in its diff** is live in prod.
Code shipping while a migration sits unapplied is a half-patched prod — and for a
security fix that leaves the hole open. Before claiming "deployed", walk the diff
and confirm each component present in it is actually out:

- [ ] **Edge functions** — `npx supabase functions deploy <name> --project-ref <ref>`
      (mind the flags above; e.g. `ingest-health` needs `--no-verify-jwt`).
- [ ] **DB migrations** — a `.sql` in `supabase/migrations/` does **not** apply
      itself. Run it (SQL Editor / MCP `apply_migration`), record the row in
      `supabase_migrations.schema_migrations`, then read the live schema back to
      confirm (RLS on, policies, grants).
- [ ] **Secrets / env** — `npx supabase secrets set ...`.
- [ ] **Config** — `supabase/config.toml` (e.g. `verify_jwt`); an omitted value can
      preserve the old remote mode, so verify the live value after deploy.
- [ ] **Frontend** — merge to `main` → green CI → Vercel hook.

If a component is in the diff but not shipped yet, say so explicitly. Never let
"code is written" read as "done".

## Prod must equal `main`

Do not deploy from an unmerged branch and stop there: that leaves `main` behind
prod, so the next deploy from `main` silently **regresses** the change. Order is
review → merge to `main` → deploy from the reviewed/merged commit. If a live
function version is higher than what `main` contains, prod is ahead of `main` —
merge before anything else.

## Verify on prod, then report

After deploying, prove it: `functions list` for versions/JWT modes, a black-box
smoke for behavior, or a direct catalog read for schema/RLS. Report what is live,
what is still pending, and where the risk is — at each checkpoint, not only at the
end.
