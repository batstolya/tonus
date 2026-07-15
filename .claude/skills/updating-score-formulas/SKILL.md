---
name: updating-score-formulas
description: Use when changing readiness/sleep/recovery/stress score formulas, baselines, or daily score computation in Tonus
---

# Изменение формул скоров (readiness/sleep/recovery/stress)

## Один источник — `supabase/functions/_shared/scores.ts`

`computeDailyScores` существует в **одном экземпляре** (зеркал больше нет):

| Файл | Роль |
|---|---|
| `supabase/functions/_shared/scores.ts` | **канонический модуль** (чистый, без Deno/браузерных зависимостей) — формулы правятся ТОЛЬКО здесь |
| `src/lib/scores.ts` | клиентский фасад: re-export `computeDailyScores`/`DailyScore`/`ScoreInput` + браузерные `persistDailyScores`, `baselineDeviations` |

Кто использует: дашборд/коуч/ИИ-контекст (веб, через фасад) и `ingest-health`
(автосинк Apple Health, напрямую). Тип входа общий — `ScoreInput`
(optional-nullable поля, совместим с клиентским `DailyMetrics` структурно).

## Порядок

1. Правь формулы в `supabase/functions/_shared/scores.ts` — единственное место.
2. Golden-тесты: `supabase/functions/_shared/scores.test.ts` (серверные значения)
   и `src/lib/scores.test.ts` (клиентские + identity-тест единого источника).
   Поменял формулу — пересчитай и обнови golden-значения в обоих тест-файлах.
3. `npm test` (Node 24!).
4. Release `ingest-health` through `npm run deploy:functions` and the canonical
   receipt workflow. Its JWT mode is pinned in `supabase/config.toml` and must
   match live metadata after deployment — see the `deploying-tonus` skill.

## Контекст данных

- Скользящая базовая линия: до 30 дней **до** текущего дня, минимум 5 дней истории.
- Результаты пишутся в таблицу `daily_scores` (клиент — `persistDailyScores`,
  сервер — при инжесте).
- `daily_metrics` / `daily_summary` — вьюхи над `metrics_daily`, скоры там
  не считаются.

## Частые ошибки

- Bypass the canonical wrapper or let the live JWT mode drift from the manifest
  → HAE sync can fail with 401.
- Поправить формулу, но НЕ задеплоить `ingest-health` → веб уже считает по-новому,
  автосинк пишет в `daily_scores` по-старому.
- Забыть пересчитать golden-значения → `npm test` падает, хотя формула верная.
