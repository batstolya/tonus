# Tonus — ТЗ: Наведение порядка в репозитории (docs/корень)

## 0. Цель

Корень репозитория замусорен: 25 `.md`-файлов (19 спек + 6 черновых заметок),
нет `README.md` и `CLAUDE.md`. Цель — чистый корень (только README, CLAUDE.md и
конфиги), а вся документация разложена по `docs/`. `src/` не трогаем — он уже
аккуратно разложен по фичам. **Ничего не удаляем** — устаревшее уходит в архив.

Скоуп подтверждён пользователем: «только docs/корень».

## 1. Целевая структура

```
tonus/
├── README.md              ← НОВЫЙ
├── CLAUDE.md              ← НОВЫЙ
├── index.html, package.json, package-lock.json, tsconfig*.json,
│   vite.config.ts, vitest.config.ts, eslint.config.js   ← остаются
├── scripts/
│   ├── test-cal-normalize.mjs   ← уже тут
│   └── fetch-cal.mjs            ← перенос из корня
├── docs/
│   ├── specs/                   ← 19 SPEC-*.md (имена сохраняются)
│   ├── guides/
│   │   ├── how-to-export-cal.md       ← из HOW_TO_EXPORT_CAL.md
│   │   └── claude-usage-monitor.md    ← из usage.md
│   ├── archive/
│   │   ├── new-approch.md, new-speca-refactoring.md, test-speca.md,
│   │   │   usage-spec.md, TODO_TOMORROW.md
│   │   └── telegram-demo-draft/       ← содержимое files-telegram-speca/
│   ├── superpowers/{specs,plans}/     ← без изменений
│   └── CHANGELOG-2026-06-20.md        ← без изменений
└── src/                              ← НЕ ТРОГАЕМ
```

## 2. Перемещения

Все перемещения отслеживаемых файлов — через `git mv` (сохраняет историю).

| Откуда | Куда |
|---|---|
| `SPEC.md`, `SPEC-AICOACH.md`, `SPEC-AUTOSYNC.md`, `SPEC-BOT.md`, `SPEC-DAILY-NOTE.md`, `SPEC-HUB.md`, `SPEC-NAV.md`, `SPEC-ONBOARDING.md`, `SPEC-OVERVIEW.md`, `SPEC-PHASE3.md`…`SPEC-PHASE10.md`, `SPEC-REMINDERS.md` (19 шт.) | `docs/specs/` (имена без изменений) |
| `HOW_TO_EXPORT_CAL.md` | `docs/guides/how-to-export-cal.md` |
| `usage.md` | `docs/guides/claude-usage-monitor.md` |
| `new-approch.md`, `new-speca-refactoring.md`, `test-speca.md`, `usage-spec.md`, `TODO_TOMORROW.md` | `docs/archive/` |
| `files-telegram-speca/*` (untracked) | `docs/archive/telegram-demo-draft/` (затем `git add`) |
| `fetch-cal.mjs` | `scripts/fetch-cal.mjs` |

**Кросс-ссылки:** спеки ссылаются друг на друга по голым именам (`SPEC-PHASE7.md`).
Так как все 19 переезжают в одну папку `docs/specs/`, ссылки остаются валидными —
переименований нет.

## 3. Новые файлы

**`README.md`** (для людей):
- Что такое Tonus (личный health-хаб для данных Apple Watch + AI-инсайты).
- Стек: React + Vite + TS → Vercel, Supabase (Postgres + Edge Functions), Gemini, Telegram-бот.
- Быстрый старт: `npm install`, `npm run dev`, `npm test`, `npm run build` — **с пометкой про Node 24** (Vite 8 требует Node ≥20.19/22.12; дефолтный Node 18 падает).
- Структура проекта (ссылки на `docs/`).

**`CLAUDE.md`** (для агента/Claude Code):
- Команды: dev/test/build, обязательный Node 24 через nvm для build/dev.
- Деплой-топология: фронт авто-деплоится Vercel при push в `main`; edge-функции деплоятся отдельно (`npx supabase functions deploy <name> --project-ref …`).
- Конвенции: спеки в `docs/specs/`, superpowers-артефакты в `docs/superpowers/`, гайды в `docs/guides/`.
- Гочи: нет локального `.env` (для `npm run dev` нужен временный `.env.local` с dummy Supabase-ключами); тесты в node-окружении (рендер React-компонентов недоступен — паттерн export+translation-coverage).

## 4. Правки ссылок

- [src/lib/supplements.ts:64](../../../src/lib/supplements.ts) — комментарий
  `// ── Reminders (SPEC-REMINDERS) ──` → `(docs/specs/SPEC-REMINDERS.md)`.

(Других ссылок на эти файлы из кода/конфигов нет — проверено grep.)

## 5. Что НЕ трогаем

- `src/` целиком (структура и код).
- Конфиги в корне, `index.html`.
- `docs/superpowers/`, `docs/CHANGELOG-2026-06-20.md`.
- Имена спек-файлов (чтобы не ломать кросс-ссылки).

## 6. Верификация

- `git mv` сохраняет историю; `git status` после — чисто (кроме намеренных перемещений/новых файлов).
- `npm test` 56/56 и `npm run build` зелёные (документация на код не влияет, но прогон подтверждает, что ничего не задето).
- Битых внутри-docs ссылок нет (спеки в одной папке; guides/archive самодостаточны).
- В корне не осталось `.md`, кроме `README.md` и `CLAUDE.md`.

## 7. Вне рамок (YAGNI)

- Любой рефакторинг `src/`.
- Переименование спек-файлов в kebab-case.
- Удаление чего-либо (всё устаревшее → `docs/archive/`).
- Переписывание содержимого старых спек (переносим как есть).
