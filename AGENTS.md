# AGENTS.md

Гайд для агентов (Codex) по этому репозиторию.

## Команды

- **Dev/build требуют Node 24** (Vite 8 требует ≥20.19/22.12; дефолтный Node 18
  падает с `CustomEvent is not defined`): `nvm use 24` или
  `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- `npm test` — vitest (работает и на Node 18). Окружение **node**, не jsdom:
  рендер React-компонентов недоступен. Паттерн теста компонента — проверка
  экспорта + покрытие переводов (см. `src/components/auth/TelegramDemo.test.ts`);
  чистую логику тестируй напрямую.
- `npm run build` — `tsc -b && vite build`.
- `npm run lint` — eslint (в проекте есть pre-existing ошибки; не добавляй новых).

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
- **Edge-функции:** не деплоятся через Vercel-пайплайн. Отдельно:
  `npx supabase functions deploy <name> --project-ref <ref>`. Логин CLI — в macOS Keychain.

## Конвенции

- Продуктовые спеки — `docs/specs/`. Гайды — `docs/guides/`.
- Superpowers-артефакты (design/plan) — `docs/superpowers/{specs,plans}/`.
- Устаревшие черновики — `docs/archive/` (не удаляем).
- `src/` — компоненты по фичам (`components/<feature>/`), общая логика в `lib/`.

## Working on tasks

- **One task to done, then the next.** "Done" = code + tests, reviewed, merged to
  `main`, **every component of the change deployed** (code + migrations + secrets +
  config — see the deploy checklist), verified on prod, and a short report given.
  Several stacked draft PRs is not progress — it is unfinished work with regression
  risk. Do not start the next task until the current one is fully landed.
- **A deploy is the whole change.** A `.sql` migration file does not apply itself;
  a security fix with an unapplied migration is a live hole. Prod must equal `main`
  — never deploy from an unmerged branch and leave `main` behind, or the next deploy
  from `main` regresses the fix.
- **Respect dependency order.** Follow the plan's sequence (PR 0 → 1 → 2 → …) one at
  a time; do not fan out into parallel branches.
- **Report at every checkpoint**, not only at the end — so a missed step (an
  unapplied migration, an unmerged fix) surfaces before it becomes a defect.
- **Size the process to the risk.** Tests are mandatory, but full black-box matrices
  and deployment receipts belong on real security/prod changes, not on every
  refactor. Reuse harnesses instead of rebuilding proofs for cosmetic review.
- **Stop signals:** "PR is open" but not merged/deployed → not done. Functions
  deployed but a `.sql` is still in the diff → check it was applied. Live version
  ahead of `main` → merge first. More scaffolding than subject matter → right-size.
