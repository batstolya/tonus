# Doctor report v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the doctor report on one model that covers every metric the app already stores, states its own data gaps, and renders both to the printed page and to markdown the user can paste into an external AI chat.

**Architecture:** `lib/doctorReport.ts` becomes a folder of pure modules (metric registry, deviations, sleep, labs, supplements, concerns/journal) plus a loader and an assembler. `buildReportModel()` returns a `DoctorReportModel`; `DoctorReport.tsx` renders that model as print tables, and `toMarkdown()` renders the same model as text. No server work: the edge function only receives a richer digest.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest (node project for `*.test.ts`, jsdom for `*.test.tsx`), Supabase JS client, existing i18n dictionary.

## Global Constraints

- **Node 24 for everything.** `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` before any npm/npx command. Node 18 fails on modern syntax.
- **Run tests from `apps/web`**, and with `VITE_DEMO=` cleared: `VITE_DEMO= npx vitest run --project node <path>`. A `VITE_DEMO=1` left in `.env.local` breaks unrelated suites.
- **Lint is zero-tolerance:** `npm run lint` runs eslint with `--max-warnings 0`. Any new warning fails CI.
- **English-only in the repo** — code comments, commit messages, identifiers, docs. The two exceptions are product UI strings and i18n values, which stay Russian/Ukrainian.
- **Report body strings are Russian dictionary keys.** The report renders through `rt(key)`, which returns the key itself for `ru` and `translations[key].en` for `en`. Every new user-visible string must be added to `src/lib/translations/settings.ts` **and** to the `KEYS` array in `src/components/settings/DoctorReport.test.ts`, or that test fails.
- **Никаких интерпретаций в теле отчёта.** Only measured values and arithmetic over them. Derived indices (sleep efficiency, time in bed) were prototyped and rejected — see spec §3.5.
- **Demo mode must render every section** (`isDemoActive()` → `demoList(table)`), because the demo fixture is the screenshot stand.
- Spec: `docs/superpowers/specs/2026-07-31-doctor-report-v2-design.md`.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/lib/doctorReport/metrics.ts` | Metric registry (label, getter, digits, minRel, baseline) and period summaries |
| `src/lib/doctorReport/weekly.ts` | Monday bucketing, weekly means, coverage and gap detection |
| `src/lib/doctorReport/deviations.ts` | median/MAD statistics and week-level deviation detection |
| `src/lib/doctorReport/sleep.ts` | Per-night rows and sleep section counters |
| `src/lib/doctorReport/labs.ts` | `parseRefRange`, `latestLabs` (moved), plus period awareness and full series |
| `src/lib/doctorReport/supplements.ts` | Adherence measured from first logged intake |
| `src/lib/doctorReport/journal.ts` | Concern severity trends and wellbeing/journal aggregation |
| `src/lib/doctorReport/load.ts` | Loads every source into one `ReportSources` (demo-aware) |
| `src/lib/doctorReport/model.ts` | `DoctorReportModel` types and `buildReportModel()` |
| `src/lib/doctorReport/markdown.ts` | `toMarkdown(model, lang)` |
| `src/lib/doctorReport/index.ts` | Re-exports the public surface |

**Modified:** `src/components/settings/DoctorReport.tsx` (render the model, add the copy button), `src/components/settings/DoctorReport.test.ts` (new keys), `src/lib/translations/settings.ts` (new strings), `src/index.css` or the existing doctor-report styles (new table classes).

**Deleted:** `src/lib/doctorReport.ts`, `src/lib/doctorReport.test.ts` (content migrates into the new modules), `src/lib/__sample-doctor-report.test.ts` (throwaway preview generator).

---

### Task 1: Metric registry and period summaries

**Files:**
- Create: `apps/web/src/lib/doctorReport/metrics.ts`
- Create: `apps/web/src/lib/doctorReport/metrics.test.ts`

**Interfaces:**
- Consumes: `DailyMetrics` from `src/types`, `computeDailyScores` from `src/lib/scores`.
- Produces: `METRIC_DEFS: MetricDef[]`, `type MetricKey`, `summarizeMetrics(daily, periodDays, today?): MetricSummary[]`, `avgTimeOfDay(isoList: string[]): string | null`, `periodSlice(daily, periodDays, today?): DailyMetrics[]`, `periodStart(periodDays, today?): string`, `addDays(date, n): string`, `avg(v: number[]): number`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/doctorReport/metrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { METRIC_DEFS, summarizeMetrics, avgTimeOfDay, addDays } from './metrics'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'
const day = (date: string, over: Partial<DailyMetrics> = {}): DailyMetrics => ({ date, ...over })

describe('METRIC_DEFS', () => {
  it('covers every numeric field of DailyMetrics', () => {
    expect(METRIC_DEFS.map(m => m.key)).toEqual([
      'rhr', 'hrv', 'hrAvg', 'hrMin', 'hrMax', 'walkHr', 'spo2', 'resp', 'temp',
      'vo2', 'sleep', 'deep', 'rem', 'core', 'steps', 'dist', 'kcal', 'exer', 'floors',
    ])
  })

  it('gives every metric its own deviation threshold', () => {
    for (const m of METRIC_DEFS) expect(m.minRel).toBeGreaterThan(0)
  })
})

describe('summarizeMetrics', () => {
  it('reports avg/min/max and coverage', () => {
    const daily = [
      day(addDays(today, -2), { restingHeartRate: 58 }),
      day(addDays(today, -1), { restingHeartRate: 62 }),
      day(today, { restingHeartRate: 60 }),
    ]
    const s = summarizeMetrics(daily, 30, today).find(m => m.key === 'rhr')!
    expect(s.avg).toBe(60)
    expect(s.min).toBe(58)
    expect(s.max).toBe(62)
    expect(s.daysWithData).toBe(3)
  })

  it('omits metrics with no data instead of returning empty rows', () => {
    const out = summarizeMetrics([day(today, { steps: 100 })], 30, today)
    expect(out.map(m => m.key)).toEqual(['steps'])
  })

  it('converts oxygen saturation from fraction to percent', () => {
    const out = summarizeMetrics([day(today, { oxygenSaturation: 0.97 })], 30, today)
    expect(out[0].avg).toBe(97)
  })

  it('drops days outside the period', () => {
    const daily = [day(addDays(today, -40), { steps: 1 }), day(today, { steps: 10 })]
    const s = summarizeMetrics(daily, 30, today).find(m => m.key === 'steps')!
    expect(s.daysWithData).toBe(1)
    expect(s.avg).toBe(10)
  })
})

describe('avgTimeOfDay', () => {
  it('averages times that straddle midnight without landing at noon', () => {
    const out = avgTimeOfDay(['2026-07-30T23:40:00', '2026-07-31T00:20:00'])
    expect(out).toBe('00:00')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/metrics.test.ts
```

Expected: FAIL — `Failed to resolve import "./metrics"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/doctorReport/metrics.ts`:

```ts
// Metric registry for the doctor report: one entry per numeric field the app
// stores, so adding a metric to DailyMetrics means adding one row here.
import type { DailyMetrics } from '../../types'

export type MetricKey =
  | 'rhr' | 'hrv' | 'hrAvg' | 'hrMin' | 'hrMax' | 'walkHr' | 'spo2' | 'resp'
  | 'temp' | 'vo2' | 'sleep' | 'deep' | 'rem' | 'core' | 'steps' | 'dist'
  | 'kcal' | 'exer' | 'floors'

export type BaselineKey = 'rhr' | 'hrv' | 'sleep' | 'steps'

export interface MetricDef {
  key: MetricKey
  /** Russian dictionary key — rendered through rt() for the en report. */
  label: string
  get: (d: DailyMetrics) => number | undefined
  digits: number
  /** Minimum relative shift worth reporting as a deviation, in percent. */
  minRel: number
  baseline?: BaselineKey
}

export const METRIC_DEFS: MetricDef[] = [
  { key: 'rhr', label: 'Пульс покоя, уд/мин', get: d => d.restingHeartRate, digits: 0, minRel: 5, baseline: 'rhr' },
  { key: 'hrv', label: 'HRV, мс', get: d => d.hrv, digits: 0, minRel: 12, baseline: 'hrv' },
  { key: 'hrAvg', label: 'Пульс средний, уд/мин', get: d => d.heartRate?.avg, digits: 0, minRel: 5 },
  { key: 'hrMin', label: 'Пульс минимальный, уд/мин', get: d => d.heartRate?.min, digits: 0, minRel: 6 },
  { key: 'hrMax', label: 'Пульс максимальный, уд/мин', get: d => d.heartRate?.max, digits: 0, minRel: 8 },
  { key: 'walkHr', label: 'Пульс при ходьбе, уд/мин', get: d => d.walkingHeartRate, digits: 0, minRel: 6 },
  { key: 'spo2', label: 'SpO₂, %', get: d => (d.oxygenSaturation != null ? d.oxygenSaturation * 100 : undefined), digits: 1, minRel: 2 },
  { key: 'resp', label: 'Частота дыхания, /мин', get: d => d.respiratoryRate, digits: 1, minRel: 8 },
  { key: 'temp', label: 'Температура запястья, °C', get: d => d.wristTemperature, digits: 2, minRel: 1 },
  { key: 'vo2', label: 'VO₂max, мл/кг/мин', get: d => d.vo2max, digits: 1, minRel: 8 },
  { key: 'sleep', label: 'Сон общий, ч', get: d => d.sleepHours, digits: 1, minRel: 10, baseline: 'sleep' },
  { key: 'deep', label: 'Глубокий сон, ч', get: d => d.sleepDeep, digits: 1, minRel: 20 },
  { key: 'rem', label: 'REM-сон, ч', get: d => d.sleepREM, digits: 1, minRel: 20 },
  { key: 'core', label: 'Лёгкий сон, ч', get: d => d.sleepCore, digits: 1, minRel: 15 },
  { key: 'steps', label: 'Шаги', get: d => d.steps, digits: 0, minRel: 25, baseline: 'steps' },
  { key: 'dist', label: 'Дистанция, км', get: d => d.distance, digits: 1, minRel: 25 },
  { key: 'kcal', label: 'Активные ккал', get: d => d.activeEnergy, digits: 0, minRel: 25 },
  { key: 'exer', label: 'Минуты упражнений', get: d => d.exerciseMinutes, digits: 0, minRel: 40 },
  { key: 'floors', label: 'Этажи', get: d => d.flightsClimbed, digits: 0, minRel: 40 },
]

export interface MetricSummary {
  key: MetricKey
  label: string
  digits: number
  avg: number
  min: number
  max: number
  /** Deviation of the period average from the personal baseline, percent. */
  baselinePct: number | null
  daysWithData: number
  daysInPeriod: number
}

export const avg = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const localDate = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const periodStart = (periodDays: number, today: string = localDate()): string =>
  addDays(today, -periodDays + 1)

export function periodSlice(daily: DailyMetrics[], periodDays: number, today: string = localDate()): DailyMetrics[] {
  const from = periodStart(periodDays, today)
  return daily.filter(d => d.date >= from && d.date <= today).sort((a, b) => a.date.localeCompare(b.date))
}

export function summarizeMetrics(
  daily: DailyMetrics[],
  periodDays: number,
  today: string = localDate(),
  baselines: Partial<Record<BaselineKey, number | null>> = {},
): MetricSummary[] {
  const slice = periodSlice(daily, periodDays, today)
  const out: MetricSummary[] = []
  for (const m of METRIC_DEFS) {
    const vals = slice.map(m.get).filter((v): v is number => typeof v === 'number')
    if (!vals.length) continue
    const a = avg(vals)
    const base = m.baseline ? baselines[m.baseline] ?? null : null
    out.push({
      key: m.key,
      label: m.label,
      digits: m.digits,
      avg: +a.toFixed(m.digits),
      min: +Math.min(...vals).toFixed(m.digits),
      max: +Math.max(...vals).toFixed(m.digits),
      baselinePct: base != null && base > 0 ? Math.round(((a - base) / base) * 100) : null,
      daysWithData: vals.length,
      daysInPeriod: slice.length,
    })
  }
  return out
}

// Average time of day. Times straddling midnight are shifted past 24:00 before
// averaging, otherwise 23:40 and 00:20 average to noon instead of midnight.
export function avgTimeOfDay(isoList: string[]): string | null {
  if (!isoList.length) return null
  const mins = isoList.map(iso => {
    const d = new Date(iso)
    return d.getHours() * 60 + d.getMinutes()
  })
  const straddles = Math.max(...mins) - Math.min(...mins) > 720
  const use = straddles ? mins.map(m => (m < 720 ? m + 1440 : m)) : mins
  const m = Math.round(avg(use)) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/metrics.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/doctorReport/metrics.ts apps/web/src/lib/doctorReport/metrics.test.ts
git commit -m "feat(web): metric registry for the doctor report"
```

