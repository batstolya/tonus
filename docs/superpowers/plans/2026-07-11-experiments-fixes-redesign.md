# Experiments: фиксы расчётов + mate-редизайн — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Починить расчёты экрана «Эксперименты» (baseline-окна, порог n ≥ 5, локальные даты) и переверстать его в секционный mate-style дашборд.

**Architecture:** Вся математика уезжает из `ExperimentsScreen.tsx` в чистый модуль `src/lib/experiments.ts` (покрыт vitest, окружение node). Карточка эксперимента — новый презентационный компонент `ExperimentCard.tsx`. Экран становится тонким: секции «Идёт сейчас / Запланированные / Завершённые» + форма и ИИ-предложения (механика не меняется). Одна SQL-миграция чинит `baseline_start` в существующих строках.

**Tech Stack:** React 19 + Vite, vitest (node env — компоненты НЕ рендерим), Supabase (PostgREST + migrations). Всё через Node 24 (`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`).

**Спека:** `docs/superpowers/specs/2026-07-11-experiments-fixes-redesign-design.md`

**Ветка:** `feature/experiments-redesign` (пуш в `main` = деплой; работаем в ветке, в конце PR).

---

## Контекст для исполнителя без истории

- Экран: `src/components/research/ExperimentsScreen.tsx` (вкладка Коуч → Эксперименты). Сейчас master-detail: слева список-кнопки, справа деталь по клику.
- Баги (подтверждены на проде): формула `baseline_start` при создании даёт окно 2×baseline_days; fallback окна считается от «сегодня», а не от `start_date`; даты через `toISOString()` (UTC, съезжают до 03:00 при UTC+3); результат «+8.9%» нарисован по 2 базовым ночам (нет порога n); метки эффекта «слабый/средний/сильный/нет эффекта» не переведены; ошибки `handleAI` глотаются.
- `daily: DailyMetrics[]` (`src/types/index.ts`) приходит пропом — вся история пользователя, поля опциональные (`sleepDeep?: number` и т.д., `heartRate` — объект `{avg,min,max}`).
- Переводы: `src/lib/translations.ts` — словарь `'русский ключ': { uk, en }`; `t()` из `src/lib/i18n` поддерживает подстановки `t('День {d} из {n}', { d, n })`.
- CSS токены: `--surface`, `--surface2`, `--border`, `--text`, `--text-muted`, `--accent`, `--green`, `--red`, `--radius`. Многие exp-классы уже есть в `src/index.css:1684-1746` — переиспользуем.
- `npm test` = vitest, окружение **node**: тесты компонентов = проверка экспорта + покрытие переводов (образец: `src/components/auth/TelegramDemo.test.ts`).

---

### Task 0: Ветка

- [ ] **Step 0.1:** `git checkout -b feature/experiments-redesign` (или изолированный worktree через superpowers:using-git-worktrees).

### Task 1: `src/lib/experiments.ts` — даты (localDate, addDays, computeBaselineStart, daysBetween)

**Files:**
- Create: `src/lib/experiments.ts`
- Test: `src/lib/experiments.test.ts`

- [ ] **Step 1.1: Написать падающий тест**

```ts
// src/lib/experiments.test.ts
import { describe, it, expect } from 'vitest'
import { localDate, addDays, computeBaselineStart, daysBetween } from './experiments'

describe('date helpers', () => {
  it('localDate formats in local timezone', () => {
    // 00:30 местного 15 марта — toISOString() дал бы 14-е при UTC+3
    expect(localDate(new Date(2026, 2, 15, 0, 30))).toBe('2026-03-15')
    expect(localDate(new Date(2026, 0, 1))).toBe('2026-01-01')
  })

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-06-13', 14)).toBe('2026-06-27')
  })

  it('computeBaselineStart = start − baselineDays', () => {
    expect(computeBaselineStart('2026-06-13', 14)).toBe('2026-05-30')
    expect(computeBaselineStart('2026-06-08', 7)).toBe('2026-06-01')
  })

  it('daysBetween', () => {
    expect(daysBetween('2026-06-13', '2026-06-27')).toBe(14)
  })
})
```

- [ ] **Step 1.2:** Запустить: `npx vitest run src/lib/experiments.test.ts` — FAIL (модуля нет).

- [ ] **Step 1.3: Минимальная реализация**

```ts
// src/lib/experiments.ts
// Чистая логика экрана «Эксперименты»: даты, расчёт результата, статусы.
// Все даты — строки YYYY-MM-DD в ЛОКАЛЬНОЙ зоне (не toISOString: UTC съезжает
// на день назад между полуночью и 03:00 при UTC+3).

export function localDate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return localDate(new Date(y, m - 1, d + n))
}

export function computeBaselineStart(startDate: string, baselineDays: number): string {
  return addDays(startDate, -baselineDays)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}
```

