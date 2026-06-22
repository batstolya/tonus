# Readiness card — plain-language copy

**Date:** 2026-06-22
**Component:** `src/components/dashboard/Dashboard.tsx` (readiness card), `src/lib/readiness.ts`, `src/lib/translations.ts`

## Problem

The "готовність дня" card speaks in jargon (`HRV`, `ЧСС`) and shows bars + percentages
without telling the user what the score *means* for them today or what to do about it.

## Goal

Make the card readable by a non-expert: lead with a one-line plain-language verdict,
and rename the metric labels to everyday words. Keep the numbers — just make them legible.

## Design

### 1. Plain labels (bar labels only)

| Current | RU (base key) | uk | en |
|---|---|---|---|
| HRV | Восстановление | Відновлення | Recovery |
| ЧСС | Пульс покоя | Пульс спокою | Resting HR |
| Сон | Сон | Сон | Sleep |

`Пульс покоя` already exists as a translation key (reuse it). The exact `HRV xx мс` values
still appear in the stress-day cards below — only the readiness bar labels change.

### 2. Verdict sentence (new, top of card body, above the baseline row)

A short interpretive line built from two parts:

```
<band sentence>  <driver clause>
```

**Band sentence** (by `ReadinessScore.label`):

| Band | RU |
|---|---|
| Отличная | Организм отлично восстановился — хороший день для нагрузки и важных дел. |
| Хорошая | Ты в хорошей форме — можно работать в обычном ритме. |
| Средняя | Восстановление неполное — лучше умеренная нагрузка и лечь пораньше. |
| Низкая | Организм не восстановился — сегодня отдых, без перегрузок. |

**Driver clause** (the "smart" part) — names the single standout factor:

- Pick the component (`hrv` / `rhr` / `sleep`) with the largest today-vs-baseline deviation.
- Good bands (Отличная/Хорошая): append `Главный плюс — <factor+>.`
- Weak bands (Средняя/Низкая): append `Слабое место — <factor−>.`

Factor phrases:

| Component | positive (+) | negative (−) |
|---|---|---|
| hrv | высокое восстановление | сниженное восстановление |
| rhr | низкий пульс покоя | повышенный пульс покоя |
| sleep | крепкий сон | нехватка сна |

If the standout component has no baseline/today data, omit the driver clause (band sentence only).

### 3. Baseline row reword

`Относительно вашей нормы (30 дней)` → `Сегодня лучше твоей обычной нормы (30 дней)` when
deviations are net-positive; keep neutral wording otherwise. (Minimal: just reword the existing
key to be self-explanatory — "выше = хорошо".)

## Units & boundaries

- **`readiness.ts`** gains a pure helper `readinessVerdict(score: ReadinessScore): { key: string; vars }`
  that returns an i18n key + interpolation vars (band + driver). No JSX, no formatting — testable.
- **`Dashboard.tsx`** renders the verdict via `t(key, vars)` and the renamed labels.
- **`translations.ts`** holds the 4 band sentences × {good/weak driver phrasings} in ru/uk/en.

## Testing (TDD)

`readiness.test.ts`:
- Excellent score with HRV the top positive deviation → verdict names "высокое восстановление".
- Low score with sleep the worst deviation → verdict names "нехватка сна".
- Missing baseline on the standout component → band sentence only, no driver clause.
- Each band maps to its correct sentence key.

## Out of scope

- No change to how the 0–100 score is computed.
- No new data sources. Server/sync untouched.
