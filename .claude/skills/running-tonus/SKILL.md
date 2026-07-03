---
name: running-tonus
description: Use when you need to run, preview, test, or build the Tonus app locally — dev server, demo mode without Supabase, vitest, and production build all require Node 24 and specific env setup
---

# Запуск Tonus локально

## Node 24 обязателен

Дефолтный Node 18 из шелла **не работает ни для чего** (dev, build, test, lint —
всё падает на современном синтаксисе). Всегда:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
```

## Env для dev-сервера

Локального Supabase нет, прод-ключи живут только в Vercel. Нужен `.env.local`
(gitignored) с dummy-значениями:

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=test-anon-key
```

## Демо-режим (весь UI без Supabase)

Приложение за авторизацией. Чтобы увидеть внутренние экраны с данными:

- **Кнопка «Посмотреть демо» на лендинге** — ставит `localStorage.tonus_demo=1`.
- **Или** добавь `VITE_DEMO=1` в `.env.local` (нужен рестарт dev-сервера).

Демо подставляет фейкового пользователя (`src/hooks/useAuth.ts` +
`src/lib/demo.ts`) и 90 дней сгенерированных метрик (`src/lib/demoFixture.ts`).
Экраны «Дневник/Коуч» в демо пустые (их данные живут в Supabase) — это норма.
Выход из демо — кнопка «Выйти».

## Команды

```bash
npm run dev    # vite, порт 5173
npm test       # vitest, 82 теста, окружение node (не jsdom — рендера компонентов нет)
npm run build  # tsc -b && vite build
npm run lint   # eslint; ~295 pre-existing ошибок (в основном no-explicit-any) — не добавляй новых
```

Для предпросмотра в Claude Code есть `.claude/launch.json` с конфигурацией
`tonus-dev` (использует preview-сервер на 5173 с Node 24 напрямую).

## Навигация без кликов

Роутинг хэшовый: `http://localhost:5173/#sleep`, `#metrics`, `#supplements`,
`#insights`, `#settings` и т.д. (список — `VIEWS` в `src/store/appStore.ts`).