- [ ] **Step 1.4:** `npx vitest run src/lib/experiments.test.ts` — PASS.
- [ ] **Step 1.5:** `git add src/lib/experiments.ts src/lib/experiments.test.ts && git commit -m "feat(experiments): local-tz date helpers"`

### Task 2: `computeResult` с порогом MIN_N, статусы, метрики, эффект

**Files:**
- Modify: `src/lib/experiments.ts` (дописать)
- Test: `src/lib/experiments.test.ts` (дописать)

- [ ] **Step 2.1: Падающие тесты**

Дописать в `src/lib/experiments.test.ts`:

```ts
import { MIN_N, METRIC_OPTIONS, isValidMetric, metricLabel, computeResult, effectLabel, effectSegments, expStatusInfo, firstMetricDate, type ExperimentRow } from './experiments'
import type { DailyMetrics } from '../types'

function mkExp(over: Partial<ExperimentRow> = {}): ExperimentRow {
  return {
    id: 'x', hypothesis: 'h', change_rule: 'c', target_metric: 'sleepDeep',
    baseline_days: 14, baseline_start: '2026-05-30', start_date: '2026-06-13',
    end_date: '2026-06-27', status: 'completed', result: null,
    ai_explanation: null, created_at: '2026-06-27T00:00:00Z', ...over,
  }
}
function nights(from: string, count: number, val: (i: number) => number): DailyMetrics[] {
  return Array.from({ length: count }, (_, i) => ({ date: addDays(from, i), sleepDeep: val(i) }))
}

describe('computeResult', () => {
  it('computes means, delta and cohen d when both windows have ≥ MIN_N points', () => {
    const daily = [
      ...nights('2026-05-30', 14, i => 0.8 + (i % 3) * 0.1),   // baseline [05-30, 06-13)
      ...nights('2026-06-13', 15, i => 1.0 + (i % 3) * 0.1),   // exp [06-13, 06-27]
    ]
    const r = computeResult(daily, mkExp())
    expect(r.insufficient).toBeNull()
    expect(r.baselineN).toBe(14)
    expect(r.expN).toBe(15)
    expect(r.baselineMean).toBeCloseTo(0.9, 1)
    expect(r.expMean).toBeCloseTo(1.1, 1)
    expect(r.delta).toBeCloseTo(0.2, 1)
    expect(r.deltaPct).not.toBeNull()
    expect(r.cohenD).not.toBeNull()
  })

  it('window boundaries: baseline is [baseline_start, start), exp is [start, end]', () => {
    const daily: DailyMetrics[] = [
      { date: '2026-05-29', sleepDeep: 9 },  // до baseline — мимо
      { date: '2026-05-30', sleepDeep: 1 },  // baseline
      { date: '2026-06-12', sleepDeep: 1 },  // baseline (последний день)
      { date: '2026-06-13', sleepDeep: 2 },  // exp (start включён)
      { date: '2026-06-27', sleepDeep: 2 },  // exp (end включён)
      { date: '2026-06-28', sleepDeep: 9 },  // после end — мимо
    ]
    const r = computeResult(daily, mkExp())
    expect(r.baselineN).toBe(2)
    expect(r.expN).toBe(2)
  })

  it('reports insufficient baseline (real prod case: sleep data starts inside exp window)', () => {
    const daily = nights('2026-06-11', 17, () => 1) // 06-11..06-27: 2 ночи в базе, 15 в exp
    const r = computeResult(daily, mkExp())
    expect(r.insufficient).toEqual({ window: 'baseline', n: 2, minN: MIN_N })
    expect(r.delta).toBeNull()
    expect(r.deltaPct).toBeNull()
    expect(r.cohenD).toBeNull()
  })

  it('reports insufficient exp window', () => {
    const daily = [...nights('2026-05-30', 14, () => 1), ...nights('2026-06-13', 3, () => 1)]
    const r = computeResult(daily, mkExp())
    expect(r.insufficient).toEqual({ window: 'exp', n: 3, minN: MIN_N })
  })

  it('falls back to start_date − baseline_days when baseline_start is null (not "today")', () => {
    const daily = [...nights('2026-05-30', 14, () => 1), ...nights('2026-06-13', 15, () => 1)]
    const r = computeResult(daily, mkExp({ baseline_start: null }))
    expect(r.baselineN).toBe(14) // окно от старта, старый код считал от Date.now()
  })

  it('unwraps heartRate {avg} objects and scales oxygenSaturation to %', () => {
    const hr: DailyMetrics[] = Array.from({ length: 12 }, (_, i) => ({
      date: addDays('2026-06-08', i), heartRate: { avg: 60 + i, min: 50, max: 90 },
    }))
    const r = computeResult(hr, mkExp({ target_metric: 'heartRate', baseline_start: '2026-06-08', start_date: '2026-06-14', end_date: '2026-06-19' }))
    expect(r.baselineN).toBe(6)
    const ox: DailyMetrics[] = Array.from({ length: 12 }, (_, i) => ({
      date: addDays('2026-06-08', i), oxygenSaturation: 0.97,
    }))
    const r2 = computeResult(ox, mkExp({ target_metric: 'oxygenSaturation', baseline_start: '2026-06-08', start_date: '2026-06-14', end_date: '2026-06-19' }))
    expect(r2.baselineMean).toBe(97)
  })
})

describe('effect + status + misc', () => {
  it('effectLabel thresholds', () => {
    expect(effectLabel(null)).toBe('—')
    expect(effectLabel(0.1)).toBe('нет эффекта')
    expect(effectLabel(-0.3)).toBe('слабый')
    expect(effectLabel(0.6)).toBe('средний')
    expect(effectLabel(0.9)).toBe('сильный')
  })
  it('effectSegments', () => {
    expect(effectSegments(null)).toBe(0)
    expect(effectSegments(0.1)).toBe(1)
    expect(effectSegments(0.9)).toBe(4)
  })
  it('expStatusInfo uses local today', () => {
    const past = mkExp({ status: 'active', end_date: '2020-01-01' })
    expect(expStatusInfo(past).kind).toBe('done')
    const future = mkExp({ status: 'active', start_date: addDays(localDate(), 3), end_date: addDays(localDate(), 10) })
    expect(expStatusInfo(future).kind).toBe('planned')
    expect(expStatusInfo(mkExp({ status: 'cancelled' })).kind).toBe('cancelled')
  })
  it('metric registry', () => {
    expect(isValidMetric('sleepDeep')).toBe(true)
    expect(isValidMetric('nope')).toBe(false)
    expect(metricLabel('sleepDeep')).toBe('Глубокий сон')
    expect(METRIC_OPTIONS.find(m => m.key === 'restingHeartRate')!.betterHigh).toBe(false)
  })
  it('firstMetricDate finds first day with a value for the metric', () => {
    const daily: DailyMetrics[] = [
      { date: '2026-06-01', steps: 100 },
      { date: '2026-06-11', sleepDeep: 1 },
    ]
    expect(firstMetricDate(daily, 'sleepDeep')).toBe('2026-06-11')
    expect(firstMetricDate(daily, 'hrv')).toBeNull()
  })
})
```

