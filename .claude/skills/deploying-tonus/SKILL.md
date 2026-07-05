---
name: deploying-tonus
description: Use when deploying Tonus — frontend goes via Vercel on push to main, Supabase edge functions deploy separately via CLI with critical flags (ingest-health needs --no-verify-jwt)
---

# Деплой Tonus

## Фронтенд — сам

Push в `main` (`github.com/batstolya/tonus`) → Vercel собирает и деплоит
автоматически. Прод-ключи Supabase живут в Vercel env, локальный `.env.local`
на прод не влияет.

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
- Формулы скорингов существуют в двух зеркальных копиях:
  `src/lib/scores.ts` (фронт) и `supabase/functions/_shared/scores.ts`
  (ingest-health). Меняешь одну — поменяй вторую и задеплой ingest-health.
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
