# Магнитные бури (Kp-индекс) как фактор среды

> [!CAUTION]
> Historical execution record. Do not run deployment commands from this file.
> Use `docs/guides/edge-function-deployments.md` and `npm run deploy:functions`.

**Дата:** 2026-07-11 · **Статус:** approved (вариант «фактор в Исследованиях»)

## Задача

Пользователь хочет видеть, влияют ли магнитные бури на его показатели
(HRV, сон, пульс). Отдельная вкладка не нужна — Kp-индекс становится ещё
одним фактором среды в существующем конвейере, как погода/AQI/пыльца.

## Данные

- **Kp-индекс** — планетарный геомагнитный индекс (0–9), глобальный,
  координаты пользователя не нужны. Буря = Kp ≥ 5.
- Источник: **GFZ Potsdam** — `https://kp.gfz.de/app/json/?start=…&end=…&index=Kp`
  (бесплатно, без ключа, история за любой период; NOAA SWPC даёт только 7 дней).
  Ответ: параллельные массивы `datetime[]` (3-часовые слоты UTC) и `Kp[]`.
- Агрегация за день: **максимум** Kp по слотам дня — буря определяется пиком.

## Изменения

1. **Миграция** `20260711130000_env_kp_index.sql`:
   `alter table environment_daily add column if not exists kp_index numeric;`
2. **`fetch-environment`**: best-effort блок (по образцу AQI) — тянем Kp за те
   же 30 дней, max по датам, пишем `kp_index` в те же строки upsert-а.
   Сбой GFZ не ломает синк погоды.
3. **`src/lib/research.ts`**: `kp_index` в select из `environment_daily` +
   запись в `ENV_FACTORS`: `{ col: 'kp_index', key: 'env_kp', label: 'Магнитные бури (Kp)' }`.
   Дальше корреляции считаются автоматически, фактор помечается 🌍 (немодифицируемый).
4. **Демо-фикстура**: `kp_index` в `makeDemoEnvironment` (редкие «бури» с шумом).
5. **Тесты**: агрегация max-Kp-за-день (пьюр-хелпер), фактор в ENV_FACTORS.

## Деплой

`supabase db push` (колонка) → `npx supabase functions deploy fetch-environment`.
Фронт — обычный CI-пайплайн.

## Вне скоупа

Отдельная вкладка, бейджи «буря» на графиках Body, lag-корреляции в
`correlations.ts` (Insights) — можно добавить позже, если фактор «выстрелит».