- [ ] **Step 2.2:** `npx vitest run src/lib/experiments.test.ts` — FAIL (нет экспортов).

- [ ] **Step 2.3: Реализация** — дописать в `src/lib/experiments.ts`:

```ts
import type { DailyMetrics } from '../types'

export const MIN_N = 5

export interface ExperimentRow {
  id: string
  hypothesis: string
  change_rule: string
  target_metric: string
  baseline_days: number
  baseline_start: string | null
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'cancelled'
  result: ExperimentResult | null
  ai_explanation: string | null
  created_at: string
}

export interface ExperimentResult {
  baselineMean: number | null
  expMean: number | null
  delta: number | null
  deltaPct: number | null
  cohenD: number | null
  baselineN: number
  expN: number
  betterHigh: boolean
  // n < MIN_N в одном из окон: результат недостоверен, показываем объяснение
  insufficient: { window: 'baseline' | 'exp'; n: number; minN: number } | null
}

export const METRIC_OPTIONS: { key: string; label: string; betterHigh: boolean }[] = [
  { key: 'hrv', label: 'HRV', betterHigh: true },
  { key: 'restingHeartRate', label: 'Пульс покоя', betterHigh: false },
  { key: 'sleepHours', label: 'Длительность сна', betterHigh: true },
  { key: 'sleepDeep', label: 'Глубокий сон', betterHigh: true },
  { key: 'sleepREM', label: 'REM сон', betterHigh: true },
  { key: 'steps', label: 'Шаги', betterHigh: true },
  { key: 'activeEnergy', label: 'Активные калории', betterHigh: true },
  { key: 'oxygenSaturation', label: 'SpO₂', betterHigh: true },
  { key: 'heartRate', label: 'ЧСС средняя', betterHigh: false },
]

export const isValidMetric = (k: string) => METRIC_OPTIONS.some(m => m.key === k)
export const metricLabel = (k: string) => METRIC_OPTIONS.find(m => m.key === k)?.label ?? k

function metricValue(d: DailyMetrics, metric: string): number | null {
  const v = d[metric as keyof DailyMetrics]
  if (typeof v === 'number') return metric === 'oxygenSaturation' ? v * 100 : v
  if (typeof v === 'object' && v !== null && 'avg' in v) return (v as { avg: number }).avg
  return null
}

export function firstMetricDate(daily: DailyMetrics[], metric: string): string | null {
  for (const d of daily) if (metricValue(d, metric) !== null) return d.date
  return null
}

function std(vals: number[]): number {
  if (vals.length < 2) return 0
  const m = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.sqrt(vals.reduce((s, x) => s + (x - m) ** 2, 0) / (vals.length - 1))
}
const mean = (vals: number[]): number | null =>
  vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null

export function computeResult(daily: DailyMetrics[], exp: ExperimentRow): ExperimentResult {
  const betterHigh = METRIC_OPTIONS.find(m => m.key === exp.target_metric)?.betterHigh ?? true
  const baseStart = exp.baseline_start ?? computeBaselineStart(exp.start_date, exp.baseline_days)

  const pick = (from: string, toExcl: string | null, toIncl: string | null) => daily
    .filter(d => d.date >= from && (toExcl ? d.date < toExcl : d.date <= toIncl!))
    .map(d => metricValue(d, exp.target_metric))
    .filter((v): v is number => v !== null)

  const baselineVals = pick(baseStart, exp.start_date, null)
  const expVals = pick(exp.start_date, null, exp.end_date)

  const insufficient =
    baselineVals.length < MIN_N ? { window: 'baseline' as const, n: baselineVals.length, minN: MIN_N }
    : expVals.length < MIN_N ? { window: 'exp' as const, n: expVals.length, minN: MIN_N }
    : null

  const bm = mean(baselineVals)
  const em = mean(expVals)
  const base = {
    baselineMean: bm !== null ? +bm.toFixed(1) : null,
    expMean: em !== null ? +em.toFixed(1) : null,
    baselineN: baselineVals.length,
    expN: expVals.length,
    betterHigh,
    insufficient,
  }
  if (insufficient || bm === null || em === null) {
    return { ...base, delta: null, deltaPct: null, cohenD: null }
  }

  const delta = em - bm
  const deltaPct = bm !== 0 ? (delta / bm) * 100 : null
  const s1 = std(baselineVals), s2 = std(expVals)
  const n1 = baselineVals.length, n2 = expVals.length
  const pooled = Math.sqrt(((n1 - 1) * s1 ** 2 + (n2 - 1) * s2 ** 2) / (n1 + n2 - 2))
  const cohenD = pooled > 0 ? delta / pooled : null

  return {
    ...base,
    delta: +delta.toFixed(1),
    deltaPct: deltaPct !== null ? +deltaPct.toFixed(1) : null,
    cohenD: cohenD !== null ? +cohenD.toFixed(2) : null,
  }
}

export function effectLabel(d: number | null): string {
  if (d === null) return '—'
  const abs = Math.abs(d)
  if (abs >= 0.8) return 'сильный'
  if (abs >= 0.5) return 'средний'
  if (abs >= 0.2) return 'слабый'
  return 'нет эффекта'
}

export function effectSegments(d: number | null): number {
  if (d === null) return 0
  const a = Math.abs(d)
  if (a >= 0.8) return 4
  if (a >= 0.5) return 3
  if (a >= 0.2) return 2
  return a > 0 ? 1 : 0
}

export type StatusKind = 'done' | 'active' | 'planned' | 'cancelled'
export function expStatusInfo(exp: ExperimentRow): { kind: StatusKind; label: string } {
  const td = localDate()
  if (exp.status === 'cancelled') return { kind: 'cancelled', label: 'Отменён' }
  if (exp.status === 'completed' || exp.end_date < td) return { kind: 'done', label: 'Завершён' }
  if (exp.start_date > td) return { kind: 'planned', label: 'Запланирован' }
  return { kind: 'active', label: 'Идёт' }
}
```

