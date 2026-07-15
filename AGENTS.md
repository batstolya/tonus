# AGENTS.md

Гайд для агентов (Codex) по этому репозиторию.

## Команды

- **Dev/build требуют Node 24** (Vite 8 требует ≥20.19/22.12; дефолтный Node 18
  падает с `CustomEvent is not defined`): `nvm use 24` или
  `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- `npm test` runs both Vitest projects: pure logic in `node` and React component
  behavior in `jsdom` through `src/test/utils.tsx`.
- `npm run build` — `tsc -b && vite build`.
- `npm run lint` — eslint (в проекте есть pre-existing ошибки; не добавляй новых).
- Ratchets are enforced by `npm run lint:ceiling`, `npm run lint:diff`, and
  `npm run check:functions`; their recorded ceilings may only decrease.

## Локальный запуск

Нет локального `.env` (прод берёт ключи из Vercel). Для `npm run dev` создай
временный `.env.local` (gitignored):

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=test-anon-key
```

Лендинг полностью статичный, dummy-ключей хватает, чтобы его открыть.

## Деплой

- **Фронтенд:** авто-деплой Vercel при push в `main` (репо `github.com/batstolya/tonus`).
- **Edge Functions:** never deploy through the Vercel pipeline. Use only the
  reviewed wrapper and receipt workflow in
  `docs/guides/edge-function-deployments.md`.

## Конвенции

- Продуктовые спеки — `docs/specs/`. Гайды — `docs/guides/`.
- Superpowers-артефакты (design/plan) — `docs/superpowers/{specs,plans}/`.
- Устаревшие черновики — `docs/archive/` (не удаляем).
- `src/` — компоненты по фичам (`components/<feature>/`), общая логика в `lib/`.