---

### Task 2: Weekly buckets and coverage gaps

**Files:**
- Create: `apps/web/src/lib/doctorReport/weekly.ts`
- Create: `apps/web/src/lib/doctorReport/weekly.test.ts`

**Interfaces:**
- Consumes: `METRIC_DEFS`, `MetricKey`, `periodSlice`, `periodStart`, `addDays`, `avg` from `./metrics`.
- Produces: `mondayOf(date): string`, `weekBuckets(daily, periodDays, today?): WeekBucket[]`, `weeklyRows(daily, periodDays, today?): WeeklyRow[]`, `WEEKLY_KEYS: MetricKey[]`, `coverage(daily, periodDays, today?): { gaps: CoverageGap[]; missingDates: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/doctorReport/weekly.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mondayOf, weeklyRows, coverage } from './weekly'
import { addDays } from './metrics'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31' // Friday
const day = (date: string, over: Partial<DailyMetrics> = {}): DailyMetrics => ({ date, ...over })

describe('mondayOf', () => {
  it('returns the Monday of the containing week', () => {
    expect(mondayOf('2026-07-31')).toBe('2026-07-27')
    expect(mondayOf('2026-07-27')).toBe('2026-07-27')
  })
})

describe('weeklyRows', () => {
  it('averages each metric inside its week and counts days', () => {
    const daily = [
      day('2026-07-27', { restingHeartRate: 58, steps: 8000 }),
      day('2026-07-28', { restingHeartRate: 62, steps: 10000 }),
    ]
    const rows = weeklyRows(daily, 30, today)
    expect(rows).toHaveLength(1)
    expect(rows[0].weekStart).toBe('2026-07-27')
    expect(rows[0].days).toBe(2)
    expect(rows[0].values.rhr).toBe(60)
    expect(rows[0].values.steps).toBe(9000)
  })
})

describe('coverage', () => {
  it('reports a gap when a metric misses at least 10% of days', () => {
    const daily = Array.from({ length: 10 }, (_, i) =>
      day(addDays(today, -9 + i), { steps: 1000, ...(i < 5 ? { hrv: 40 } : {}) }))
    const { gaps } = coverage(daily, 10, today)
    expect(gaps.map(g => g.key)).toEqual(['hrv'])
    expect(gaps[0].daysWithData).toBe(5)
    expect(gaps[0].missingPct).toBe(50)
  })

  it('lists days with no record at all', () => {
    const daily = [day(addDays(today, -2), { steps: 1 }), day(today, { steps: 1 })]
    const { missingDates } = coverage(daily, 3, today)
    expect(missingDates).toEqual([addDays(today, -1)])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/weekly.test.ts
```

Expected: FAIL — `Failed to resolve import "./weekly"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/doctorReport/weekly.ts`:

```ts
import type { DailyMetrics } from '../../types'
import { METRIC_DEFS, addDays, avg, localDate, periodSlice, periodStart, type MetricKey } from './metrics'

/** Metrics dense enough to be worth a column in the weekly table. */
export const WEEKLY_KEYS: MetricKey[] = ['rhr', 'hrv', 'sleep', 'deep', 'rem', 'spo2', 'resp', 'steps', 'exer']

export function mondayOf(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  return addDays(date, -((d.getUTCDay() + 6) % 7))
}

export interface WeekBucket { weekStart: string; rows: DailyMetrics[] }

export function weekBuckets(daily: DailyMetrics[], periodDays: number, today: string = localDate()): WeekBucket[] {
  const weeks = new Map<string, DailyMetrics[]>()
  for (const d of periodSlice(daily, periodDays, today)) {
    const wk = mondayOf(d.date)
    weeks.set(wk, [...(weeks.get(wk) ?? []), d])
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, rows]) => ({ weekStart, rows }))
}

export interface WeeklyRow {
  weekStart: string
  days: number
  values: Partial<Record<MetricKey, number>>
}

export function weeklyRows(daily: DailyMetrics[], periodDays: number, today: string = localDate()): WeeklyRow[] {
  return weekBuckets(daily, periodDays, today).map(({ weekStart, rows }) => {
    const values: Partial<Record<MetricKey, number>> = {}
    for (const m of METRIC_DEFS) {
      const v = rows.map(m.get).filter((x): x is number => typeof x === 'number')
      if (v.length) values[m.key] = +avg(v).toFixed(m.digits)
    }
    return { weekStart, days: rows.length, values }
  })
}

export interface CoverageGap {
  key: MetricKey
  label: string
  daysWithData: number
  daysInPeriod: number
  missingPct: number
}

/**
 * Coverage is reported, not corrected: a language model reading the report
 * treats silence as normality unless the gaps are spelled out.
 */
export function coverage(
  daily: DailyMetrics[],
  periodDays: number,
  today: string = localDate(),
): { gaps: CoverageGap[]; missingDates: string[] } {
  const slice = periodSlice(daily, periodDays, today)
  const gaps: CoverageGap[] = []
  for (const m of METRIC_DEFS) {
    const withData = slice.filter(d => typeof m.get(d) === 'number').length
    if (!withData || !slice.length) continue
    const missingPct = Math.round((1 - withData / slice.length) * 100)
    if (missingPct >= 10) {
      gaps.push({ key: m.key, label: m.label, daysWithData: withData, daysInPeriod: slice.length, missingPct })
    }
  }
  const have = new Set(slice.map(d => d.date))
  const start = periodStart(periodDays, today)
  const missingDates: string[] = []
  for (let i = 0; i < periodDays; i++) {
    const date = addDays(start, i)
    if (date > today) break
    if (!have.has(date)) missingDates.push(date)
  }
  return { gaps, missingDates }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/weekly.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/doctorReport/weekly.ts apps/web/src/lib/doctorReport/weekly.test.ts
git commit -m "feat(web): weekly buckets and coverage gaps for the doctor report"
```

---

### Task 3: Deviation detection

Three naive versions of this failed on real-shaped data; the tests below encode why. Do not replace median/MAD with mean/σ.

**Files:**
- Create: `apps/web/src/lib/doctorReport/deviations.ts`
- Create: `apps/web/src/lib/doctorReport/deviations.test.ts`

**Interfaces:**
- Consumes: `METRIC_DEFS`, `avg`, `localDate` from `./metrics`; `weekBuckets` from `./weekly`.
- Produces: `median(v: number[]): number`, `mad(v: number[]): number`, `detectDeviations(daily, periodDays, today?): DeviationWeek[]`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/doctorReport/deviations.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { median, mad, detectDeviations } from './deviations'
import { addDays } from './metrics'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'

// 12 flat weeks ending today, then a caller-supplied override for one week.
function fixture(sick: (i: number) => Partial<DailyMetrics> | null): DailyMetrics[] {
  return Array.from({ length: 84 }, (_, i) => {
    const date = addDays(today, -83 + i)
    return { date, restingHeartRate: 58, sleepHours: 7, steps: 9000, ...(sick(i) ?? {}) }
  })
}

describe('median and mad', () => {
  it('mad is not inflated by the outlier it must find', () => {
    const flat = [10, 10, 10, 10, 10, 10, 10, 10, 10, 40]
    expect(median(flat)).toBe(10)
    expect(mad(flat)).toBe(0)
    // the mean-and-sigma pair would have hidden it: sigma here is ~9
  })
})