- [ ] **Step 2.4:** `npx vitest run src/lib/experiments.test.ts` — PASS.
- [ ] **Step 2.5:** `git add -A && git commit -m "feat(experiments): computeResult with MIN_N guard, local-date status, metric registry"`

### Task 3: Переводы новых строк + тест покрытия

**Files:**
- Modify: `src/lib/translations.ts` (добавить блок)
- Test: `src/components/research/ExperimentsScreen.test.ts` (создать)

- [ ] **Step 3.1: Падающий тест**

```ts
// src/components/research/ExperimentsScreen.test.ts
import { describe, it, expect } from 'vitest'
import { ExperimentsScreen } from './ExperimentsScreen'
import { ExperimentCard } from './ExperimentCard'
import { translations } from '../../lib/translations'

// Строки экрана экспериментов: метки эффекта раньше не были переведены
// (в укр. интерфейсе торчало «слабый»), плюс новые строки редизайна.
const EXP_KEYS = [
  'сильный', 'средний', 'слабый', 'нет эффекта',
  'Идёт сейчас', 'Запланированные', 'Завершённые',
  'Мало данных: {n} из {m} дней в базовом периоде.',
  'Мало данных: {n} из {m} дней в периоде эксперимента.',
  'Данные по метрике начинаются {d}.',
  'Начнётся {d}',
  'Не удалось получить разбор. Попробуй ещё раз.',
]

describe('ExperimentsScreen', () => {
  it('exports components', () => {
    expect(typeof ExperimentsScreen).toBe('function')
    expect(typeof ExperimentCard).toBe('function')
  })
  it('has uk + en translations for all experiment strings', () => {
    for (const key of EXP_KEYS) {
      const entry = translations[key]
      expect(entry, `missing translation for "${key}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })
})
```

(Импорт `ExperimentCard` упадёт до Task 4 — поэтому Task 3 и Task 4 коммитятся вместе, либо в Step 3.1 временно закомментировать строку импорта и раскомментировать в Task 4. Проще: выполнить Step 3.2 сразу, тест запускать после Task 4.)

- [ ] **Step 3.2: Добавить переводы** — в `src/lib/translations.ts` рядом с существующим блоком экспериментов (поиск по `'Эксперименты'`):

```ts
  // ── Эксперименты: редизайн + метки эффекта ─────────────────
  'сильный': { uk: 'сильний', en: 'strong' },
  'средний': { uk: 'середній', en: 'medium' },
  'слабый': { uk: 'слабкий', en: 'weak' },
  'нет эффекта': { uk: 'немає ефекту', en: 'no effect' },
  'Идёт сейчас': { uk: 'Йде зараз', en: 'Running now' },
  'Запланированные': { uk: 'Заплановані', en: 'Planned' },
  'Завершённые': { uk: 'Завершені', en: 'Completed' },
  'Мало данных: {n} из {m} дней в базовом периоде.': {
    uk: 'Мало даних: {n} із {m} днів у базовому періоді.',
    en: 'Not enough data: {n} of {m} days in the baseline period.',
  },
  'Мало данных: {n} из {m} дней в периоде эксперимента.': {
    uk: 'Мало даних: {n} із {m} днів у періоді експерименту.',
    en: 'Not enough data: {n} of {m} days in the experiment period.',
  },
  'Данные по метрике начинаются {d}.': {
    uk: 'Дані за метрикою починаються {d}.',
    en: 'Metric data starts on {d}.',
  },
  'Начнётся {d}': { uk: 'Почнеться {d}', en: 'Starts {d}' },
  'Не удалось получить разбор. Попробуй ещё раз.': {
    uk: 'Не вдалося отримати розбір. Спробуй ще раз.',
    en: 'Could not get the explanation. Try again.',
  },
