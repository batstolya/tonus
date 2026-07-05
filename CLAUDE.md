# CLAUDE.md

Гайд для агентов (Claude Code) по этому репозиторию.

## Команды

- **Всё требует Node 24** — dev, build, test и lint (дефолтный Node 18 падает
  на современном синтаксисе): `nvm use 24` или
  `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- `npm test` — vitest. Окружение **node**, не jsdom:
  рендер React-компонентов недоступен. Паттерн теста компонента — проверка
  экспорта + покрытие переводов (см. `src/components/auth/TelegramDemo.test.ts`);
  чистую логику тестируй напрямую.
- `npm run build` — `tsc -b && vite build`.
- `npm run lint` — eslint (в проекте есть pre-existing ошибки; не добавляй новых).

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
- **Edge-функции:** не деплоятся через Vercel-пайплайн. Отдельно:
  `npx supabase functions deploy <name> --project-ref <ref>`. Логин CLI — в macOS Keychain.

## Конвенции

- Продуктовые спеки — `docs/specs/`. Гайды — `docs/guides/`.
- Superpowers-артефакты (design/plan) — `docs/superpowers/{specs,plans}/`.
- Устаревшие черновики — `docs/archive/` (не удаляем).
- `src/` — компоненты по фичам (`components/<feature>/`), общая логика в `lib/`.
