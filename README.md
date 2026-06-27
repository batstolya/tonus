# Tonus

Личный health-хаб: подключаешь Apple Watch, логируешь привычки и анализы, а AI
находит закономерности, которые влияют на самочувствие.

## Стек

- **Frontend:** React 19 + Vite 8 + TypeScript → Vercel
- **Backend:** Supabase (Postgres + Edge Functions на Deno)
- **AI:** Gemini 2.5 Flash · **Бот:** Telegram

## Быстрый старт

> ⚠️ Vite 8 требует **Node ≥ 20.19 / 22.12**. Дефолтный Node 18 падает
> (`CustomEvent is not defined`) — используй Node 24 (`nvm use 24`).

```bash
npm install
npm run dev      # дев-сервер (нужен .env с VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
npm test         # vitest
npm run build    # tsc + vite build
```

## Структура

- `src/` — фронтенд (компоненты по фичам, `lib/`, `hooks/`, `parsers/`, `store/`)
- `supabase/` — миграции и edge-функции
- `docs/specs/` — продуктовые спеки (фазы 3–10, фичи)
- `docs/guides/` — гайды (экспорт календаря, монитор использования Claude)
- `docs/superpowers/` — спеки и планы из superpowers-воркфлоу
- `docs/archive/` — устаревшие черновики
- `scripts/` — вспомогательные скрипты
- `claude-monitor/` — сервис мониторинга лимитов Claude (launchd)

## Деплой

Фронтенд авто-деплоится на Vercel при push в `main`. Edge-функции — отдельно
(`npx supabase functions deploy <name> --project-ref <ref>`). Подробнее — [CLAUDE.md](CLAUDE.md).