```

Перед добавлением проверить `grep -n "'слабый'\|'сильный'" src/lib/translations.ts` — дублей быть не должно.

- [ ] **Step 3.3:** Коммит вместе с Task 4 (см. Step 4.6).

### Task 4: `ExperimentCard.tsx` — карточка эксперимента

**Files:**
- Create: `src/components/research/ExperimentCard.tsx`

Презентационный компонент. Переиспользует существующие CSS-классы `exp-detail-head*`, `exp-status*`, `exp-chips/exp-chip`, `exp-compare/exp-cmp-*`, `exp-effect/exp-seg`, `exp-progress*`, `exp-ai-card`, `concern-del-btn`. Новые классы — Task 6.

- [ ] **Step 4.1: Написать компонент**

```tsx
// src/components/research/ExperimentCard.tsx
import { useState } from 'react'
import type { DailyMetrics } from '../../types'
import { useT } from '../../lib/i18n'
import {
  computeResult, expStatusInfo, effectLabel, effectSegments, metricLabel,
  firstMetricDate, daysBetween, localDate,
  type ExperimentRow, type ExperimentResult,
} from '../../lib/experiments'

interface Props {
  exp: ExperimentRow
  daily: DailyMetrics[]
  aiLoading: boolean
  aiError: string | null
  onExplain: (exp: ExperimentRow, result: ExperimentResult) => void
  onDelete: (id: string) => void
}

function ResultRow({ r, t }: { r: ExperimentResult; t: (k: string, p?: Record<string, string | number>) => string }) {
  const improved = r.delta !== null && ((r.betterHigh && r.delta > 0) || (!r.betterHigh && r.delta < 0))
  const worse = r.delta !== null && r.delta !== 0 && !improved
  const color = improved ? 'var(--green)' : worse ? 'var(--red)' : 'var(--text-muted)'
  const bg = improved
    ? 'color-mix(in srgb, var(--green) 12%, transparent)'
    : worse ? 'color-mix(in srgb, var(--red) 12%, transparent)' : 'var(--surface2)'
  const sign = r.delta !== null && r.delta > 0 ? '+' : ''
  const segs = effectSegments(r.cohenD)
  return (
    <div className="exp-result">
      <div className="exp-compare">
        <div className="exp-cmp-cell">
          <div className="exp-cmp-label">{t('До')}</div>
          <div className="exp-cmp-val">{r.baselineMean}</div>
          <div className="exp-cmp-n">n = {r.baselineN}</div>
        </div>
        <div className="exp-cmp-arrow" aria-hidden>→</div>
        <div className="exp-cmp-cell">
          <div className="exp-cmp-label">{t('Во время')}</div>
          <div className="exp-cmp-val">{r.expMean}</div>
          <div className="exp-cmp-n">n = {r.expN}</div>
        </div>
        <div className="exp-cmp-cell exp-cmp-delta" style={{ background: bg }}>
          <div className="exp-cmp-label" style={{ color }}>{t('Изменение')}</div>
          <div className="exp-cmp-val" style={{ color }}>{sign}{r.delta}</div>
          <div className="exp-cmp-pct" style={{ color }}>{sign}{r.deltaPct}%</div>
        </div>
      </div>
      {r.cohenD !== null && (
        <div className="exp-effect">
          <span>{t('Размер эффекта')} <b>d = {r.cohenD}</b> · {t(effectLabel(r.cohenD))}</span>
          <span className="exp-effect-meter" aria-hidden>
            {[0, 1, 2, 3].map(i => <span key={i} className={`exp-seg${i < segs ? ' on' : ''}`} />)}
          </span>
        </div>
      )}
      <p className="exp-result-caveat">{t('Наблюдение, не доказательство. Другие факторы могут объяснять изменение.')}</p>
    </div>
  )
}

