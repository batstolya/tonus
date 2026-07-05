---
name: adding-a-screen
description: Use when creating a new screen, view, tab, or feature section in the Tonus app UI
---

# Новый экран в Tonus

## Регистрация экрана (3 места)

1. **`src/store/appStore.ts`** — добавь имя в тип `AppView` и в массив `VIEWS`
   (хэш-роутинг: экран станет доступен по `#<name>`).
2. **`src/App.tsx`** — два места:
   - `NAV_GROUPS` — пункт меню `{ view: '<name>', label: 'Русское название' }`
     в подходящей группе (Тело / Дневник / Коуч); опционально
     `requiresMetric: 'hasX'` если экран зависит от наличия данных;
   - ветка рендера `state.view === '<name>' ? <MyScreen … /> : …`.
3. **Компонент** — `src/components/<feature>/MyScreen.tsx`
   (папка по фиче, как соседние).

## Обязательно

- **i18n**: все строки через `t()` + словарь + coverage-тест.
  REQUIRED SUB-SKILL: `adding-translations`.
- **Тест**: рендера нет (vitest в env node) — паттерн «экспорт-проверка +
  coverage переводов», пример `src/components/auth/TelegramDemo.test.ts`.

## Грабли UI

- **recharts v3 + React 19**: `<Bar>` (и другим сериям) нужен
  `isAnimationActive={false}`, иначе бары не отрисовываются.
  Длинные подписи оси — кастомный однострочный `tick`.
- **Анимации**: только Motion через `LazyMotion` (domMax, strict) —
  используй `m.*`, **не** `motion.*` (strict-режим кидает ошибку).
- Демо-режим: экран получит данные из фикстур (`src/lib/demoFixture.ts`)
  только если читает их из стора/`daily`; данные из Supabase в демо пустые —
  предусмотри пустое состояние.

## Проверка

`npm run dev` (Node 24, см. скилл `running-tonus`) → открой `#<name>` →
проверь uk/en переключение и пустое состояние. Затем `npm test`.
