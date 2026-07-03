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
  передеплой все функции, которые его импортируют.

## Проверка после деплоя

- Фронт: Vercel dashboard или прод-URL.
- Функции: `npx supabase functions list --project-ref <ref>`, логи — в
  Supabase dashboard → Edge Functions → Logs.