export function ExperimentCard({ exp, daily, aiLoading, aiError, onExplain, onDelete }: Props) {
  const { t } = useT()
  const [showAI, setShowAI] = useState(false)
  const st = expStatusInfo(exp)
  const result = computeResult(daily, exp)
  const hasResult = st.kind !== 'planned' && result.insufficient === null
    && result.baselineMean !== null && result.expMean !== null

  const total = Math.max(1, daysBetween(exp.start_date, exp.end_date))
  const elapsed = Math.min(total, Math.max(0, daysBetween(exp.start_date, localDate())))

  const firstDate = result.insufficient ? firstMetricDate(daily, exp.target_metric) : null
  const insufficientMsg = result.insufficient && (
    result.insufficient.window === 'baseline'
      ? t('Мало данных: {n} из {m} дней в базовом периоде.', { n: result.insufficient.n, m: result.insufficient.minN })
      : t('Мало данных: {n} из {m} дней в периоде эксперимента.', { n: result.insufficient.n, m: result.insufficient.minN })
  )

  return (
    <div className={`expd-card${st.kind === 'active' ? ' expd-card-hero' : ''}`}>
      <div className="exp-detail-head">
        <div className="exp-detail-head-main">
          <h3 className="exp-detail-title">{exp.hypothesis}</h3>
          <p className="exp-detail-rule">{t('Меняем')}: {exp.change_rule}</p>
        </div>
        <div className="exp-detail-head-side">
          <span className={`exp-status exp-status-${st.kind}`}>{t(st.label)}</span>
          <button onClick={() => onDelete(exp.id)} className="concern-del-btn" title={t('Удалить')}>✕</button>
        </div>
      </div>

      <div className="exp-chips">
        <span className="exp-chip">{metricLabel(exp.target_metric)}</span>
        <span className="exp-chip">{t('Базовый')}: {exp.baseline_days} {t('дн')}</span>
        <span className="exp-chip">{exp.start_date} – {exp.end_date}</span>
      </div>

      {st.kind === 'active' && (
        <div className="exp-progress">
          <div className="exp-progress-bar"><span style={{ width: `${Math.round((elapsed / total) * 100)}%` }} /></div>
          <p className="exp-progress-text">
            {t('День {d} из {n}', { d: elapsed, n: total })}. {t('Результаты появятся после завершения')}.
          </p>
        </div>
      )}

      {st.kind === 'planned' && (
        <p className="settings-muted expd-note">{t('Начнётся {d}', { d: exp.start_date })}</p>
      )}

      {(st.kind === 'done' || st.kind === 'cancelled') && (hasResult
        ? <ResultRow r={result} t={t} />
        : (
          <div className="expd-nodata">
            <span aria-hidden>▫</span>
            <span>
              {insufficientMsg ?? t('Недостаточно данных для сравнения.')}
              {firstDate && <> {t('Данные по метрике начинаются {d}.', { d: firstDate })}</>}
            </span>
          </div>
        )
      )}

      {hasResult && exp.ai_explanation && (
        <div className="exp-ai-card">
          <button className="exp-ai-card-head expd-ai-toggle" onClick={() => setShowAI(s => !s)}>
            {t('Разбор ИИ')} {showAI ? '▴' : '▾'}
          </button>
          {showAI && <p>{exp.ai_explanation}</p>}
        </div>
      )}
      {hasResult && !exp.ai_explanation && (
        <>
          <button className="btn btn-secondary exp-ai-btn" disabled={aiLoading}
            onClick={() => onExplain(exp, result)}>
            {aiLoading ? t('Объясняет ИИ…') : t('Объяснить результат (ИИ)')}
          </button>
          {aiError && <p className="expd-ai-error">{aiError}</p>}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4.2:** Проверить, что `concern-del-btn` существует: `grep -n "concern-del-btn" src/index.css` (используется текущим экраном; если класса нет в css — он наследуется откуда-то ещё, оставить как в текущем коде).
- [ ] **Step 4.3:** `npx vitest run src/components/research/ExperimentsScreen.test.ts` — всё ещё FAIL (нет нового ExperimentsScreen-экспорта? экспорт есть; FAIL только если Task 5 не сделан — допустимо, тест добьём после Task 5).
- [ ] **Step 4.4:** Пока не коммитим — Task 3+4+5+6 идут одним связным коммитом после зелёных тестов (Step 5.6).

### Task 5: Переписать `ExperimentsScreen.tsx` на секции

**Files:**
- Modify: `src/components/research/ExperimentsScreen.tsx` (полная замена содержимого)

- [ ] **Step 5.1: Новый экран**

Сохраняется вся механика загрузки/создания/предложений/refine (`loadExps`, prefill из `sessionStorage`, `handleSuggest`, `handleRefine`, `applySuggestion`, форма) — копируется из текущего файла без изменений, КРОМЕ перечисленного ниже. Локальные `METRIC_OPTIONS`, `isValidMetric`, `metricLabel`, `today`, `daysAgo`, `daysBetween`, `expStatusInfo`, `std`, `mean`, `computeResult`, `effectLabel`, `effectSegments`, `ResultBlock`, `ProgressBlock`, интерфейсы `Experiment`/`ExperimentResult` — УДАЛЯЮТСЯ, импортируются из `../../lib/experiments` (тип строки — `ExperimentRow`). `daysAgo(14)` в дефолте формы заменяется на `addDays(localDate(), -14)`.

Изменения по существу:

```tsx
// вместо старого baseline_start-выражения в handleCreate:
const { data, error } = await supabase.from('experiments').insert({
  user_id: user.id,
  hypothesis: form.hypothesis,
  change_rule: form.change_rule,
  target_metric: form.target_metric,
  baseline_days: form.baseline_days,
  baseline_start: computeBaselineStart(form.start_date, form.baseline_days),
  start_date: form.start_date,
  end_date: form.end_date,
  status: form.end_date < localDate() ? 'completed' : 'active',
}).select().single()
```

```tsx
// handleAI: ошибки видимы, результат-снапшот пишется только с разбором
const [aiError, setAiError] = useState<string | null>(null)

async function handleAI(exp: ExperimentRow, result: ExperimentResult) {
  setAiLoading(exp.id); setAiError(null)
  try {
    const prompt = `Эксперимент: "${exp.hypothesis}". Изменение: "${exp.change_rule}". Метрика: ${metricLabel(exp.target_metric)}. До: ${result.baselineMean} (n=${result.baselineN}). Во время: ${result.expMean} (n=${result.expN}). Дельта: ${result.delta} (${result.deltaPct}%). d Коэна: ${result.cohenD} (${effectLabel(result.cohenD)}). Объясни результат кратко: что наблюдается, возможные объяснения, оговорки. На русском, 3-5 предложений.`
    const json = await callFunction<{ reply?: string }>('deep-research', { findings: prompt, periodLabel: `${exp.baseline_days} дн` })
    const explanation = json.reply ?? ''
    if (!explanation) throw new Error('empty reply')
    await supabase.from('experiments').update({ result, ai_explanation: explanation }).eq('id', exp.id)
    setExps(prev => prev.map(e => e.id === exp.id ? { ...e, result, ai_explanation: explanation } : e))
  } catch {
    setAiError(t('Не удалось получить разбор. Попробуй ещё раз.'))
  }
  setAiLoading(null)
}
```

Рендер списка (вместо `research-layout` + `active`-детали; `activeId` больше не нужен):

```tsx
const active = exps.filter(e => expStatusInfo(e).kind === 'active')
const planned = exps.filter(e => expStatusInfo(e).kind === 'planned')
const finished = exps.filter(e => ['done', 'cancelled'].includes(expStatusInfo(e).kind))

const renderCards = (list: ExperimentRow[]) => list.map(exp => (
  <ExperimentCard key={exp.id} exp={exp} daily={daily}
    aiLoading={aiLoading === exp.id}
    aiError={aiError?.id === exp.id ? aiError.msg : null}
    onExplain={handleAI} onDelete={handleDelete} />
))
```

`aiError` хранится с id карточки, чтобы ошибка показывалась только там, где кликали: `const [aiError, setAiError] = useState<{ id: string; msg: string } | null>(null)`; в `handleAI` при ошибке — `setAiError({ id: exp.id, msg: t('Не удалось получить разбор. Попробуй ещё раз.') })` (соответственно строку `setAiError(null)` в начале `handleAI` оставить, а сниппет `handleAI` выше читать с этой поправкой).

```tsx
{exps.length === 0 && !showForm ? (
  <div className="exp-empty">…как сейчас…</div>
) : (
  <div className="expd-sections">
    {active.length > 0 && <>
      <div className="expd-section-title">{t('Идёт сейчас')}</div>
      <div className="expd-list">{renderCards(active)}</div>
    </>}
    {planned.length > 0 && <>
      <div className="expd-section-title">{t('Запланированные')}</div>
      <div className="expd-list">{renderCards(planned)}</div>
    </>}
    {finished.length > 0 && <>
      <div className="expd-section-title">{t('Завершённые')}</div>
      <div className="expd-list">{renderCards(finished)}</div>
    </>}
  </div>
)}
```

`handleDelete` — как сейчас, минус `setActiveId`.

- [ ] **Step 5.2:** `grep -n "research-layout\|research-run" src/components/research/ExperimentsScreen.tsx` — пусто (классы остаются в css для ResearchScreen).
- [ ] **Step 5.3:** `npx vitest run` — все тесты PASS (включая Task 3).
- [ ] **Step 5.4:** `npm run build` — зелёный (tsc поймает несостыковки типов).
- [ ] **Step 5.5:** `npm run lint` — новых ошибок нет (сравнить с `git stash && npm run lint`-базой не нужно: просто убедиться, что счётчик не вырос относительно main).
- [ ] **Step 5.6:** `git add -A && git commit -m "feat(experiments): mate-style sectioned dashboard, MIN_N guard in UI, visible AI errors"`

### Task 6: CSS новых классов

**Files:**
- Modify: `src/index.css` (после блока `.exp-run-tag`/`@media 540px`, строка ~1718)

- [ ] **Step 6.1: Добавить стили**

```css
/* Эксперименты — mate-style дашборд (секции + полноширинные карточки) */
.expd-sections { margin-top: 20px; }
.expd-section-title { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 18px 0 8px; }
.expd-section-title:first-child { margin-top: 0; }
.expd-list { display: flex; flex-direction: column; gap: 12px; }
.expd-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; }
.expd-card-hero { border-color: color-mix(in srgb, var(--accent) 35%, transparent); }
.expd-note { margin: 4px 0 0; }
.expd-nodata { display: flex; gap: 10px; align-items: flex-start; background: var(--surface2); border-radius: 10px; padding: 12px 14px; font-size: 13px; color: var(--text-muted); line-height: 1.5; }
.expd-ai-toggle { background: none; border: none; cursor: pointer; padding: 0; display: block; width: 100%; text-align: left; }
.expd-ai-error { font-size: 13px; color: var(--red); margin: 8px 0 0; }
```

- [ ] **Step 6.2:** `npm run build` — зелёный.
- [ ] **Step 6.3:** `git add src/index.css && git commit -m "style(experiments): mate-style dashboard css"`

### Task 7: SQL-миграция для существующих строк

**Files:**
- Create: `supabase/migrations/20260711100000_fix_experiments_baseline_start.sql`

- [ ] **Step 7.1: Написать миграцию**

```sql
-- Старая формула создания эксперимента писала baseline_start = start_date − 2×baseline_days
-- (окно вдвое длиннее заявленного). Приводим к контракту: start_date − baseline_days.
update public.experiments
set baseline_start = start_date - baseline_days * interval '1 day'
where baseline_start is distinct from (start_date - baseline_days * interval '1 day')::date;
```

- [ ] **Step 7.2:** `git add supabase/migrations/*.sql && git commit -m "fix(db): correct experiments.baseline_start to start_date - baseline_days"`
- [ ] **Step 7.3:** НЕ деплоить миграцию из этой сессии (нужен пароль БД, `db push` — ручной шаг пользователя; отметить в PR-описании).

### Task 8: Верификация и PR

- [ ] **Step 8.1:** `npm test` — всё зелёное. `npm run build` — зелёный. `npm run lint` — без новых ошибок.
- [ ] **Step 8.2: Визуальная проверка** (скилл `running-tonus`): `.env.local` с `VITE_DEMO=1`, `npm run dev`, открыть `/#experiments` через preview-браузер. В демо-режиме экспериментов может не быть — проверяется рендер экрана, пустое состояние, форма «+ Новый», обе темы (переключатель в шапке). Скриншоты в ответ пользователю.
- [ ] **Step 8.3:** Запросить код-ревью (скилл superpowers:requesting-code-review), затем superpowers:finishing-a-development-branch: PR в `main` с описанием (фиксы, редизайн, ручной шаг: `supabase db push` для миграции — до/независимо от фронт-деплоя; фронт задеплоится сам при мердже по зелёному CI).

## Соответствие критериям приёмки спеки

1. baseline_start: Task 2 (fallback), Task 5 (создание), Task 7 (данные).
2. Порог n ≥ 5 + объясняющее состояние: Task 2 + Task 4.
3. Секционный дашборд: Task 4–6.
4. Переводы: Task 3.
5. Зелёные тесты/сборка/линт: Task 8.