describe('detectDeviations', () => {
  it('surfaces a week where several metrics move together', () => {
    // days 56..62 are one full week: resting HR up, sleep down, steps down
    const daily = fixture(i => (i >= 56 && i < 63
      ? { restingHeartRate: 69, sleepHours: 5, steps: 3000 }
      : null))
    const weeks = detectDeviations(daily, 90, today)
    expect(weeks).toHaveLength(1)
    expect(weeks[0].items.map(x => x.key).sort()).toEqual(['rhr', 'sleep', 'steps'])
  })

  it('stays silent on flat data', () => {
    expect(detectDeviations(fixture(() => null), 90, today)).toEqual([])
  })

  it('ignores a shift smaller than the metric threshold', () => {
    // steps 8% down: statistically lonely, practically nothing (minRel 25)
    const daily = fixture(i => (i >= 56 && i < 63 ? { steps: 8280 } : null))
    expect(detectDeviations(daily, 90, today)).toEqual([])
  })

  it('ignores weeks with fewer than five days of data', () => {
    const daily = fixture(i => (i >= 56 && i < 63 ? { restingHeartRate: 69 } : null))
      .filter(d => !(d.date >= addDays(today, -27) && d.date <= addDays(today, -24)))
    for (const w of detectDeviations(daily, 90, today)) expect(w.days).toBeGreaterThanOrEqual(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/deviations.test.ts
```

Expected: FAIL — `Failed to resolve import "./deviations"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/doctorReport/deviations.ts`:

```ts
import type { DailyMetrics } from '../../types'
import { METRIC_DEFS, avg, localDate, type MetricKey } from './metrics'
import { weekBuckets } from './weekly'

export function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Median absolute deviation, scaled to sigma. Unlike sigma, a single bad week
 * does not widen the spread that is supposed to expose it.
 */
export function mad(v: number[]): number {
  const med = median(v)
  return 1.4826 * median(v.map(x => Math.abs(x - med)))
}

export interface Deviation {
  key: MetricKey
  label: string
  digits: number
  weekMean: number
  median: number
  relPct: number
  z: number
}

export interface DeviationWeek {
  weekStart: string
  days: number
  items: Deviation[]
}

/** A week needs this many days before its mean is trustworthy. */
const MIN_DAYS = 5
/** Weekly means needed before the median of them means anything. */
const MIN_WEEKS = 5
/** Robust z above which a week counts as unusual. */
const MIN_Z = 2

/**
 * Weeks whose mean is both statistically unusual (2 MAD from the median of
 * weekly means) and practically large (past the metric's own minRel). Daily
 * spread is always wider than a weekly shift, so comparison happens between
 * weeks, never between days.
 */
export function detectDeviations(
  daily: DailyMetrics[],
  periodDays: number,
  today: string = localDate(),
): DeviationWeek[] {
  const buckets = weekBuckets(daily, periodDays, today)
  const found: (Deviation & { weekStart: string; days: number })[] = []

  for (const m of METRIC_DEFS) {
    const weekly = buckets
      .map(b => {
        const v = b.rows.map(m.get).filter((x): x is number => typeof x === 'number')
        return { weekStart: b.weekStart, days: v.length, mean: v.length >= MIN_DAYS ? avg(v) : null }
      })
      .filter((w): w is { weekStart: string; days: number; mean: number } => w.mean != null)
    if (weekly.length < MIN_WEEKS) continue

    const means = weekly.map(w => w.mean)
    const med = median(means)
    const spread = mad(means)
    if (!spread || !med) continue

    for (const w of weekly) {
      const z = Math.abs(w.mean - med) / spread
      const relPct = ((w.mean - med) / med) * 100
      if (z < MIN_Z || Math.abs(relPct) < m.minRel) continue
      found.push({
        key: m.key,
        label: m.label,
        digits: m.digits,
        weekMean: +w.mean.toFixed(m.digits),
        median: +med.toFixed(m.digits),
        relPct: Math.round(relPct),
        z,
        weekStart: w.weekStart,
        days: w.days,
      })
    }
  }

  // Grouped by week, not ranked by strength: sleep, resting HR and steps
  // moving together is one event, and a flat list hides that.
  const byWeek = new Map<string, DeviationWeek>()
  for (const f of found.sort((a, b) => b.z - a.z)) {
    const week = byWeek.get(f.weekStart) ?? { weekStart: f.weekStart, days: f.days, items: [] }
    week.items.push({
      key: f.key, label: f.label, digits: f.digits,
      weekMean: f.weekMean, median: f.median, relPct: f.relPct, z: f.z,
    })
    byWeek.set(f.weekStart, week)
  }
  return [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/deviations.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/doctorReport/deviations.ts apps/web/src/lib/doctorReport/deviations.test.ts
git commit -m "feat(web): robust week-level deviation detection"
```

---

### Task 4: Per-night sleep section

**Files:**
- Create: `apps/web/src/lib/doctorReport/sleep.ts`
- Create: `apps/web/src/lib/doctorReport/sleep.test.ts`

**Interfaces:**
- Consumes: `periodSlice`, `localDate` from `./metrics`.
- Produces: `buildSleep(daily, periodDays, today?): SleepSection | null`, types `SleepNight`, `SleepSection`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/doctorReport/sleep.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSleep } from './sleep'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'

describe('buildSleep', () => {
  it('returns one row per night with phase shares', () => {
    const daily: DailyMetrics[] = [
      { date: '2026-07-30', sleepHours: 8, sleepDeep: 2, sleepREM: 1.6, sleepCore: 4.4 },
      { date: '2026-07-31', sleepHours: 5.5 },
    ]
    const s = buildSleep(daily, 30, today)!
    expect(s.nights).toHaveLength(2)
    expect(s.nights[0].deepPct).toBe(25)
    expect(s.nights[0].remPct).toBe(20)
    expect(s.nights[1].deepPct).toBeNull()
    expect(s.nights[0].weekday).toBe('Чт')
  })

  it('counts short, long, missing and implausible nights', () => {
    const daily: DailyMetrics[] = [
      { date: '2026-07-28', sleepHours: 5 },
      { date: '2026-07-29', sleepHours: 8.2 },
      { date: '2026-07-30' },
      // wake time earlier than bedtime + duration: the source is wrong
      { date: '2026-07-31', sleepHours: 9, sleepBedtime: '2026-07-30T23:00:00Z', sleepWakeTime: '2026-07-31T06:00:00Z' },
    ]
    const s = buildSleep(daily, 30, today)!
    expect(s.total).toBe(3)
    expect(s.under6).toBe(1)
    expect(s.over8).toBe(2)
    expect(s.missing).toBe(1)
    expect(s.implausible).toBe(1)
  })

  it('is null when no night has sleep data', () => {
    expect(buildSleep([{ date: today }], 30, today)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/sleep.test.ts
```

Expected: FAIL — `Failed to resolve import "./sleep"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/doctorReport/sleep.ts`:

```ts
import type { DailyMetrics } from '../../types'
import { localDate, periodSlice } from './metrics'

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

export interface SleepNight {
  date: string
  weekday: string
  /** Local HH:MM, or null when the source sent no timestamp. */
  bedtime: string | null
  wakeTime: string | null
  hours: number
  deep: number | null
  rem: number | null
  core: number | null
  deepPct: number | null
  remPct: number | null
}

export interface SleepSection {
  nights: SleepNight[]
  total: number
  under6: number
  over8: number
  /** Days in the period with no sleep record at all. */
  missing: number
  /** Nights whose wake time precedes bedtime plus sleep duration. */
  implausible: number
}

const hhmm = (iso?: string): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const windowHours = (d: DailyMetrics): number | null =>
  d.sleepBedtime && d.sleepWakeTime
    ? (Date.parse(d.sleepWakeTime) - Date.parse(d.sleepBedtime)) / 3600000
    : null

/**
 * Measured values only. Time in bed and sleep efficiency are deliberately
 * absent: no ingest path supplies them, and bedtime/wake_time mean different
 * things depending on whether the night arrived via the XML importer or the
 * HAE auto-sync, so any arithmetic over them lies differently per night.
 */
export function buildSleep(
  daily: DailyMetrics[],
  periodDays: number,
  today: string = localDate(),
): SleepSection | null {
  const slice = periodSlice(daily, periodDays, today)
  const withSleep = slice.filter(d => d.sleepHours != null)
  if (!withSleep.length) return null

  const share = (part: number | undefined, total: number): number | null =>
    part != null && total > 0 ? Math.round((part / total) * 100) : null

  const nights: SleepNight[] = withSleep.map(d => {
    const hours = d.sleepHours!
    return {
      date: d.date,
      weekday: WEEKDAYS[new Date(d.date + 'T00:00:00Z').getUTCDay()],
      bedtime: hhmm(d.sleepBedtime),
      wakeTime: hhmm(d.sleepWakeTime),
      hours: +hours.toFixed(1),
      deep: d.sleepDeep != null ? +d.sleepDeep.toFixed(1) : null,
      rem: d.sleepREM != null ? +d.sleepREM.toFixed(1) : null,
      core: d.sleepCore != null ? +d.sleepCore.toFixed(1) : null,
      deepPct: share(d.sleepDeep, hours),
      remPct: share(d.sleepREM, hours),
    }
  })

  return {
    nights,
    total: withSleep.length,
    under6: withSleep.filter(d => d.sleepHours! < 6).length,
    over8: withSleep.filter(d => d.sleepHours! >= 8).length,
    missing: slice.length - withSleep.length,
    implausible: withSleep.filter(d => {
      const w = windowHours(d)
      return w != null && d.sleepHours! > w
    }).length,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/sleep.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/doctorReport/sleep.ts apps/web/src/lib/doctorReport/sleep.test.ts
git commit -m "feat(web): per-night sleep section with measured values only"
```

---

### Task 5: Labs with period awareness and full history

**Files:**
- Create: `apps/web/src/lib/doctorReport/labs.ts`
- Create: `apps/web/src/lib/doctorReport/labs.test.ts`
- Reference (do not edit yet): `apps/web/src/lib/doctorReport.ts:88-135` — source of `parseRefRange` and `latestLabs`

**Interfaces:**
- Consumes: `LabResult` from `src/lib/labs`.
- Produces: `parseRefRange(s): { lo: number; hi: number } | null`, `buildLabs(results, periodStartDate): LabsSection`, types `LabLine`, `LabSeries`, `LabsSection`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/doctorReport/labs.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseRefRange, buildLabs } from './labs'
import type { LabResult } from '../labs'

const lab = (marker: string, value: number, date: string, over: Partial<LabResult> = {}): LabResult => ({
  id: `${marker}-${date}`, user_id: 'u', lab_file_id: 'f',
  marker, value, unit: 'ng/ml', ref_range: '30-100', flag: null, date, ...over,
} as LabResult)

describe('parseRefRange', () => {
  it('parses ranges, comparisons and comma decimals', () => {
    expect(parseRefRange('3.5-5.5')).toEqual({ lo: 3.5, hi: 5.5 })
    expect(parseRefRange('3,9 – 6,2')).toEqual({ lo: 3.9, hi: 6.2 })
    expect(parseRefRange('< 5')).toEqual({ lo: -Infinity, hi: 5 })
    expect(parseRefRange('> 1.2')).toEqual({ lo: 1.2, hi: Infinity })
    expect(parseRefRange('какая-то строка')).toBeNull()
  })
})

describe('buildLabs', () => {
  const results = [
    lab('Ферритин', 24, '2026-04-01'),
    lab('Ферритин', 41, '2026-07-10'),
    lab('Витамин D', 19, '2026-01-05'),
  ]

  it('shows the latest value per marker with the previous one and its date', () => {
    const { lines } = buildLabs(results, '2026-05-01')
    const f = lines.find(l => l.marker === 'Ферритин')!
    expect(f.value).toBe(41)
    expect(f.prevValue).toBe(24)
    expect(f.prevDate).toBe('2026-04-01')
    expect(f.delta).toBe(17)
  })

  it('names markers whose latest measurement predates the period', () => {
    const { outOfPeriod } = buildLabs(results, '2026-05-01')
    expect(outOfPeriod).toEqual(['Витамин D'])
  })

  it('keeps every measurement in the series regardless of period', () => {
    const { series, totalMeasurements, markerCount } = buildLabs(results, '2026-07-01')
    expect(totalMeasurements).toBe(3)
    expect(markerCount).toBe(2)
    expect(series.find(s => s.marker === 'Ферритин')!.points).toEqual([
      { date: '2026-04-01', value: 24 },
      { date: '2026-07-10', value: 41 },
    ])
  })

  it('flags values outside the reference range', () => {
    const { lines } = buildLabs([lab('Ферритин', 12, '2026-07-10')], '2026-05-01')
    expect(lines[0].flag).toBe('↓')
  })

  it('falls back to the source flag when the range does not parse', () => {
    const { lines } = buildLabs(
      [lab('X', 5, '2026-07-10', { ref_range: 'по возрасту', flag: 'H' })], '2026-05-01')
    expect(lines[0].flag).toBe('↑')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/labs.test.ts
```

Expected: FAIL — `Failed to resolve import "./labs"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/doctorReport/labs.ts`:

```ts
import type { LabResult } from '../labs'

// «3.5-5.5», «10 – 20», «3,9 - 6,2», «< 5», «> 1.2» → numeric range.
export function parseRefRange(s: string | null | undefined): { lo: number; hi: number } | null {
  if (!s) return null
  const norm = s.replace(/,/g, '.').replace(/\s+/g, ' ').trim()
  const lt = norm.match(/^<\s*(\d+(?:\.\d+)?)$/)
  if (lt) return { lo: -Infinity, hi: Number(lt[1]) }
  const gt = norm.match(/^>\s*(\d+(?:\.\d+)?)$/)
  if (gt) return { lo: Number(gt[1]), hi: Infinity }
  const range = norm.match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)$/)
  if (range) return { lo: Number(range[1]), hi: Number(range[2]) }
  return null
}

export interface LabLine {
  marker: string
  value: number
  unit: string | null
  refRange: string | null
  flag: '↑' | '↓' | null
  date: string
  prevValue: number | null
  prevDate: string | null
  delta: number | null
}

export interface LabSeries {
  marker: string
  unit: string | null
  refRange: string | null
  points: { date: string; value: number }[]
}

export interface LabsSection {
  lines: LabLine[]
  series: LabSeries[]
  /** Markers whose latest measurement predates the report period. */
  outOfPeriod: string[]
  totalMeasurements: number
  markerCount: number
}

/**
 * Two scopes on purpose: `lines` is the period-aware summary, `series` is the
 * complete history. A doctor reading a marker trend needs the whole series
 * regardless of the window chosen for wearable data.
 */
export function buildLabs(results: LabResult[], periodStartDate: string): LabsSection {
  const byMarker = new Map<string, LabResult[]>()
  for (const r of results) byMarker.set(r.marker, [...(byMarker.get(r.marker) ?? []), r])

  const lines: LabLine[] = []
  const series: LabSeries[] = []
  const outOfPeriod: string[] = []

  for (const [marker, rs] of byMarker) {
    const sorted = [...rs].sort((a, b) => a.date.localeCompare(b.date))
    const cur = sorted[sorted.length - 1]
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null

    const range = parseRefRange(cur.ref_range)
    let flag: LabLine['flag'] = null
    if (range) {
      if (cur.value > range.hi) flag = '↑'
      else if (cur.value < range.lo) flag = '↓'
    } else if (cur.flag) {
      // Range did not parse — trust the flag transcribed from the lab report.
      const f = cur.flag.trim().toUpperCase()
      flag = f === 'H' || f === '↑' ? '↑' : f === 'L' || f === '↓' ? '↓' : null
    }

    if (cur.date < periodStartDate) outOfPeriod.push(marker)

    lines.push({
      marker, value: cur.value, unit: cur.unit, refRange: cur.ref_range ?? null,
      flag, date: cur.date,
      prevValue: prev?.value ?? null,
      prevDate: prev?.date ?? null,
      delta: prev ? +(cur.value - prev.value).toFixed(2) : null,
    })

    if (sorted.length > 1) {
      series.push({
        marker, unit: cur.unit, refRange: cur.ref_range ?? null,
        points: sorted.map(r => ({ date: r.date, value: r.value })),
      })
    }
  }

  const byName = (a: { marker: string }, b: { marker: string }) => a.marker.localeCompare(b.marker, 'ru')
  return {
    lines: lines.sort(byName),
    series: series.sort(byName),
    outOfPeriod: outOfPeriod.sort((a, b) => a.localeCompare(b, 'ru')),
    totalMeasurements: results.length,
    markerCount: byMarker.size,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/labs.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/doctorReport/labs.ts apps/web/src/lib/doctorReport/labs.test.ts
git commit -m "feat(web): period-aware labs plus full measurement history"
```

---

### Task 6: Supplement adherence from first logged intake

**Files:**
- Create: `apps/web/src/lib/doctorReport/supplements.ts`
- Create: `apps/web/src/lib/doctorReport/supplements.test.ts`

**Interfaces:**
- Consumes: `Supplement` from `src/lib/supplements`, `SupplementAdherenceLog` from `src/lib/api/settings`.
- Produces: `buildSupplements(supplements, logs, periodStartDate, today): SupplementLine[]`, type `SupplementLine`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/doctorReport/supplements.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSupplements } from './supplements'
import type { Supplement } from '../supplements'
import type { SupplementAdherenceLog } from '../api/settings'

const sup = (id: string, name: string, active = true): Supplement =>
  ({ id, name, default_dose: '400', unit: 'мг', active, sort_order: 0 } as Supplement)

const log = (supplement_id: string, date: string, taken = true): SupplementAdherenceLog =>
  ({ supplement_id, date, taken } as SupplementAdherenceLog)

describe('buildSupplements', () => {
  it('measures adherence from the first logged intake, not from the period length', () => {
    // 90-day period, but this supplement only started 10 days ago
    const logs = Array.from({ length: 9 }, (_, i) => log('a', `2026-07-2${i + 2}`.slice(0, 10)))
    const out = buildSupplements([sup('a', 'Магний')], logs, '2026-05-03', '2026-07-31')
    expect(out[0].firstIntake).toBe('2026-07-22')
    expect(out[0].windowDays).toBe(10)
    expect(out[0].taken).toBe(9)
    expect(out[0].pct).toBe(90)
  })

  it('keeps discontinued supplements with their status', () => {
    const out = buildSupplements([sup('b', 'Железо', false)], [log('b', '2026-07-30')], '2026-05-03', '2026-07-31')
    expect(out[0].active).toBe(false)
    expect(out[0].name).toBe('Железо')
  })

  it('reports null adherence when nothing was logged in the period', () => {
    const out = buildSupplements([sup('c', 'Омега-3')], [], '2026-05-03', '2026-07-31')
    expect(out[0].firstIntake).toBeNull()
    expect(out[0].pct).toBeNull()
  })

  it('ignores logs outside the period and untaken days', () => {
    const logs = [log('a', '2026-01-01'), log('a', '2026-07-30', false), log('a', '2026-07-31')]
    const out = buildSupplements([sup('a', 'Магний')], logs, '2026-07-29', '2026-07-31')
    expect(out[0].firstIntake).toBe('2026-07-31')
    expect(out[0].taken).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/supplements.test.ts
```

Expected: FAIL — `Failed to resolve import "./supplements"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/doctorReport/supplements.ts`:

```ts
import type { Supplement } from '../supplements'
import type { SupplementAdherenceLog } from '../api/settings'

export interface SupplementLine {
  id: string
  name: string
  dose: string | null
  unit: string | null
  active: boolean
  /** First taken day inside the period — the denominator starts here. */
  firstIntake: string | null
  taken: number
  windowDays: number
  pct: number | null
}

/**
 * Adherence counts from the first logged intake inside the period. Dividing by
 * the whole period reported ~27% for a supplement started a month in, when the
 * user had missed almost nothing.
 */
export function buildSupplements(
  supplements: Supplement[],
  logs: SupplementAdherenceLog[],
  periodStartDate: string,
  today: string,
): SupplementLine[] {
  return supplements.map(s => {
    const own = logs.filter(l => l.supplement_id === s.id && l.date >= periodStartDate && l.date <= today && l.taken)
    const firstIntake = own.map(l => l.date).sort()[0] ?? null
    const windowDays = firstIntake
      ? Math.round((Date.parse(today) - Date.parse(firstIntake)) / 86400000) + 1
      : 0
    return {
      id: s.id,
      name: s.name,
      dose: s.default_dose ?? null,
      unit: s.unit ?? null,
      active: s.active,
      firstIntake,
      taken: own.length,
      windowDays,
      pct: windowDays > 0 ? Math.round((own.length / windowDays) * 100) : null,
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/supplements.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/doctorReport/supplements.ts apps/web/src/lib/doctorReport/supplements.test.ts
git commit -m "feat(web): adherence measured from the first logged intake"
```

---

### Task 7: Concerns and journal

**Files:**
- Create: `apps/web/src/lib/doctorReport/journal.ts`
- Create: `apps/web/src/lib/doctorReport/journal.test.ts`

**Interfaces:**
- Consumes: `HealthConcern`, `ConcernLog` from `src/lib/concerns`; `mondayOf` from `./weekly`; `avg` from `./metrics`.
- Produces: `buildConcerns(concerns, logs, periodStartDate): ConcernLine[]`, `buildJournal(notes, periodStartDate): JournalSection`, types `ConcernLine`, `JournalNote`, `JournalSection`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/doctorReport/journal.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildConcerns, buildJournal } from './journal'
import type { HealthConcern, ConcernLog } from '../concerns'

const concern = (id: string, over: Partial<HealthConcern> = {}): HealthConcern => ({
  id, user_id: 'u', name: 'Головные боли', category: 'other', status: 'active',
  started_at: '2026-05-31', notes: 'Чаще в дни с недосыпом', is_private: false,
  created_at: '2026-05-31T00:00:00Z', ...over,
})

const clog = (concern_id: string, date: string, severity: number | null, note: string | null = null): ConcernLog =>
  ({ id: `${concern_id}-${date}`, concern_id, date, severity, note, photo_path: null, created_at: date } as ConcernLog)

describe('buildConcerns', () => {
  it('compares severity in the first half of the period against the second', () => {
    const logs = [
      clog('c', '2026-06-01', 4), clog('c', '2026-06-08', 4),
      clog('c', '2026-07-20', 2), clog('c', '2026-07-27', 2),
    ]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].severity).toEqual({ count: 4, avg: 3, firstHalf: 4, secondHalf: 2 })
  })

  it('keeps the last three logged notes in chronological order', () => {
    const logs = [
      clog('c', '2026-06-01', 3, 'первая'), clog('c', '2026-06-08', 3, 'вторая'),
      clog('c', '2026-06-15', 3, 'третья'), clog('c', '2026-06-22', 3, 'четвёртая'),
    ]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].recentLogs.map(l => l.note)).toEqual(['вторая', 'третья', 'четвёртая'])
  })

  it('has no severity block when nothing was logged', () => {
    expect(buildConcerns([concern('c')], [], '2026-05-03')[0].severity).toBeNull()
  })
})

describe('buildJournal', () => {
  it('averages wellbeing per week and keeps the last 12 notes', () => {
    const notes = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(i + 10).padStart(2, '0')}`,
      note: `запись ${i}`,
      wellbeing: 4,
    }))
    const j = buildJournal(notes, '2026-05-03')
    expect(j.wellbeingCount).toBe(14)
    expect(j.wellbeingAvg).toBe(4)
    expect(j.notes).toHaveLength(12)
    expect(j.notes[11].note).toBe('запись 13')
    expect(j.weeks.every(w => w.avg === 4)).toBe(true)
  })

  it('drops notes from before the period', () => {
    const j = buildJournal([{ date: '2026-01-01', note: 'старое', wellbeing: 3 }], '2026-05-03')
    expect(j.notes).toEqual([])
    expect(j.wellbeingAvg).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/journal.test.ts
```

Expected: FAIL — `Failed to resolve import "./journal"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/doctorReport/journal.ts`:

```ts
import type { HealthConcern, ConcernLog } from '../concerns'
import { avg } from './metrics'
import { mondayOf } from './weekly'

export interface ConcernLine {
  id: string
  name: string
  category: string
  status: HealthConcern['status']
  startedAt: string | null
  note: string | null
  severity: { count: number; avg: number; firstHalf: number; secondHalf: number } | null
  recentLogs: { date: string; severity: number | null; note: string }[]
}

const round1 = (n: number) => +n.toFixed(1)

export function buildConcerns(
  concerns: HealthConcern[],
  logs: ConcernLog[],
  periodStartDate: string,
): ConcernLine[] {
  return concerns.map(c => {
    const own = logs
      .filter(l => l.concern_id === c.id && l.date >= periodStartDate)
      .sort((a, b) => a.date.localeCompare(b.date))
    const sev = own.map(l => l.severity).filter((v): v is number => typeof v === 'number')
    const half = Math.floor(sev.length / 2)
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      status: c.status,
      startedAt: c.started_at,
      note: c.notes,
      severity: sev.length
        ? {
            count: sev.length,
            avg: round1(avg(sev)),
            firstHalf: round1(avg(sev.slice(0, half || 1))),
            secondHalf: round1(avg(sev.slice(half))),
          }
        : null,
      recentLogs: own
        .filter((l): l is ConcernLog & { note: string } => !!l.note)
        .slice(-3)
        .map(l => ({ date: l.date, severity: l.severity, note: l.note })),
    }
  })
}

export interface JournalNote { date: string; note: string; wellbeing: number | null }

export interface JournalSection {
  weeks: { weekStart: string; avg: number; count: number }[]
  notes: JournalNote[]
  wellbeingCount: number
  wellbeingAvg: number | null
}

/** Last N notes kept in the report — a printed page is not elastic. */
const NOTE_LIMIT = 12

export function buildJournal(notes: JournalNote[], periodStartDate: string): JournalSection {
  const inPeriod = [...notes]
    .filter(n => n.date >= periodStartDate)
    .sort((a, b) => a.date.localeCompare(b.date))

  const wb = inPeriod.map(n => n.wellbeing).filter((v): v is number => typeof v === 'number')
  const weeks = new Map<string, number[]>()
  for (const n of inPeriod) {
    if (typeof n.wellbeing !== 'number') continue
    const wk = mondayOf(n.date)
    weeks.set(wk, [...(weeks.get(wk) ?? []), n.wellbeing])
  }

  return {
    weeks: [...weeks.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStart, v]) => ({ weekStart, avg: round1(avg(v)), count: v.length })),
    notes: inPeriod.filter(n => n.note).slice(-NOTE_LIMIT),
    wellbeingCount: wb.length,
    wellbeingAvg: wb.length ? round1(avg(wb)) : null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/journal.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/doctorReport/journal.ts apps/web/src/lib/doctorReport/journal.test.ts
git commit -m "feat(web): concern severity trends and journal aggregation"
```

---

### Task 8: Source loading

Existing loaders miss three things the report needs: supplements filtered to `active = true`, concern logs loaded per concern, and notes without their `wellbeing` column. This task adds the missing ones and gathers everything into one call.

**Files:**
- Create: `apps/web/src/lib/doctorReport/load.ts`
- Create: `apps/web/src/lib/doctorReport/load.test.ts`
- Reference: `apps/web/src/lib/supplements.ts:26-40`, `apps/web/src/lib/concerns.ts:59-102`, `apps/web/src/lib/contextNotes.ts:33`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase`, `isDemoActive` from `src/lib/demo`, `demoList` from `src/lib/demoDb`, `loadConcerns` from `src/lib/concerns`, `getSupplementLogsSince` from `src/lib/api/settings`, `loadLabResults` from `src/lib/labs`.
- Produces: `loadAllSupplements(userId): Promise<Supplement[]>`, `loadAllConcernLogs(userId, since): Promise<ConcernLog[]>`, `loadNotesWithWellbeing(userId, since): Promise<JournalNote[]>`, `loadReportSources(userId, since): Promise<ReportSources>`, type `ReportSources`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/doctorReport/load.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const demoActive = vi.fn(() => true)
vi.mock('../demo', () => ({ isDemoActive: () => demoActive() }))
vi.mock('../demoDb', () => ({
  demoList: (table: string) => ({
    supplements: [
      { id: 'a', name: 'Магний', active: true, default_dose: '400', unit: 'мг', sort_order: 0 },
      { id: 'b', name: 'Железо', active: false, default_dose: '25', unit: 'мг', sort_order: 1 },
    ],
    supplement_logs: [{ supplement_id: 'a', date: '2026-07-30', taken: true }],
    concern_logs: [{ id: 'l1', concern_id: 'c', date: '2026-07-30', severity: 2, note: null }],
    context_notes: [
      { id: 'n1', date: '2026-07-30', note: 'устал', wellbeing: 2 },
      { id: 'n2', date: '2026-01-01', note: 'старое', wellbeing: 5 },
    ],
  }[table] ?? []),
}))

import { loadAllSupplements, loadAllConcernLogs, loadNotesWithWellbeing } from './load'

beforeEach(() => demoActive.mockReturnValue(true))

describe('demo loading', () => {
  it('keeps discontinued supplements, unlike loadSupplements', async () => {
    const out = await loadAllSupplements('u')
    expect(out.map(s => s.id)).toEqual(['a', 'b'])
  })

  it('returns concern logs for every concern at once', async () => {
    expect(await loadAllConcernLogs('u', '2026-05-03')).toHaveLength(1)
  })

  it('returns notes with their wellbeing score, cut to the period', async () => {
    const notes = await loadNotesWithWellbeing('u', '2026-05-03')
    expect(notes).toEqual([{ date: '2026-07-30', note: 'устал', wellbeing: 2 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/load.test.ts
```

Expected: FAIL — `Failed to resolve import "./load"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/doctorReport/load.ts`:

```ts
import { supabase } from '../supabase'
import { isDemoActive } from '../demo'
import { demoList } from '../demoDb'
import { loadConcerns, type ConcernLog, type HealthConcern } from '../concerns'
import { loadLabResults, type LabResult } from '../labs'
import { getSupplementLogsSince, type SupplementAdherenceLog } from '../api/settings'
import type { Supplement } from '../supplements'
import type { JournalNote } from './journal'

/**
 * Unlike loadSupplements, discontinued rows are kept: a treatment the patient
 * stopped is often exactly what the doctor asks about.
 */
export async function loadAllSupplements(userId: string): Promise<Supplement[]> {
  if (isDemoActive()) {
    return (demoList('supplements') as Supplement[]).slice().sort((a, b) => a.sort_order - b.sort_order)
  }
  const { data, error } = await supabase
    .from('supplements')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as Supplement[]
}

export async function loadAllConcernLogs(userId: string, since: string): Promise<ConcernLog[]> {
  if (isDemoActive()) {
    return (demoList('concern_logs') as ConcernLog[]).filter(l => l.date >= since)
  }
  const { data, error } = await supabase
    .from('concern_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', since)
    .order('date')
  if (error) throw error
  return (data ?? []) as ConcernLog[]
}

export async function loadNotesWithWellbeing(userId: string, since: string): Promise<JournalNote[]> {
  if (isDemoActive()) {
    return (demoList('context_notes') as JournalNote[])
      .filter(n => n.date >= since)
      .map(n => ({ date: n.date, note: n.note, wellbeing: n.wellbeing ?? null }))
  }
  const { data, error } = await supabase
    .from('context_notes')
    .select('date, note, wellbeing')
    .eq('user_id', userId)
    .gte('date', since)
    .order('date')
  if (error) throw error
  return (data ?? []).map((n: { date: string; note: string | null; wellbeing: number | null }) => ({
    date: n.date, note: n.note ?? '', wellbeing: n.wellbeing,
  }))
}

export async function loadSupplementLogs(userId: string, since: string): Promise<SupplementAdherenceLog[]> {
  if (isDemoActive()) {
    return (demoList('supplement_logs') as SupplementAdherenceLog[]).filter(l => l.date >= since)
  }
  return getSupplementLogsSince(userId, since)
}

export interface ReportSources {
  labs: LabResult[]
  supplements: Supplement[]
  supplementLogs: SupplementAdherenceLog[]
  concerns: HealthConcern[]
  concernLogs: ConcernLog[]
  notes: JournalNote[]
}

/**
 * Every source is loaded independently and tolerates failure: one missing
 * table leaves its section empty instead of killing the whole report.
 */
export async function loadReportSources(userId: string, since: string): Promise<ReportSources> {
  const [labs, supplements, supplementLogs, concerns, concernLogs, notes] = await Promise.all([
    loadLabResults(userId).catch(() => [] as LabResult[]),
    loadAllSupplements(userId).catch(() => [] as Supplement[]),
    loadSupplementLogs(userId, since).catch(() => [] as SupplementAdherenceLog[]),
    loadConcerns(userId).catch(() => [] as HealthConcern[]),
    loadAllConcernLogs(userId, since).catch(() => [] as ConcernLog[]),
    loadNotesWithWellbeing(userId, since).catch(() => [] as JournalNote[]),
  ])
  return { labs, supplements, supplementLogs, concerns, concernLogs, notes }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/load.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/doctorReport/load.ts apps/web/src/lib/doctorReport/load.test.ts
git commit -m "feat(web): load every doctor-report source in one call"
```

---

### Task 9: Assemble the model

**Files:**
- Create: `apps/web/src/lib/doctorReport/model.ts`
- Create: `apps/web/src/lib/doctorReport/model.test.ts`
- Create: `apps/web/src/lib/doctorReport/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-8, plus `computeDailyScores` from `src/lib/scores`.
- Produces: `buildReportModel(input: ReportInput): DoctorReportModel`, types `ReportInput`, `DoctorReportModel`, `ScoreSummary`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/doctorReport/model.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildReportModel } from './model'
import { addDays } from './metrics'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'
const daily: DailyMetrics[] = Array.from({ length: 60 }, (_, i) => ({
  date: addDays(today, -59 + i),
  restingHeartRate: 58, hrv: 45, sleepHours: 7, steps: 9000,
  sleepDeep: 1.4, sleepREM: 1.5, sleepCore: 4.1,
}))

const emptySources = {
  labs: [], supplements: [], supplementLogs: [], concerns: [], concernLogs: [], notes: [],
}

describe('buildReportModel', () => {
  it('describes the period it covers', () => {
    const m = buildReportModel({ daily, sources: emptySources, periodDays: 30, today })
    expect(m.period).toEqual({ start: addDays(today, -29), end: today, days: 30 })
  })

  it('reports sleep, recovery and load but never readiness', () => {
    const m = buildReportModel({ daily, sources: emptySources, periodDays: 30, today })
    expect(m.scores.map(s => s.key)).toEqual(['sleep_score', 'recovery_score', 'stress_score'])
  })

  it('fills the sections that have data and leaves the rest empty', () => {
    const m = buildReportModel({ daily, sources: emptySources, periodDays: 30, today })
    expect(m.metrics.length).toBeGreaterThan(0)
    expect(m.sleep!.nights).toHaveLength(30)
    expect(m.labs.lines).toEqual([])
    expect(m.supplements).toEqual([])
    expect(m.deviations).toEqual([])
  })

  it('excludes private concerns even when they are passed in', () => {
    const m = buildReportModel({
      daily,
      sources: {
        ...emptySources,
        concerns: [
          { id: 'p', user_id: 'u', name: 'Приватная', category: 'other', status: 'active',
            started_at: null, notes: null, is_private: true, created_at: today },
          { id: 'o', user_id: 'u', name: 'Открытая', category: 'other', status: 'active',
            started_at: null, notes: null, is_private: false, created_at: today },
        ],
      },
      periodDays: 30,
      today,
      pickedConcernIds: new Set(['p', 'o']),
    })
    expect(m.concerns.map(c => c.name)).toEqual(['Открытая'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/model.test.ts
```

Expected: FAIL — `Failed to resolve import "./model"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/doctorReport/model.ts`:

```ts
import type { DailyMetrics } from '../../types'
import { computeDailyScores } from '../scores'
import {
  avgTimeOfDay, localDate, periodSlice, periodStart, summarizeMetrics,
  type BaselineKey, type MetricSummary,
} from './metrics'
import { WEEKLY_KEYS, coverage, weeklyRows, type CoverageGap, type WeeklyRow } from './weekly'
import { detectDeviations, type DeviationWeek } from './deviations'
import { buildSleep, type SleepSection } from './sleep'
import { buildLabs, type LabsSection } from './labs'
import { buildSupplements, type SupplementLine } from './supplements'
import { buildConcerns, buildJournal, type ConcernLine, type JournalSection } from './journal'
import type { ReportSources } from './load'

export interface ScoreSummary {
  key: 'sleep_score' | 'recovery_score' | 'stress_score'
  label: string
  avg: number
  first: number
  last: number
}

export interface DoctorReportModel {
  period: { start: string; end: string; days: number }
  scores: ScoreSummary[]
  metrics: MetricSummary[]
  avgBedtime: string | null
  avgWakeTime: string | null
  weekly: { keys: typeof WEEKLY_KEYS; rows: WeeklyRow[] }
  sleep: SleepSection | null
  coverage: { gaps: CoverageGap[]; missingDates: string[] }
  deviations: DeviationWeek[]
  labs: LabsSection
  supplements: SupplementLine[]
  concerns: ConcernLine[]
  journal: JournalSection
}

export interface ReportInput {
  daily: DailyMetrics[]
  sources: ReportSources
  periodDays: number
  today?: string
  /** Concern ids the patient ticked; private concerns are dropped regardless. */
  pickedConcernIds?: Set<string>
}

// Readiness is absent on purpose: on this data it carries little signal.
const SCORE_DEFS: { key: ScoreSummary['key']; label: string }[] = [
  { key: 'sleep_score', label: 'Сон' },
  { key: 'recovery_score', label: 'Восстановление' },
  { key: 'stress_score', label: 'Нагрузка' },
]

export function buildReportModel({
  daily, sources, periodDays, today = localDate(), pickedConcernIds,
}: ReportInput): DoctorReportModel {
  const start = periodStart(periodDays, today)
  const slice = periodSlice(daily, periodDays, today)

  const scoreRows = computeDailyScores(daily)
  const lastScore = scoreRows[scoreRows.length - 1]
  const baselines: Partial<Record<BaselineKey, number | null>> = {
    rhr: lastScore?.rhr_baseline ?? null,
    hrv: lastScore?.hrv_baseline ?? null,
    sleep: lastScore?.sleep_baseline ?? null,
    steps: lastScore?.steps_baseline ?? null,
  }

  const inPeriod = scoreRows.filter(s => s.date >= start && s.date <= today)
  const third = Math.max(1, Math.floor(inPeriod.length / 3))
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
  const scores: ScoreSummary[] = []
  for (const def of SCORE_DEFS) {
    const vals = inPeriod.map(s => s[def.key]).filter((v): v is number => typeof v === 'number')
    if (!vals.length) continue
    scores.push({
      key: def.key,
      label: def.label,
      avg: Math.round(mean(vals)),
      first: Math.round(mean(vals.slice(0, third))),
      last: Math.round(mean(vals.slice(-third))),
    })
  }

  const visibleConcerns = sources.concerns.filter(c =>
    !c.is_private && (!pickedConcernIds || pickedConcernIds.has(c.id)))

  return {
    period: { start, end: today, days: periodDays },
    scores,
    metrics: summarizeMetrics(daily, periodDays, today, baselines),
    avgBedtime: avgTimeOfDay(slice.map(d => d.sleepBedtime).filter((v): v is string => !!v)),
    avgWakeTime: avgTimeOfDay(slice.map(d => d.sleepWakeTime).filter((v): v is string => !!v)),
    weekly: { keys: WEEKLY_KEYS, rows: weeklyRows(daily, periodDays, today) },
    sleep: buildSleep(daily, periodDays, today),
    coverage: coverage(daily, periodDays, today),
    deviations: detectDeviations(daily, periodDays, today),
    labs: buildLabs(sources.labs, start),
    supplements: buildSupplements(sources.supplements, sources.supplementLogs, start, today),
    concerns: buildConcerns(visibleConcerns, sources.concernLogs, start),
    journal: buildJournal(sources.notes, start),
  }
}
```

Create `apps/web/src/lib/doctorReport/index.ts`:

```ts
export { buildReportModel } from './model'
export type { DoctorReportModel, ReportInput, ScoreSummary } from './model'
export { loadReportSources } from './load'
export type { ReportSources } from './load'
export { METRIC_DEFS, addDays, localDate, periodStart } from './metrics'
export type { MetricKey, MetricSummary } from './metrics'
export { WEEKLY_KEYS } from './weekly'
export { parseRefRange } from './labs'
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/model.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/doctorReport/model.ts apps/web/src/lib/doctorReport/model.test.ts apps/web/src/lib/doctorReport/index.ts
git commit -m "feat(web): assemble the doctor report model"
```

---

### Task 10: Markdown renderer

**Files:**
- Create: `apps/web/src/lib/doctorReport/markdown.ts`
- Create: `apps/web/src/lib/doctorReport/markdown.test.ts`
- Modify: `apps/web/src/lib/doctorReport/index.ts` (export `toMarkdown`)

**Interfaces:**
- Consumes: `DoctorReportModel` from `./model`, `translations` from `src/lib/translations`.
- Produces: `toMarkdown(model: DoctorReportModel, lang: 'ru' | 'en'): string`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/doctorReport/markdown.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toMarkdown } from './markdown'
import { buildReportModel } from './model'
import { addDays } from './metrics'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'
const daily: DailyMetrics[] = Array.from({ length: 30 }, (_, i) => ({
  date: addDays(today, -29 + i),
  restingHeartRate: 58, sleepHours: 7, steps: 9000,
}))
const sources = { labs: [], supplements: [], supplementLogs: [], concerns: [], concernLogs: [], notes: [] }
const model = buildReportModel({ daily, sources, periodDays: 30, today })

describe('toMarkdown', () => {
  it('opens with the title, period and source disclaimer', () => {
    const md = toMarkdown(model, 'ru')
    expect(md.startsWith('# Сводка данных здоровья')).toBe(true)
    expect(md).toContain(`${model.period.start} — ${today}`)
    expect(md).toContain('Пациент: ________________')
  })

  it('always closes with what the data does not contain', () => {
    expect(toMarkdown(model, 'ru')).toContain('## Чего в этих данных нет')
  })

  it('keeps sections in the same order every time', () => {
    const md = toMarkdown(model, 'ru')
    const order = ['## Оценки', '## Метрики за период', '## Динамика по неделям',
      '## Сон по дням', '## Покрытие данных', '## Отклонения', '## Анализы',
      '## Добавки', '## Проблемы', '## Самочувствие', '## Чего в этих данных нет']
    const positions = order.map(h => md.indexOf(h)).filter(i => i >= 0)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('translates headings for the en report', () => {
    const md = toMarkdown(model, 'en')
    expect(md).toContain('# Health data summary')
    expect(md).not.toContain('Сводка данных здоровья')
  })

  it('renders one markdown table row per night', () => {
    const rows = toMarkdown(model, 'ru').split('\n').filter(l => /^\| 2026-/.test(l))
    expect(rows.length).toBeGreaterThanOrEqual(30)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/markdown.test.ts
```

Expected: FAIL — `Failed to resolve import "./markdown"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/doctorReport/markdown.ts`. Render every section of the model in the order asserted by the test, using this shape:

```ts
import { translations } from '../translations'
import type { DoctorReportModel } from './model'

const STATUS_TEXT: Record<string, string> = {
  active: 'активна', improving: 'улучшается', resolved: 'разрешилась',
}

/**
 * The markdown twin of the printed page: same model, same sections, same
 * order. Russian keys pass through the dictionary for the en report.
 */
export function toMarkdown(model: DoctorReportModel, lang: 'ru' | 'en'): string {
  const t = (key: string) => (lang === 'ru' ? key : translations[key]?.en ?? key)
  const L: string[] = []
  const p = (s = '') => L.push(s)
  const table = (header: string[], rows: string[][]) => {
    p(`| ${header.join(' | ')} |`)
    p(`|${'---|'.repeat(header.length)}`)
    for (const r of rows) p(`| ${r.join(' | ')} |`)
    p()
  }
  const n = (v: number | null | undefined, digits = 1) => (v == null ? '—' : v.toFixed(digits))

  p(`# ${t('Сводка данных здоровья')}`)
  p()
  p(`- **${t('Период')}:** ${model.period.start} — ${model.period.end} (${model.period.days})`)
  p(`- **${t('Сформировано')}:** ${model.period.end}`)
  p(`- **${t('Источник')}:** ${t('приложение Tonus, данные носимых устройств')}`)
  p(`- **${t('Пациент')}:** ________________`)
  p()
  p(`> ${t('Источник: приложение Tonus, данные носимых устройств. Не является медицинскими измерениями и не заменяет обследование.')}`)
  p()

  if (model.scores.length) {
    p(`## ${t('Оценки Tonus (0–100, расчёт приложения)')}`)
    p()
    table(
      [t('Оценка'), t('Среднее за период'), t('Начало периода'), t('Конец периода')],
      model.scores.map(s => [t(s.label), String(s.avg), String(s.first), String(s.last)]),
    )
  }

  if (model.metrics.length) {
    p(`## ${t('Метрики за период')}`)
    p()
    const rows = model.metrics.map(m => [
      t(m.label), m.avg.toFixed(m.digits), m.min.toFixed(m.digits), m.max.toFixed(m.digits),
      m.baselinePct != null ? `${m.baselinePct > 0 ? '+' : ''}${m.baselinePct}%` : '—',
      `${m.daysWithData} / ${m.daysInPeriod}`,
    ])
    if (model.avgBedtime) rows.push([t('Время отбоя (среднее)'), model.avgBedtime, '—', '—', '—', '—'])
    if (model.avgWakeTime) rows.push([t('Время подъёма (среднее)'), model.avgWakeTime, '—', '—', '—', '—'])
    table([t('Метрика'), t('Среднее'), t('Мин'), t('Макс'), t('К личной норме'), t('Дней с данными')], rows)
  }

  // …weekly, sleep, coverage, deviations, labs (both tables), supplements,
  // concerns and journal follow the same table() pattern, reading only from
  // `model`. Headings, in order:
  //   '## Динамика по неделям', '## Сон по дням', '## Покрытие данных и пробелы',
  //   '## Отклонения, замеченные в периоде', '## Анализы',
  //   '### Все измерения по показателям', '## Добавки и приём',
  //   '## Проблемы и жалобы', '## Самочувствие и дневник'

  p(`## ${t('Чего в этих данных нет')}`)
  p()
  for (const line of [
    'Артериального давления, веса, роста, температуры тела',
    'Диагнозов, назначений врача и рецептурных препаратов (учитываются только добавки, отмеченные пациентом)',
    'Питания и алкоголя',
    'ЭКГ, аритмий и любых клинических измерений',
    'Всё перечисленное отсутствует, а не равно нулю: не делай выводов о том, чего здесь нет.',
  ]) p(`- ${t(line)}`)
  p()

  return L.join('\n')
}
```

Write out every section marked by the comment block — the reference rendering for each is in the approved sample at `docs/superpowers/plans/assets/doctor-report-sample.md` (copy it there from the scratchpad before starting; it is the acceptance target for wording and column order).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/markdown.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Add the new dictionary strings**

Every heading and column label above is a dictionary key. Add each to `apps/web/src/lib/translations/settings.ts` with `uk` and `en` values, in one block commented `// ── Doctor report v2 ──`. Example entries:

```ts
'Сводка данных здоровья': { uk: 'Зведення даних здоров’я', en: 'Health data summary' }, // already present
'Оценки Tonus (0–100, расчёт приложения)': { uk: 'Оцінки Tonus (0–100, розрахунок застосунку)', en: 'Tonus scores (0–100, computed by the app)' },
'Сон по дням': { uk: 'Сон за днями', en: 'Sleep, night by night' },
'Покрытие данных и пробелы': { uk: 'Покриття даних і прогалини', en: 'Data coverage and gaps' },
'Отклонения, замеченные в периоде': { uk: 'Відхилення, помічені в періоді', en: 'Deviations observed in the period' },
'Все измерения по показателям': { uk: 'Усі вимірювання за показниками', en: 'All measurements per marker' },
'Чего в этих данных нет': { uk: 'Чого в цих даних немає', en: 'What this data does not contain' },
```

- [ ] **Step 6: Run the whole node suite and lint**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node && npm run lint
```

Expected: PASS, zero warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/doctorReport/markdown.ts apps/web/src/lib/doctorReport/markdown.test.ts apps/web/src/lib/doctorReport/index.ts apps/web/src/lib/translations/settings.ts
git commit -m "feat(web): markdown rendering of the doctor report"
```

---

### Task 11: Render the model in the component and add the copy button

**Files:**
- Modify: `apps/web/src/components/settings/DoctorReport.tsx` (full rewrite of the preview branch)
- Modify: `apps/web/src/components/settings/DoctorReport.test.ts` (extend `KEYS`)
- Create: `apps/web/src/components/settings/DoctorReport.copy.test.tsx`
- Delete: `apps/web/src/lib/doctorReport.ts`, `apps/web/src/lib/doctorReport.test.ts`, `apps/web/src/lib/__sample-doctor-report.test.ts`

**Interfaces:**
- Consumes: `buildReportModel`, `loadReportSources`, `toMarkdown`, `periodStart`, `localDate` from `src/lib/doctorReport`.
- Produces: no new exports; `DoctorReport` keeps its `{ user, daily, onClose }` props.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/settings/DoctorReport.copy.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { DoctorReport } from './DoctorReport'
import type { DailyMetrics } from '../../types'
import type { User } from '@supabase/supabase-js'

const writeText = vi.fn(() => Promise.resolve())
Object.assign(navigator, { clipboard: { writeText } })

const user = { id: 'u1' } as User
const daily: DailyMetrics[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - i)
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    restingHeartRate: 58, sleepHours: 7, steps: 9000,
  }
})

beforeEach(() => writeText.mockClear())

describe('DoctorReport copy for AI', () => {
  it('puts the full markdown on the clipboard', async () => {
    renderWithProviders(<DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Сформировать'))
    await waitFor(() => expect(screen.getByText('Скопировать для ИИ')).toBeTruthy())
    fireEvent.click(screen.getByText('Скопировать для ИИ'))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const md = writeText.mock.calls[0][0] as string
    expect(md).toContain('# Сводка данных здоровья')
    expect(md).toContain('## Чего в этих данных нет')
  })

  it('renders a row for every night in the print view', async () => {
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Сформировать'))
    await waitFor(() => expect(container.querySelector('.dr-sleep-table')).toBeTruthy())
    expect(container.querySelectorAll('.dr-sleep-table tbody tr')).toHaveLength(30)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project jsdom src/components/settings/DoctorReport.copy.test.tsx
```

Expected: FAIL — no "Скопировать для ИИ" button.

- [ ] **Step 3: Rewrite the component**

In `DoctorReport.tsx`:

1. Replace the imports from `../../lib/doctorReport` and the per-source loaders with:

```tsx
import { buildReportModel, loadReportSources, periodStart, localDate, type DoctorReportModel, type ReportSources } from '../../lib/doctorReport'
import { toMarkdown } from '../../lib/doctorReport/markdown'
```

2. Replace the six source `useState`s with one, and load through `loadReportSources`:

```tsx
const [sources, setSources] = useState<ReportSources | null>(null)

useEffect(() => {
  if (!user) return
  loadReportSources(user.id, periodStart(365))
    .then(s => {
      setSources(s)
      // private concerns stay out of the report and out of the picker by default
      setPickedConcerns(new Set(s.concerns.filter(c => !c.is_private).map(c => c.id)))
    })
    .catch(() => setSources({ labs: [], supplements: [], supplementLogs: [], concerns: [], concernLogs: [], notes: [] }))
}, [user])
```

Note the 365-day load: sources are fetched once for the widest period so switching 30/90/365 does not refetch.

3. Build the model where the preview renders:

```tsx
const model: DoctorReportModel | null = sources
  ? buildReportModel({ daily, sources, periodDays: period, today: localDate(), pickedConcernIds: pickedConcerns })
  : null
```

4. Add the copy button to `.dr-toolbar`:

```tsx
const [copied, setCopied] = useState(false)

async function copyForAi() {
  if (!model) return
  await navigator.clipboard.writeText(toMarkdown(model, lang))
  setCopied(true)
  setTimeout(() => setCopied(false), 2000)
}
```

```tsx
<button className="dr-btn" onClick={copyForAi}>
  {copied ? t('Скопировано') : t('Скопировать для ИИ')}
</button>
```

5. Render each model section as a table. Sleep gets `className="dr-sleep-table"`; every table keeps the column order of the approved sample. Sections the user unticked are skipped, exactly as today.

6. Send the markdown as the AI digest instead of the two-line summary:

```tsx
const res = await callFunction<{ questions: string[] }>('analyze-health', {
  digest: toMarkdown(model, lang),
  periodStart: periodStart(period),
  periodEnd: localDate(),
  mode: 'doctor-questions',
  lang,
})
```

- [ ] **Step 4: Run the component tests**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project jsdom src/components/settings/
```

Expected: PASS, including the existing `SettingsScreen.characterization.test.tsx`.

- [ ] **Step 5: Extend the translation key list and delete the old modules**

Add every new string from the component to `KEYS` in `DoctorReport.test.ts` (the test asserts each key exists in the dictionary), including `'Скопировать для ИИ'`, `'Скопировано'`, `'Сон по дням'`, `'Покрытие данных и пробелы'`, `'Отклонения, замеченные в периоде'`, `'Все измерения по показателям'`, `'Чего в этих данных нет'`, `'Дневник и самочувствие'`.

```bash
git rm apps/web/src/lib/doctorReport.ts apps/web/src/lib/doctorReport.test.ts apps/web/src/lib/__sample-doctor-report.test.ts
```

- [ ] **Step 6: Run everything**

```bash
cd apps/web && VITE_DEMO= npx vitest run && npm run lint && npm run build
```

Expected: all suites pass, zero lint warnings, build succeeds.

- [ ] **Step 7: Verify in the browser**

Start the preview (`.claude/launch.json` config `tonus-dev`), open `http://localhost:5173/#settings` in demo mode, open «Отчёт для врача», press «Сформировать», and confirm: every section renders, the sleep table has one row per night, and «Скопировать для ИИ» reports success. Screenshot the preview.

- [ ] **Step 8: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(web): render the doctor report from one model and add the AI copy"
```

---

### Task 12: Update the shipped spec

**Files:**
- Modify: `docs/specs/SPEC-DOCTOR-REPORT.md`

- [ ] **Step 1: Record what changed**

Append a section to `docs/specs/SPEC-DOCTOR-REPORT.md`:

```markdown
## 6. Ревизия v2 (2026-07-31)

Отчёт перестроен по `docs/superpowers/specs/2026-07-31-doctor-report-v2-design.md`:
все метрики вместо четырёх, посуточный сон, покрытие и пробелы, отклонения по
неделям, полная история анализов, соблюдение добавок от первого приёма,
динамика тяжести проблем, дневник и кнопка «Скопировать для ИИ». Возраст и пол
пациента — из профиля в Настройках
(`docs/superpowers/specs/2026-07-31-profile-basics-design.md`). Вес из §2.2
не реализован: источника данных о весе в приложении нет.
```

- [ ] **Step 2: Commit**

```bash
git add docs/specs/SPEC-DOCTOR-REPORT.md
git commit -m "docs(spec): record the doctor report v2 revision"
```

---

### Task 13: Profile basics in Settings

Spec: `docs/superpowers/specs/2026-07-31-profile-basics-design.md`. The columns
and the loaders already exist; what is missing is a place to enter the values.

**Files:**
- Modify: `apps/web/src/lib/api/settings.ts` (receive the moved loaders)
- Modify: `apps/web/src/lib/api/settings.test.ts` (tests for them)
- Modify: `apps/web/src/lib/supplements.ts:125-152` (remove the moved code)
- Create: `apps/web/src/components/settings/sections/ProfileSection.tsx`
- Create: `apps/web/src/components/settings/sections/ProfileSection.test.tsx`
- Modify: `apps/web/src/components/settings/SettingsScreen.tsx` (render it first)
- Modify: `apps/web/src/components/supplements/SupplementSchedule.tsx` (drop the inline form, the `colMissing` banner and its state)
- Modify: `apps/web/src/lib/translations/settings.ts`

**Interfaces:**
- Produces: `loadProfileBasics(userId): Promise<ProfileBasics | null>`, `saveProfileBasics(userId, patch: Partial<ProfileBasics>): Promise<boolean>`, `type Sex = 'male' | 'female'`, `interface ProfileBasics { birth_year: number | null; sex: Sex | null }` — all from `src/lib/api/settings`.

- [ ] **Step 1: Write the failing API test**

Add to `apps/web/src/lib/api/settings.test.ts`, inside the `cal sync + profile location` describe block (import the two functions at the top of the file):

```ts
it('loadProfileBasics selects birth year and sex by profile id', async () => {
  state.response = { data: { birth_year: 1988, sex: 'male' }, error: null }
  expect(await loadProfileBasics('u1')).toEqual({ birth_year: 1988, sex: 'male' })
  expect(state.calls[0].table).toBe('profiles')
  expect(state.calls[0].steps).toContainEqual(['eq', ['id', 'u1']])
})

it('loadProfileBasics returns nulls when the profile row is empty', async () => {
  state.response = { data: null, error: null }
  expect(await loadProfileBasics('u1')).toEqual({ birth_year: null, sex: null })
})

it('saveProfileBasics updates only the patched keys', async () => {
  expect(await saveProfileBasics('u1', { birth_year: 1990 })).toBe(true)
  expect(state.calls[0].steps).toContainEqual(['update', [{ birth_year: 1990 }]])
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/api/settings.test.ts
```

Expected: FAIL — `loadProfileBasics is not exported`.

- [ ] **Step 3: Move the loaders into the settings API**

Cut the `Profile basics` block from `src/lib/supplements.ts:125-152` and paste it into `src/lib/api/settings.ts` after `syncProfileTimezone`, adding a demo branch:

```ts
// ── Profile basics (age + sex) ───────────────────────────────────────────────

export type Sex = 'male' | 'female'

export interface ProfileBasics {
  birth_year: number | null
  sex: Sex | null
}

export async function loadProfileBasics(userId: string): Promise<ProfileBasics | null> {
  // Demo has no profiles table; without this the section and the doctor report
  // header render empty on the screenshot stand.
  if (isDemoActive()) return { birth_year: 1988, sex: 'male' }
  const { data, error } = await supabase
    .from('profiles')
    .select('birth_year, sex')
    .eq('id', userId)
    .maybeSingle()
  if (error) return null
  return { birth_year: data?.birth_year ?? null, sex: (data?.sex as Sex | null) ?? null }
}

export async function saveProfileBasics(userId: string, patch: Partial<ProfileBasics>): Promise<boolean> {
  if (isDemoActive()) return true
  const { error } = await supabase.from('profiles').update({ ...patch }).eq('id', userId)
  return !error
}
```

Add `import { isDemoActive } from '../demo'` to `settings.ts` if it is not there already. In `supplements.ts` delete the moved block and its now-unused `Sex`/`ProfileBasics` exports.

- [ ] **Step 4: Run the API test**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/api/settings.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing component test**

Create `apps/web/src/components/settings/sections/ProfileSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../test/utils'
import { ProfileSection } from './ProfileSection'
import type { User } from '@supabase/supabase-js'

const save = vi.fn(() => Promise.resolve(true))
vi.mock('../../../lib/api/settings', () => ({
  loadProfileBasics: () => Promise.resolve({ birth_year: 1988, sex: 'male' }),
  saveProfileBasics: (...args: unknown[]) => save(...args),
}))

const user = { id: 'u1' } as User

beforeEach(() => save.mockClear())

describe('ProfileSection', () => {
  it('shows the stored birth year', async () => {
    renderWithProviders(<ProfileSection user={user} onArchive={() => {}} />)
    await waitFor(() => expect((screen.getByLabelText('Год рождения') as HTMLInputElement).value).toBe('1988'))
  })

  it('saves a new birth year', async () => {
    renderWithProviders(<ProfileSection user={user} onArchive={() => {}} />)
    const input = await screen.findByLabelText('Год рождения')
    fireEvent.change(input, { target: { value: '1990' } })
    fireEvent.blur(input)
    await waitFor(() => expect(save).toHaveBeenCalledWith('u1', { birth_year: 1990 }))
  })

  it('keeps non-digits out of the year field', async () => {
    renderWithProviders(<ProfileSection user={user} onArchive={() => {}} />)
    const input = await screen.findByLabelText('Год рождения') as HTMLInputElement
    fireEvent.change(input, { target: { value: '19x9' } })
    expect(input.value).toBe('199')
  })
})
```

- [ ] **Step 6: Run it and watch it fail**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project jsdom src/components/settings/sections/ProfileSection.test.tsx
```

Expected: FAIL — `Failed to resolve import "./ProfileSection"`.

- [ ] **Step 7: Write the component**

Create `apps/web/src/components/settings/sections/ProfileSection.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../../lib/i18n'
import { loadProfileBasics, saveProfileBasics, type Sex } from '../../../lib/api/settings'
import { ArchiveBtn, type SectionProps } from './ArchiveBtn'

interface Props extends SectionProps { user?: User }

// Birth year rather than age: an age would silently rot, and a full birth date
// is more identifying data than the doctor report needs.
export function ProfileSection({ archived, onArchive, user }: Props) {
  const { t } = useT()
  const [year, setYear] = useState('')
  const [sex, setSex] = useState<Sex | ''>('')

  useEffect(() => {
    if (!user) return
    loadProfileBasics(user.id).then(p => {
      if (!p) return
      setYear(p.birth_year ? String(p.birth_year) : '')
      setSex(p.sex ?? '')
    })
  }, [user])

  function commitYear() {
    if (!user) return
    const n = year.length === 4 ? Number(year) : null
    void saveProfileBasics(user.id, { birth_year: n })
  }

  function commitSex(value: Sex | '') {
    setSex(value)
    if (user) void saveProfileBasics(user.id, { sex: value || null })
  }

  return (
    <section className={`settings-section${archived ? ' is-archived' : ''}`}>
      <ArchiveBtn id="profile" onArchive={onArchive} />
      <h3 className="settings-section-title">{t('Профиль')}</h3>
      <p className="settings-hint">{t('Возраст и пол попадают в отчёт для врача — по ним читаются референсные диапазоны анализов.')}</p>
      <div className="rep-seg" style={{ gap: 8 }}>
        <label>
          {t('Год рождения')}
          <input
            className="supp-input supp-input-sm"
            type="text"
            inputMode="numeric"
            aria-label={t('Год рождения')}
            value={year}
            onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onBlur={commitYear}
          />
        </label>
        <label>
          {t('Пол')}
          <select
            className="supp-input supp-input-sm"
            aria-label={t('Пол')}
            value={sex}
            onChange={e => commitSex(e.target.value as Sex | '')}
          >
            <option value="">{t('Не указан')}</option>
            <option value="male">{t('Мужской')}</option>
            <option value="female">{t('Женский')}</option>
          </select>
        </label>
      </div>
    </section>
  )
}
```

- [ ] **Step 8: Wire it into Settings and strip the old editor**

In `SettingsScreen.tsx`, import `ProfileSection` and render it as the first section, above `LanguageSection`:

```tsx
<ProfileSection archived={isArchived('profile')} onArchive={archiveSection} user={user} />
```

In `SupplementSchedule.tsx`: delete the `colMissing` state and its banner, delete the `showProfileForm` block with the year input and sex select, and delete the `loadProfileBasics`/`saveProfileBasics` imports. Where the form used to be, when the profile has no birth year, render:

```tsx
<p className="supp-hint">{t('Укажи год рождения и пол в Настройках — расписание подбирается по возрасту')}</p>
```

Read the profile through `loadProfileBasics` from `../../lib/api/settings` for that check only.

- [ ] **Step 9: Add the dictionary strings**

Already in the dictionary, do **not** re-add: `'Год рождения'`, `'Пол'`, `'Мужской'`, `'Женский'` (`translations/health.ts:21-24`) and `'Профиль'` (`translations/onboarding.ts:75`). A duplicate key across domain files is silently overwritten by the merge order in `translations/index.ts`, so adding them again is a real bug, not noise.

Add to `src/lib/translations/settings.ts` only the genuinely new strings: `'Возраст и пол попадают в отчёт для врача — по ним читаются референсные диапазоны анализов.'`, `'Не указан'`, `'Укажи год рождения и пол в Настройках — расписание подбирается по возрасту'`.

- [ ] **Step 10: Run everything**

```bash
cd apps/web && VITE_DEMO= npx vitest run && npm run lint
```

Expected: PASS, zero warnings.

- [ ] **Step 11: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(web): profile section with birth year and sex in settings"
```

---

### Task 14: Age in the doctor report header

**Files:**
- Modify: `apps/web/src/lib/doctorReport/model.ts` (add `patient` to the model)
- Modify: `apps/web/src/lib/doctorReport/model.test.ts`
- Modify: `apps/web/src/lib/doctorReport/load.ts` (load the profile with the other sources)
- Modify: `apps/web/src/lib/doctorReport/markdown.ts` (header line)
- Modify: `apps/web/src/components/settings/DoctorReport.tsx` (print header)
- Modify: `apps/web/src/lib/translations/settings.ts`, `apps/web/src/components/settings/DoctorReport.test.ts`

**Interfaces:**
- Consumes: `loadProfileBasics`, `ProfileBasics` from `src/lib/api/settings`.
- Produces: `DoctorReportModel.patient: { birthYear: number | null; sex: Sex | null; age: number | null }`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/doctorReport/model.test.ts`:

```ts
it('computes age from the birth year', () => {
  const m = buildReportModel({
    daily, sources: { ...emptySources, profile: { birth_year: 1988, sex: 'male' } },
    periodDays: 30, today,
  })
  expect(m.patient).toEqual({ birthYear: 1988, sex: 'male', age: 38 })
})

it('leaves the patient block empty when the profile is unset', () => {
  const m = buildReportModel({
    daily, sources: { ...emptySources, profile: null }, periodDays: 30, today,
  })
  expect(m.patient).toEqual({ birthYear: null, sex: null, age: null })
})
```

Update the shared `emptySources` in that file to include `profile: null`.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/model.test.ts
```

Expected: FAIL — `m.patient` is undefined.

- [ ] **Step 3: Implement**

In `load.ts`, add `profile: ProfileBasics | null` to `ReportSources` and load it alongside the rest:

```ts
loadProfileBasics(userId).catch(() => null),
```

In `model.ts`, add to `DoctorReportModel`:

```ts
patient: { birthYear: number | null; sex: Sex | null; age: number | null }
```

and build it. The age is deliberately coarse — only the year is stored, so the
report labels it as such:

```ts
const birthYear = sources.profile?.birth_year ?? null
const patient = {
  birthYear,
  sex: sources.profile?.sex ?? null,
  age: birthYear ? Number(today.slice(0, 4)) - birthYear : null,
}
```

In `markdown.ts`, replace the blank patient line when an age is known:

```ts
p(model.patient.age != null
  ? `- **${t('Пациент')}:** ${t('Возраст (по году рождения)')}: ${model.patient.age}${model.patient.sex ? ` · ${t('Пол')}: ${t(model.patient.sex === 'male' ? 'Мужской' : 'Женский')}` : ''}`
  : `- **${t('Пациент')}:** ________________`)
```

Mirror the same line in the print header in `DoctorReport.tsx`.

- [ ] **Step 4: Run the tests**

```bash
cd apps/web && VITE_DEMO= npx vitest run --project node src/lib/doctorReport/
```

Expected: PASS.

- [ ] **Step 5: Add the string and the key**

Add `'Возраст (по году рождения)'` to `translations/settings.ts` and to the `KEYS` array in `DoctorReport.test.ts`.

- [ ] **Step 6: Run everything and verify in the browser**

```bash
cd apps/web && VITE_DEMO= npx vitest run && npm run lint && npm run build
```

Then open the demo report and confirm the header reads `Возраст (по году рождения): 38 · Пол: мужской`.

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(web): patient age in the doctor report header"
```

---

## Self-Review

**Spec coverage.** Tasks 13 and 14 cover `2026-07-31-profile-basics-design.md`: §2 storage and the Settings section → Task 13, §2 report header → Task 14, §3 testing → the tests in both. Every numbered section of spec §3 maps to a task: header/scores/metrics → Tasks 1 and 9; weekly → Task 2; sleep → Task 4; coverage → Task 2; deviations → Task 3; labs → Task 5; supplements → Task 6; concerns and journal → Task 7; "what is missing" → Task 10. Spec §2 (architecture) is the file structure above. Spec §5 (UX, copy button, AI digest) → Task 11. Spec §6 (testing) is distributed across the per-task tests. Spec §7 (out of scope) needs no task.

**Placeholders.** Task 10 Step 3 intentionally shows the pattern for two sections and names the remaining nine headings plus their reference rendering, rather than reprinting ~200 lines of near-identical table code; the sample file is the exact acceptance target and must be copied into `docs/superpowers/plans/assets/` before that task starts. Every other step carries complete code.

**Type consistency.** `MetricKey`, `MetricSummary`, `WeeklyRow`, `CoverageGap`, `DeviationWeek`, `SleepSection`, `LabsSection`, `SupplementLine`, `ConcernLine`, `JournalSection` and `ReportSources` are each defined once and imported by name in `model.ts`; the field names used in `markdown.ts` and the component match those definitions.
