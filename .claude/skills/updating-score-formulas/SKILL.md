---
name: updating-score-formulas
description: Use when changing readiness/sleep/recovery/stress score formulas, baselines, or daily score computation in Tonus
---

# Изменение формул скоров (readiness/sleep/recovery/stress)

## Два зеркала — править оба

`computeDailyScores` существует в **двух копиях с идентичными формулами**:

| Копия | Кто использует | Тип входа |
|---|---|---|
| `src/lib/scores.ts` | дашборд, коуч, ИИ-контекст (веб) | `DailyMetrics` |
| `supabase/functions/_shared/scores.ts` | `ingest-health` (автосинк Apple Health) | `ScoreInput` |

Меняешь формулу в одной — внеси **ту же правку** во вторую. Типы входа разные,
тело функции — 1-в-1.

## Порядок

1. Правь `src/lib/scores.ts` и `supabase/functions/_shared/scores.ts` синхронно.
2. Golden-тест **один**, серверный: `supabase/functions/_shared/scores.test.ts`
   (ожидаемые значения посчитаны вручную по формулам). Поменял формулу —
   пересчитай и обнови golden-значения. Клиентская копия тестами не покрыта,
   поэтому зеркальность проверяй глазами/диффом тел функций:
   ```bash
   diff <(sed -n '/^export function computeDailyScores/,/^}/p' src/lib/scores.ts) \
        <(sed -n '/^export function computeDailyScores/,/^}/p' supabase/functions/_shared/scores.ts)
   ```
   Эталонный вывод — одна строка сигнатуры (`DailyMetrics[]` vs `ScoreInput[]`);
   любое другое расхождение — рассинхрон формул.
3. `npm test` (Node 24!).
4. Редеплой серверной части: `ingest-health` **обязательно с `--no-verify-jwt`**
   (без флага автосинк молча ломается 401) — см. скилл `deploying-tonus`.

## Контекст данных

- Скользящая базовая линия: до 30 дней **до** текущего дня, минимум 5 дней истории.
- Результаты пишутся в таблицу `daily_scores` (клиент — `persistDailyScores`,
  сервер — при инжесте).
- `daily_metrics` / `daily_summary` — вьюхи над `metrics_daily`, скоры там
  не считаются.

## Частые ошибки

- Поправить только клиентскую копию → веб и автосинк показывают разные скоры,
  **и ни один тест этого не поймает** (клиентская копия не покрыта).
- Задеплоить `ingest-health` без `--no-verify-jwt` → HAE-синк получает 401.
- Забыть пересчитать golden-значения → `npm test` падает, хотя формулы зеркальны.
