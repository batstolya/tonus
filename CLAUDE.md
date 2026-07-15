# CLAUDE.md

Гайд для агентов (Claude Code) по этому репозиторию.

## Команды

- **Всё требует Node 24** — dev, build, test и lint (дефолтный Node 18 падает
  на современном синтаксисе): `nvm use 24` или
  `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- `npm test` — vitest, два проекта: **node** (`*.test.ts`, чистая логика) и
  **jsdom** (`*.test.tsx`, рендер компонентов через
  `src/test/utils.tsx` → `renderWithProviders`).
- `npm run build` — `tsc -b && vite build`.
- `npm run lint` — eslint (в проекте есть pre-existing ошибки; не добавляй новых).
  Потолки-храповики: `.lint-ceiling` (eslint, `npm run lint:ceiling`) и
  `.deno-check-ceiling` (type-ошибки edge-функций, `npm run check:functions`,
  нужен deno: `export PATH="$HOME/.deno/bin:$PATH"`). Число может только падать;
  снизил долг — обнови файл.

Подробности запуска/деплоя — в проектных скиллах `running-tonus` и `deploying-tonus`
(`.claude/skills/`).

## Локальный запуск

Нет локального `.env` (прод берёт ключи из Vercel). Для `npm run dev` создай
временный `.env.local` (gitignored):

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=test-anon-key
```

Лендинг полностью статичный, dummy-ключей хватает, чтобы его открыть.
Чтобы увидеть внутренние экраны без Supabase — демо-режим: кнопка
«Посмотреть демо» на лендинге или `VITE_DEMO=1` в `.env.local`
(фикстурные данные, см. `src/lib/demo.ts` и `src/lib/demoFixture.ts`).

## Деплой

- **Фронтенд:** push в `main` (репо `github.com/batstolya/tonus`) → GitHub Actions CI
  (тесты, сборка, e2e, lint-потолок) → при зелёном CI job `deploy` дёргает Vercel
  Deploy Hook. Красный CI = прод не обновится. Авто-деплой Vercel выключен (`vercel.json`).
- **Edge Functions:** they are not part of the Vercel pipeline. Use only the
  reviewed wrapper, explicit target list, smoke check, and receipt procedure in
  `docs/guides/edge-function-deployments.md`.

## Конвенции

- Продуктовые спеки — `docs/specs/`. Гайды — `docs/guides/`.
- Superpowers-артефакты (design/plan) — `docs/superpowers/{specs,plans}/`.
- Устаревшие черновики — `docs/archive/` (не удаляем).
- `src/` — компоненты по фичам (`components/<feature>/`), общая логика в `lib/`.

## Язык (обязательно)

Всё, что попадает в репозиторий, — на английском: commit-сообщения, PR-заголовки
и описания, названия веток, комментарии в коде, идентификаторы, документация
(`docs/`, спеки, гайды), сообщения об ошибках/логи. **Исключения — только два:**

1. **Контент продукта** — UI-строки, i18n-переводы, тексты, которые видит
   пользователь на сайте (могут быть на ru/ua по назначению).
2. **Переписка** — чат с агентом, обсуждения в задачах (не идёт в код).

Новые артефакты пиши сразу на английском. Существующие русскоязычные файлы
задним числом не переписываем — только по явному запросу.
