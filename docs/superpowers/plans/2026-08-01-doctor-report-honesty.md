# Doctor Report Honesty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the doctor report state every derived claim only where the data supports it, and stop attributing verdicts to sources that never gave one.

**Architecture:** All changes are client-side, inside `apps/web/src/lib/doctorReport/` and its two renderers. One new module, `reliability.ts`, owns coverage bands, the gating predicate and the report's own baseline. Every task is a vertical slice — model plus both renderers plus translations — so `npm run build` stays green at every commit.

**Tech Stack:** TypeScript, React 19, Vitest (projects `node` for `*.test.ts` and `jsdom` for `*.test.tsx`).

**Spec:** `docs/superpowers/specs/2026-08-01-doctor-report-honesty-design.md`

## Global Constraints

- **Node 24 for everything.** Prefix every command in a fresh shell with
  `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`. Node 18 fails on
  modern syntax.
- **Run one test file:** `npm test -w tonus-web -- src/lib/doctorReport/<file>.test.ts`
- **Run the web suite:** `npm test -w tonus-web`
- **Lint is zero-tolerance:** `npm run lint` runs with `--max-warnings 0`.
- **Everything committed to the repo is in English** — commit messages, code
  comments, identifiers, docs. The two exceptions are product copy (the
  Russian UI strings and their translations) and chat.
- **Report copy is Russian-keyed.** The Russian string *is* the key; the `en`
  report resolves it through `translations`. Every new user-facing string in
  `markdown.ts` or `DoctorReport.tsx` needs an entry in
  `apps/web/src/lib/translations/settings.ts` with both `uk` and `en`, added to
  the `Doctor report v2` block.
- **Two renderers, one model.** `markdown.ts` and `DoctorReport.tsx` must print
  the same facts. A change to one without the other is incomplete.
- **Work on branch `feat/doctor-report-honesty`**, which already holds the spec
  commit.

---

### Task 1: Period frame and calendar denominators

Coverage today divides by the number of rows that exist, so two days with no
record at all silently leave the denominator and every percentage rises.

**Files:**
- Modify: `apps/web/src/lib/doctorReport/metrics.ts`
- Modify: `apps/web/src/lib/doctorReport/weekly.ts`
- Modify: `apps/web/src/lib/doctorReport/model.ts`
- Modify: `apps/web/src/lib/doctorReport/markdown.ts`
- Modify: `apps/web/src/components/settings/DoctorReport.tsx`
- Modify: `apps/web/src/lib/translations/settings.ts`
- Test: `apps/web/src/lib/doctorReport/metrics.test.ts`, `weekly.test.ts`, `model.test.ts`

**Interfaces:**
- Produces: `daysBetween(from: string, to: string): number` (inclusive),
  `periodFrame(daily: DailyMetrics[], periodDays: number, today?: string): PeriodFrame`,
  `frameSlice(daily: DailyMetrics[], frame: PeriodFrame): DailyMetrics[]`,
  and the `PeriodFrame` interface. `summarizeMetrics`, `coverage` and
  `weeklyRows` take `(daily, frame)` instead of `(daily, periodDays, today)`.
  `DoctorReportModel.period` becomes a `PeriodFrame`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/doctorReport/metrics.test.ts`:

```ts
import { METRIC_DEFS, summarizeMetrics, addDays, periodFrame, daysBetween } from './metrics'

describe('periodFrame', () => {
  it('counts calendar days, not rows, and names the empty ones', () => {
    // 90 calendar days, records on all but two
    const daily = Array.from({ length: 90 }, (_, i) => day(addDays(today, -89 + i), { steps: 100 }))
      .filter(d => d.date !== addDays(today, -5) && d.date !== addDays(today, -6))
    const f = periodFrame(daily, 90, today)
    expect(f.calendarDays).toBe(90)
    expect(f.daysWithAnyRecord).toBe(88)
    expect(f.emptyDays).toBe(2)
    expect(f.clamped).toBe(false)
    expect(f.effectiveStart).toBe(addDays(today, -89))
  })

  it('clamps the denominator to the first day with data on short history', () => {
    const daily = [day('2026-06-01', { steps: 1 }), day(today, { steps: 2 })]
    const f = periodFrame(daily, 365, today)
    expect(f.clamped).toBe(true)
    expect(f.effectiveStart).toBe('2026-06-01')
    expect(f.calendarDays).toBe(61)
    expect(f.nominalDays).toBe(365)
  })

  it('measures inclusive spans', () => {
    expect(daysBetween('2026-07-31', '2026-07-31')).toBe(1)
    expect(daysBetween('2026-07-01', '2026-07-31')).toBe(31)
  })
})

describe('summarizeMetrics', () => {
  it('divides coverage by calendar days, not by rows that exist', () => {
    const daily = [day(addDays(today, -2), { steps: 100 }), day(today, { steps: 200 })]
    const s = summarizeMetrics(daily, periodFrame(daily, 30, today)).find(m => m.key === 'steps')!
    expect(s.daysWithData).toBe(2)
    expect(s.daysInPeriod).toBe(3) // clamped to the first record, still calendar days
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -w tonus-web -- src/lib/doctorReport/metrics.test.ts`
Expected: FAIL — `periodFrame is not a function`.

- [ ] **Step 3: Implement the frame in `metrics.ts`**

Add below `periodSlice`:

```ts
export interface PeriodFrame {
  /** Nominal start: today − periodDays + 1. */
  start: string
  /** Where counting begins — clamped forward to the first day with any record. */
  effectiveStart: string
  end: string
  nominalDays: number
  /** The one denominator: days from effectiveStart to end, inclusive. */
  calendarDays: number
  clamped: boolean
  daysWithAnyRecord: number
  emptyDays: number
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1
}

/**
 * The denominator every coverage figure divides by. Clamped to the first day
 * with a record: a three-month-old account asked for 365 days would otherwise
 * report ~25% coverage on everything and be unreadable. The header prints both
 * numbers, so the clamp is never silent.
 */
export function periodFrame(
  daily: DailyMetrics[],
  periodDays: number,
  today: string = localDate(),
): PeriodFrame {
  const start = periodStart(periodDays, today)
  const dates = daily.filter(d => d.date >= start && d.date <= today).map(d => d.date).sort()
  const effectiveStart = dates.length && dates[0] > start ? dates[0] : start
  const calendarDays = daysBetween(effectiveStart, today)
  const daysWithAnyRecord = new Set(dates.filter(d => d >= effectiveStart)).size
  return {
    start,
    effectiveStart,
    end: today,
    nominalDays: periodDays,
    calendarDays,
    clamped: effectiveStart !== start,
    daysWithAnyRecord,
    emptyDays: calendarDays - daysWithAnyRecord,
  }
}

export function frameSlice(daily: DailyMetrics[], frame: PeriodFrame): DailyMetrics[] {
  return daily
    .filter(d => d.date >= frame.effectiveStart && d.date <= frame.end)
    .sort((a, b) => a.date.localeCompare(b.date))
}
```

Then change `summarizeMetrics` to take the frame:

```ts
export function summarizeMetrics(
  daily: DailyMetrics[],
  frame: PeriodFrame,
  baselines: Partial<Record<BaselineKey, number | null>> = {},
): MetricSummary[] {
  const slice = frameSlice(daily, frame)
  // ...body unchanged, except:
  //   daysInPeriod: frame.calendarDays
}
```

- [ ] **Step 4: Run the metrics tests**

Run: `npm test -w tonus-web -- src/lib/doctorReport/metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Move `coverage` and `weeklyRows` onto the frame**

In `weekly.ts`, replace the `(daily, periodDays, today)` signatures:

```ts
export function weekBuckets(daily: DailyMetrics[], frame: PeriodFrame): WeekBucket[] {
  const weeks = new Map<string, DailyMetrics[]>()
  for (const d of frameSlice(daily, frame)) {
    const wk = mondayOf(d.date)
    weeks.set(wk, [...(weeks.get(wk) ?? []), d])
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, rows]) => ({ weekStart, rows }))
}

export function weeklyRows(daily: DailyMetrics[], frame: PeriodFrame): WeeklyRow[] { /* weekBuckets(daily, frame) */ }

export function coverage(
  daily: DailyMetrics[],
  frame: PeriodFrame,
): { gaps: CoverageGap[]; missingDates: string[] } {
  const slice = frameSlice(daily, frame)
  const gaps: CoverageGap[] = []
  for (const m of METRIC_DEFS) {
    const withData = slice.filter(d => typeof m.get(d) === 'number').length
    if (!withData) continue
    const missingPct = Math.round((1 - withData / frame.calendarDays) * 100)
    if (missingPct >= 10) {
      gaps.push({ key: m.key, label: m.label, daysWithData: withData, daysInPeriod: frame.calendarDays, missingPct })
    }
  }
  const have = new Set(slice.map(d => d.date))
  const missingDates: string[] = []
  for (let date = frame.effectiveStart; date <= frame.end; date = addDays(date, 1)) {
    if (!have.has(date)) missingDates.push(date)
  }
  return { gaps, missingDates }
}
```

Update `detectDeviations` in `deviations.ts` to take `(daily, frame)` and pass
the frame to `weekBuckets`.

- [ ] **Step 6: Wire the frame through the model**

In `model.ts`: build `const frame = periodFrame(daily, periodDays, today)` once,
pass it to `summarizeMetrics`, `weeklyRows`, `coverage` and `detectDeviations`,
and return it as `period`. Replace the `period` field type in
`DoctorReportModel` with `PeriodFrame`. `buildLabs`, `buildSupplements`,
`buildConcerns` and `buildJournal` keep taking `frame.effectiveStart` where they
took `start`.

- [ ] **Step 7: Print the data-quality line in both renderers**

`markdown.ts`, right after the period bullet:

```ts
p(`- **${t('Период')}:** ${model.period.effectiveStart} — ${model.period.end} (${model.period.calendarDays} ${t('дней')})`)
p(`- **${t('Качество данных')}:** ${t('календарных дней')} ${model.period.calendarDays} · ${t('дней хотя бы с одной записью')} ${model.period.daysWithAnyRecord} · ${t('полностью пустых дней')} ${model.period.emptyDays}`)
if (model.period.clamped) {
  p(`- **${t('Запрошенный период')}:** ${model.period.nominalDays} ${t('дней')}, ${t('но данные начинаются')} ${model.period.effectiveStart} — ${t('знаменатель считается от этой даты')}`)
}
```

`DoctorReport.tsx`, in the `dr-meta` block, the same three facts as `<p>`
elements using `rt()`.

- [ ] **Step 8: Add the five translation keys**

In `apps/web/src/lib/translations/settings.ts`, inside the
`// ── Doctor report v2` block:

```ts
  'Качество данных': { uk: 'Якість даних', en: 'Data quality' },
  'календарных дней': { uk: 'календарних днів', en: 'calendar days' },
  'дней хотя бы с одной записью': { uk: 'днів хоча б з одним записом', en: 'days with at least one record' },
  'полностью пустых дней': { uk: 'повністю порожніх днів', en: 'days with no record at all' },
  'Запрошенный период': { uk: 'Запитаний період', en: 'Requested period' },
  'но данные начинаются': { uk: 'але дані починаються', en: 'but the data starts' },
  'знаменатель считается от этой даты': { uk: 'знаменник рахується від цієї дати', en: 'the denominator counts from that date' },
```

- [ ] **Step 9: Fix the model test that asserts the old period shape**

In `model.test.ts` replace the first assertion:

```ts
  it('describes the period it covers', () => {
    const m = buildReportModel({ daily, sources: emptySources, periodDays: 30, today })
    expect(m.period.effectiveStart).toBe(addDays(today, -29))
    expect(m.period.end).toBe(today)
    expect(m.period.calendarDays).toBe(30)
    expect(m.period.emptyDays).toBe(0)
  })
```

- [ ] **Step 10: Run the whole web suite and the build**

Run: `npm test -w tonus-web && npm run build`
Expected: PASS, no TypeScript errors.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src
git commit -m "fix(report): divide coverage by calendar days, not by rows that exist"
```

---

### Task 2: A weekly cell needs three days

One measurement in a week is currently printed as that week's average.

**Files:**
- Modify: `apps/web/src/lib/doctorReport/weekly.ts`
- Test: `apps/web/src/lib/doctorReport/weekly.test.ts`

**Interfaces:**
- Consumes: `PeriodFrame`, `weeklyRows(daily, frame)` from Task 1.
- Produces: exported `MIN_WEEK_DAYS = 3`.

- [ ] **Step 1: Write the failing test**

```ts
import { MIN_WEEK_DAYS, weeklyRows } from './weekly'
import { periodFrame } from './metrics'

it('leaves a weekly cell empty below three days of that metric', () => {
  const daily = [
    { date: '2026-07-27', hrv: 40 },
    { date: '2026-07-28', hrv: 60 },
    { date: '2026-07-29', steps: 9000 },
  ]
  const rows = weeklyRows(daily, periodFrame(daily, 30, '2026-07-31'))
  expect(MIN_WEEK_DAYS).toBe(3)
  expect(rows[0].values.hrv).toBeUndefined()
  expect(rows[0].days).toBe(3)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -w tonus-web -- src/lib/doctorReport/weekly.test.ts`
Expected: FAIL — `rows[0].values.hrv` is `50`.

- [ ] **Step 3: Implement**

```ts
/** Days of a metric a week needs before its mean is printed as a weekly value. */
export const MIN_WEEK_DAYS = 3
```

and in `weeklyRows`: `if (v.length >= MIN_WEEK_DAYS) values[m.key] = +avg(v).toFixed(m.digits)`.

- [ ] **Step 4: Run the test**

Run: `npm test -w tonus-web -- src/lib/doctorReport/weekly.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/doctorReport
git commit -m "fix(report): require three days before printing a weekly average"
```

---

### Task 3: Reliability bands

**Files:**
- Create: `apps/web/src/lib/doctorReport/reliability.ts`
- Create: `apps/web/src/lib/doctorReport/reliability.test.ts`
- Modify: `apps/web/src/lib/doctorReport/metrics.ts` (add `quantile`, attach `reliability` to `MetricSummary`)
- Modify: `apps/web/src/lib/doctorReport/markdown.ts`, `apps/web/src/components/settings/DoctorReport.tsx`
- Modify: `apps/web/src/lib/translations/settings.ts`

**Interfaces:**
- Consumes: `addDays`, `PeriodFrame`, `frameSlice` from Task 1.
- Produces: `Band`, `Reliability`, `bandOf(pct: number): Band`,
  `supportsClaims(b: Band): boolean`,
  `reliabilityOf(datesWithValue: Set<string>, start: string, end: string): Reliability`,
  `quantile(values: number[], p: number): number` (in `metrics.ts`), and
  `MetricSummary.reliability: Reliability`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/doctorReport/reliability.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { bandOf, reliabilityOf, supportsClaims } from './reliability'

describe('bandOf', () => {
  it('draws the boundaries at 80, 60 and 40 percent', () => {
    expect(bandOf(80)).toBe('high')
    expect(bandOf(79)).toBe('medium')
    expect(bandOf(60)).toBe('medium')
    expect(bandOf(59)).toBe('low')
    expect(bandOf(40)).toBe('low')
    expect(bandOf(39)).toBe('insufficient')
  })

  it('lets derived claims through only at medium or better', () => {
    expect(supportsClaims('high')).toBe(true)
    expect(supportsClaims('medium')).toBe(true)
    expect(supportsClaims('low')).toBe(false)
    expect(supportsClaims('insufficient')).toBe(false)
  })
})

describe('reliabilityOf', () => {
  it('counts coverage against calendar days and finds the longest gap', () => {
    const have = new Set(['2026-07-01', '2026-07-02', '2026-07-06', '2026-07-10'])
    const r = reliabilityOf(have, '2026-07-01', '2026-07-10')
    expect(r.daysInPeriod).toBe(10)
    expect(r.daysWithData).toBe(4)
    expect(r.coveragePct).toBe(40)
    expect(r.band).toBe('low')
    expect(r.maxGap).toBe(3) // 07-03, 07-04, 07-05
  })

  it('reports a fully empty window as one long gap', () => {
    const r = reliabilityOf(new Set(), '2026-07-01', '2026-07-05')
    expect(r.coveragePct).toBe(0)
    expect(r.band).toBe('insufficient')
    expect(r.maxGap).toBe(5)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -w tonus-web -- src/lib/doctorReport/reliability.test.ts`
Expected: FAIL — cannot find module `./reliability`.

- [ ] **Step 3: Implement `reliability.ts`**

```ts
import { addDays } from './metrics'

// How much of the period a metric covers, and what that permits the report to
// say. Measured values print at every band; only derived claims are gated.

export type Band = 'high' | 'medium' | 'low' | 'insufficient'

export interface Reliability {
  daysWithData: number
  daysInPeriod: number
  coveragePct: number
  band: Band
  /** Longest run of consecutive days with no value for this metric. */
  maxGap: number
}

export const bandOf = (pct: number): Band =>
  pct >= 80 ? 'high' : pct >= 60 ? 'medium' : pct >= 40 ? 'low' : 'insufficient'

/** Baseline comparisons, deviations and trends need this; raw values do not. */
export const supportsClaims = (band: Band): boolean => band === 'high' || band === 'medium'

export function reliabilityOf(datesWithValue: Set<string>, start: string, end: string): Reliability {
  let daysInPeriod = 0
  let daysWithData = 0
  let gap = 0
  let maxGap = 0
  for (let date = start; date <= end; date = addDays(date, 1)) {
    daysInPeriod++
    if (datesWithValue.has(date)) {
      daysWithData++
      gap = 0
    } else {
      gap++
      if (gap > maxGap) maxGap = gap
    }
  }
  const pct = daysInPeriod ? (daysWithData / daysInPeriod) * 100 : 0
  return { daysWithData, daysInPeriod, coveragePct: Math.round(pct), band: bandOf(pct), maxGap }
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -w tonus-web -- src/lib/doctorReport/reliability.test.ts`
Expected: PASS.

- [ ] **Step 5: Attach reliability to every metric row**

In `metrics.ts`, add to `MetricSummary`:

```ts
  reliability: Reliability
```

and inside the `summarizeMetrics` loop, before pushing:

```ts
    const dates = new Set(slice.filter(d => typeof m.get(d) === 'number').map(d => d.date))
    const rel = reliabilityOf(dates, frame.effectiveStart, frame.end)
```

Push `reliability: rel`, and set `daysWithData: rel.daysWithData`,
`daysInPeriod: rel.daysInPeriod` from it so one calculation feeds both.

Also add `quantile` next to `avg` — Task 4 and Task 7 both need it, and it
belongs with the other primitives:

```ts
/** Linear-interpolated quantile; p is 0..1 over the sorted values. */
export function quantile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b)
  const i = (s.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo)
}
```

- [ ] **Step 6: Print the band and the longest gap**

Add a column to the metric table in both renderers. `markdown.ts`:

```ts
const BAND_TEXT: Record<Band, string> = {
  high: 'высокая', medium: 'средняя', low: 'низкая', insufficient: 'недостаточная',
}
```

The metric row gains one cell:
`${t(BAND_TEXT[m.reliability.band])}${m.reliability.maxGap > 1 ? `, ${t('макс. пробел')} ${m.reliability.maxGap} ${t('дн.')}` : ''}`
under the new header `t('Надёжность')`. Mirror the same cell and header in the
`DoctorReport.tsx` metric table. Export `BAND_TEXT` from `reliability.ts` so
both renderers share one dictionary.

- [ ] **Step 7: Add the translation keys**

```ts
  'Надёжность': { uk: 'Надійність', en: 'Reliability' },
  'высокая': { uk: 'висока', en: 'high' },
  'средняя': { uk: 'середня', en: 'medium' },
  'низкая': { uk: 'низька', en: 'low' },
  'недостаточная': { uk: 'недостатня', en: 'insufficient' },
  'макс. пробел': { uk: 'макс. прогалина', en: 'longest gap' },
  'дн.': { uk: 'дн.', en: 'days' },
```

- [ ] **Step 8: Run the suite and the build**

Run: `npm test -w tonus-web && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat(report): band every metric by coverage and print its longest gap"
```

---

### Task 4: Personal baseline replaces the percentage

Today the report compares a 90-day average against the rolling 30-day **mean**
of the period's **last** day — a baseline living inside the window it judges.

**Files:**
- Modify: `apps/web/src/lib/doctorReport/reliability.ts` (+ its test)
- Modify: `apps/web/src/lib/doctorReport/metrics.ts`, `model.ts`
- Modify: `apps/web/src/lib/doctorReport/markdown.ts`, `apps/web/src/components/settings/DoctorReport.tsx`
- Modify: `apps/web/src/lib/translations/settings.ts`

**Interfaces:**
- Consumes: `quantile` (Task 3), `supportsClaims` (Task 3), `PeriodFrame` (Task 1).
- Produces: `Baseline`, `BASELINE_WINDOW_DAYS = 28`, `MIN_BASELINE_DAYS = 14`,
  `baselineOf(values: number[], current: number, digits: number): Baseline | null`,
  and `MetricSummary.baseline: Baseline | null` replacing `baselinePct`.
  `BaselineKey` and the `baselines` argument of `summarizeMetrics` are deleted.

- [ ] **Step 1: Write the failing test**

Append to `reliability.test.ts`:

```ts
import { baselineOf, MIN_BASELINE_DAYS } from './reliability'

describe('baselineOf', () => {
  const window = Array.from({ length: 28 }, (_, i) => 44 + (i % 10)) // 44..53

  it('reports median, the usual range and where the value sits', () => {
    const b = baselineOf(window, 50, 0)!
    expect(b.days).toBe(28)
    expect(b.median).toBe(48)
    expect(b.lo).toBe(46)
    expect(b.hi).toBe(50) // 50.25 interpolated, rounded to the metric's digits
    expect(b.position).toBe('inside')
  })

  it('places a value past the quartiles above or below', () => {
    expect(baselineOf(window, 60, 0)!.position).toBe('above')
    expect(baselineOf(window, 40, 0)!.position).toBe('below')
  })

  it('refuses a baseline built on fewer than fourteen days', () => {
    expect(MIN_BASELINE_DAYS).toBe(14)
    expect(baselineOf(window.slice(0, 13), 50, 0)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -w tonus-web -- src/lib/doctorReport/reliability.test.ts`
Expected: FAIL — `baselineOf is not a function`.

- [ ] **Step 3: Implement in `reliability.ts`**

```ts
import { addDays, quantile } from './metrics'

/** Days before the period start the baseline is built from. */
export const BASELINE_WINDOW_DAYS = 28
/** Values that window must hold before the comparison is printed at all. */
export const MIN_BASELINE_DAYS = 14

export interface Baseline {
  median: number
  /** 25th and 75th percentile of the same window — the usual spread. */
  lo: number
  hi: number
  days: number
  position: 'inside' | 'above' | 'below'
}

/**
 * A median and a range, not a percentage: +4% on a resting heart rate of 48 is
 * two beats and noise, the same +4% on HRV is not. A range says which one the
 * reader is looking at.
 */
export function baselineOf(values: number[], current: number, digits: number): Baseline | null {
  if (values.length < MIN_BASELINE_DAYS) return null
  const round = (n: number) => +n.toFixed(digits)
  const lo = round(quantile(values, 0.25))
  const hi = round(quantile(values, 0.75))
  return {
    median: round(quantile(values, 0.5)),
    lo,
    hi,
    days: values.length,
    position: current > hi ? 'above' : current < lo ? 'below' : 'inside',
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -w tonus-web -- src/lib/doctorReport/reliability.test.ts`
Expected: PASS.

- [ ] **Step 5: Compute it for every metric**

In `metrics.ts`, drop `BaselineKey`, the `baselines` parameter and
`baselinePct`; add `baseline: Baseline | null` to `MetricSummary`. Inside the
loop:

```ts
    const windowStart = addDays(frame.effectiveStart, -BASELINE_WINDOW_DAYS)
    const before = daily.filter(d => d.date >= windowStart && d.date < frame.effectiveStart)
    const baseValues = before.map(m.get).filter((v): v is number => typeof v === 'number')
    const baseline = supportsClaims(rel.band) ? baselineOf(baseValues, a, m.digits) : null
```

Note the two conditions: enough days *inside* the period for the average to
mean anything, and enough days *before* it for the baseline. Either one missing
means no comparison.

In `model.ts`, delete the `baselines` object built from `computeDailyScores`
and the now-unused `lastScore` reads for baselines; call
`summarizeMetrics(daily, frame)`.

- [ ] **Step 6: Print the range in both renderers**

Replace the `К личной норме` cell. `markdown.ts`:

```ts
const POSITION_TEXT: Record<Baseline['position'], string> = {
  inside: 'внутри диапазона', above: 'выше диапазона', below: 'ниже диапазона',
}

const baselineCell = (m: MetricSummary, t: (k: string) => string): string =>
  m.baseline
    ? `${t('медиана')} ${m.baseline.median.toFixed(m.digits)} · ${m.baseline.lo.toFixed(m.digits)}–${m.baseline.hi.toFixed(m.digits)} · ${t(POSITION_TEXT[m.baseline.position])}`
    : t('данных недостаточно')
```

Rename the column header to `t('Личная норма (медиана и обычный диапазон)')`
in both renderers, and replace the old note under the table with:

```
«Личная норма» — медиана за 28 дней до начала периода и её межквартильный
диапазон. Считается только при покрытии от 60% и минимум 14 днях в этом окне.
Оценки Tonus выше используют другую базу — скользящее среднее за 30 дней.
```

- [ ] **Step 7: Add the translation keys**

```ts
  'Личная норма (медиана и обычный диапазон)': { uk: 'Особиста норма (медіана і звичайний діапазон)', en: 'Personal baseline (median and usual range)' },
  'медиана': { uk: 'медіана', en: 'median' },
  'внутри диапазона': { uk: 'усередині діапазону', en: 'inside the range' },
  'выше диапазона': { uk: 'вище діапазону', en: 'above the range' },
  'ниже диапазона': { uk: 'нижче діапазону', en: 'below the range' },
  'данных недостаточно': { uk: 'даних недостатньо', en: 'not enough data' },
  '«Личная норма» — медиана за 28 дней до начала периода и её межквартильный диапазон. Считается только при покрытии от 60% и минимум 14 днях в этом окне. Оценки Tonus выше используют другую базу — скользящее среднее за 30 дней.': { uk: '«Особиста норма» — медіана за 28 днів до початку періоду і її міжквартильний діапазон. Рахується лише за покриття від 60% і щонайменше 14 днях у цьому вікні. Оцінки Tonus вище використовують іншу базу — ковзне середнє за 30 днів.', en: '"Personal baseline" is the median of the 28 days before the period start and its interquartile range. It is computed only at 60% coverage or better and with at least 14 days in that window. The Tonus scores above use a different base — a rolling 30-day mean.' },
```

Delete the old key `'«Личная норма» — скользящая базовая линия за 30 дней до текущего дня, расчёт приложения.'`.

- [ ] **Step 8: Add the model-level test**

In `model.test.ts`:

```ts
  it('prints no baseline comparison for a metric below the coverage band', () => {
    const sparse = daily.map((d, i) => (i % 4 === 0 ? d : { ...d, hrv: undefined }))
    const m = buildReportModel({ daily: sparse, sources: emptySources, periodDays: 30, today })
    const hrv = m.metrics.find(x => x.key === 'hrv')!
    expect(hrv.daysWithData).toBeGreaterThan(0)
    expect(hrv.baseline).toBeNull()
  })
```

- [ ] **Step 9: Run the suite and the build**

Run: `npm test -w tonus-web && npm run build`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src
git commit -m "feat(report): compare against a median and a range, not a percentage"
```

---

### Task 5: Deviations obey the band

**Files:**
- Modify: `apps/web/src/lib/doctorReport/deviations.ts`, `model.ts`
- Test: `apps/web/src/lib/doctorReport/deviations.test.ts`

**Interfaces:**
- Consumes: `PeriodFrame` (Task 1), `supportsClaims` and `Reliability` (Task 3).
- Produces: `detectDeviations(daily, frame, allowed: Set<MetricKey>)` — a metric
  absent from `allowed` is never reported.

- [ ] **Step 1: Write the failing test**

```ts
it('never reports a metric whose coverage is too thin', () => {
  const daily = buildIllnessWeekFixture() // existing helper in this file
  const all = detectDeviations(daily, periodFrame(daily, 90, today), new Set(['rhr', 'hrv', 'sleep']))
  const gated = detectDeviations(daily, periodFrame(daily, 90, today), new Set(['rhr']))
  expect(all.some(w => w.items.some(i => i.key === 'hrv'))).toBe(true)
  expect(gated.some(w => w.items.some(i => i.key === 'hrv'))).toBe(false)
})
```

If `deviations.test.ts` has no fixture helper, build the daily array inline:
90 days of `restingHeartRate: 55, hrv: 45, sleepHours: 7`, with days −30..−24
set to `restingHeartRate: 66, hrv: 30, sleepHours: 5.5`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -w tonus-web -- src/lib/doctorReport/deviations.test.ts`
Expected: FAIL — `detectDeviations` takes three arguments of different types.

- [ ] **Step 3: Implement**

```ts
export function detectDeviations(
  daily: DailyMetrics[],
  frame: PeriodFrame,
  allowed: Set<MetricKey>,
): DeviationWeek[] {
  const buckets = weekBuckets(daily, frame)
  const found: (Deviation & { weekStart: string; days: number })[] = []

  for (const m of METRIC_DEFS) {
    if (!allowed.has(m.key)) continue
    // ...rest unchanged
```

In `model.ts`, build the set from the summaries already computed:

```ts
  const metrics = summarizeMetrics(daily, frame)
  const reliable = new Set(metrics.filter(m => supportsClaims(m.reliability.band)).map(m => m.key))
  // ...
  deviations: detectDeviations(daily, frame, reliable),
```

- [ ] **Step 4: Run the test**

Run: `npm test -w tonus-web -- src/lib/doctorReport/deviations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/doctorReport
git commit -m "fix(report): keep thinly covered metrics out of the deviations section"
```

---

### Task 6: Daytime sleep episodes stop counting as nights

A 1.9-hour doze from 09:08 to 11:11 is currently a night shorter than six hours.

**Files:**
- Modify: `apps/web/src/lib/doctorReport/sleep.ts`, `model.ts`
- Modify: `apps/web/src/lib/doctorReport/markdown.ts`, `apps/web/src/components/settings/DoctorReport.tsx`
- Modify: `apps/web/src/lib/translations/settings.ts`
- Test: `apps/web/src/lib/doctorReport/sleep.test.ts`

**Interfaces:**
- Produces: `DAYTIME_MAX_HOURS = 3`, `DAYTIME_FROM_HOUR = 8`,
  `DAYTIME_TO_HOUR = 20`, `isDaytimeEpisode(d: DailyMetrics): boolean`,
  `withoutDaytimeSleep(daily: DailyMetrics[]): DailyMetrics[]`,
  `SleepNight.daytime: boolean`, `SleepSection.daytimeCount: number`.

- [ ] **Step 1: Write the failing test**

```ts
import { buildSleep, isDaytimeEpisode, withoutDaytimeSleep } from './sleep'
import { periodFrame } from './metrics'

describe('daytime episodes', () => {
  const nap: DailyMetrics = { date: '2026-07-15', sleepHours: 1.9, sleepBedtime: '2026-07-15T09:08:00' }
  const night: DailyMetrics = { date: '2026-07-16', sleepHours: 7.2, sleepBedtime: '2026-07-16T01:10:00' }
  const earlyShort: DailyMetrics = { date: '2026-07-17', sleepHours: 2.5, sleepBedtime: '2026-07-17T03:00:00' }
  const longAfternoon: DailyMetrics = { date: '2026-07-18', sleepHours: 3.5, sleepBedtime: '2026-07-18T14:00:00' }

  it('marks a short episode that starts during the day', () => {
    expect(isDaytimeEpisode(nap)).toBe(true)
    expect(isDaytimeEpisode(night)).toBe(false)
    expect(isDaytimeEpisode(earlyShort)).toBe(false)   // short, but at night
    expect(isDaytimeEpisode(longAfternoon)).toBe(false) // daytime, but not short
  })

  it('classifies nothing without a timestamp', () => {
    expect(isDaytimeEpisode({ date: '2026-07-15', sleepHours: 1.9 })).toBe(false)
  })

  it('keeps the row but drops it from every night count', () => {
    const daily = [nap, night]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-07-31'))!
    expect(s.nights).toHaveLength(2)
    expect(s.nights[0].daytime).toBe(true)
    expect(s.daytimeCount).toBe(1)
    expect(s.under6).toBe(0)
    expect(s.total).toBe(1)
  })

  it('blanks the sleep fields so every aggregate ignores them', () => {
    const [clean] = withoutDaytimeSleep([nap])
    expect(clean.sleepHours).toBeUndefined()
    expect(clean.sleepBedtime).toBeUndefined()
    expect(clean.date).toBe('2026-07-15')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -w tonus-web -- src/lib/doctorReport/sleep.test.ts`
Expected: FAIL — `isDaytimeEpisode is not a function`.

- [ ] **Step 3: Implement in `sleep.ts`**

```ts
/** An episode this short, starting inside the daytime window, is not a night. */
export const DAYTIME_MAX_HOURS = 3
export const DAYTIME_FROM_HOUR = 8
export const DAYTIME_TO_HOUR = 20

/**
 * Without a timestamp nothing is classified: the report marks what it can see
 * and never guesses. The XML importer merges a nap folded into a real night
 * before the data reaches us, so only wholly daytime episodes are findable
 * here — splitting the rest belongs to the ingest.
 */
export function isDaytimeEpisode(d: DailyMetrics): boolean {
  if (d.sleepHours == null || d.sleepHours >= DAYTIME_MAX_HOURS) return false
  if (!d.sleepBedtime) return false
  const start = new Date(d.sleepBedtime)
  if (isNaN(start.getTime())) return false
  const hour = start.getHours()
  return hour >= DAYTIME_FROM_HOUR && hour < DAYTIME_TO_HOUR
}

/** Sleep fields blanked on daytime episodes, so no aggregate counts them. */
export function withoutDaytimeSleep(daily: DailyMetrics[]): DailyMetrics[] {
  return daily.map(d => {
    if (!isDaytimeEpisode(d)) return d
    const copy = { ...d }
    delete copy.sleepHours
    delete copy.sleepDeep
    delete copy.sleepREM
    delete copy.sleepCore
    delete copy.sleepBedtime
    delete copy.sleepWakeTime
    return copy
  })
}
```

In `buildSleep`, take `(daily, frame)`, keep every row, and count over nights
only:

```ts
  const nightly = withSleep.filter(d => !isDaytimeEpisode(d))
  // nights: map over withSleep, adding `daytime: isDaytimeEpisode(d)`
  return {
    nights,
    total: nightly.length,
    under6: nightly.filter(d => d.sleepHours! < 6).length,
    over8: nightly.filter(d => d.sleepHours! >= 8).length,
    missing: frame.calendarDays - nightly.length,
    daytimeCount: withSleep.length - nightly.length,
    implausible: nightly.filter(/* unchanged */).length,
  }
```

`buildSleep` now takes `(daily, frame)`. Update the three existing calls in
`sleep.test.ts` to `buildSleep(daily, periodFrame(daily, 30, today))`; their
assertions still hold — the `counts short, long, missing` case has an
`effectiveStart` of `2026-07-28`, so `calendarDays` is 4 and `missing` stays 1.

- [ ] **Step 4: Run the test**

Run: `npm test -w tonus-web -- src/lib/doctorReport/sleep.test.ts`
Expected: PASS.

- [ ] **Step 5: Feed the sanitised array to every aggregate**

In `model.ts`, at the top of `buildReportModel`:

```ts
  // Daytime episodes are shown in the sleep table and excluded everywhere else:
  // one filtered copy feeds metrics, weeks, coverage, deviations and scores.
  const clean = withoutDaytimeSleep(daily)
```

Use `clean` for `periodFrame`, `summarizeMetrics`, `weeklyRows`, `coverage`,
`detectDeviations` and `computeDailyScores`; keep the raw `daily` for
`buildSleep` only.

- [ ] **Step 6: Render the mark and the count**

In both renderers the sleep row prints `n.daytime ? t('дневной эпизод') : ''`
in a new last column headed `t('Тип')` (nights print an empty cell), and the
summary line becomes:

```
Ночей в периоде: {total}. Короче 6 ч: {under6}. От 8 ч: {over8}.
Без записи ночного сна: {missing}. Дневных эпизодов: {daytimeCount}.
```

Followed, when `daytimeCount > 0`, by:

```
Дневные эпизоды (короче 3 ч, начались между 08:00 и 20:00) показаны в таблице,
но не входят в подсчёт ночей, в средние времена и в оценку сна.
```

- [ ] **Step 7: Add the translation keys**

```ts
  'Тип': { uk: 'Тип', en: 'Type' },
  'дневной эпизод': { uk: 'денний епізод', en: 'daytime episode' },
  'Без записи ночного сна': { uk: 'Без запису нічного сну', en: 'No night-sleep record' },
  'Дневных эпизодов': { uk: 'Денних епізодів', en: 'Daytime episodes' },
  'Дневные эпизоды (короче 3 ч, начались между 08:00 и 20:00) показаны в таблице, но не входят в подсчёт ночей, в средние времена и в оценку сна.': { uk: 'Денні епізоди (коротші за 3 год, почалися між 08:00 і 20:00) показані в таблиці, але не входять у підрахунок ночей, у середні часи та в оцінку сну.', en: 'Daytime episodes (under 3 h, starting between 08:00 and 20:00) are shown in the table but excluded from the night counts, the time medians and the sleep score.' },
```

Delete the now-wrong key `'Без записи сна'` usage in favour of the new one.

- [ ] **Step 8: Run the suite and the build**

Run: `npm test -w tonus-web && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "fix(report): stop counting daytime sleep episodes as nights"
```

---

### Task 7: Dated bedtimes and circular medians

`02:14 → 01:55` looks impossible only because the date was thrown away.

**Files:**
- Modify: `apps/web/src/lib/doctorReport/sleep.ts`, `metrics.ts`, `model.ts`
- Modify: `apps/web/src/lib/doctorReport/markdown.ts`, `apps/web/src/components/settings/DoctorReport.tsx`
- Modify: `apps/web/src/lib/translations/settings.ts`
- Test: `apps/web/src/lib/doctorReport/sleep.test.ts`, `metrics.test.ts`

**Interfaces:**
- Consumes: `quantile` (Task 3), `isDaytimeEpisode` (Task 6).
- Produces: `TimeStat { median: string; q1: string; q3: string; count: number }`,
  `timeOfDayStats(isoList: string[]): TimeStat | null` in `metrics.ts`,
  `SleepNight.bedtimeDate | wakeDate: string | null` (as `DD.MM`),
  `SleepSection.bedtime | wake: TimeStat | null`.
  `avgTimeOfDay` and `DoctorReportModel.avgBedtime | avgWakeTime` are deleted.

- [ ] **Step 1: Write the failing test**

In `metrics.test.ts`, replace the `avgTimeOfDay` describe block:

```ts
describe('timeOfDayStats', () => {
  it('puts the median of times straddling midnight at midnight', () => {
    const s = timeOfDayStats(['2026-07-30T23:40:00', '2026-07-31T00:20:00'])!
    expect(s.median).toBe('00:00')
  })

  it('reports quartiles around the median bedtime', () => {
    const s = timeOfDayStats([
      '2026-07-29T01:00:00', '2026-07-30T02:00:00', '2026-07-31T03:00:00',
    ])!
    expect(s.median).toBe('02:00')
    expect(s.q1).toBe('01:30')
    expect(s.q3).toBe('02:30')
    expect(s.count).toBe(3)
  })

  it('is null without times', () => {
    expect(timeOfDayStats([])).toBeNull()
  })
})
```

In `sleep.test.ts`:

```ts
it('qualifies a bedtime that falls on the previous calendar day', () => {
  const daily: DailyMetrics[] = [{
    date: '2026-06-13', sleepHours: 7.3,
    sleepBedtime: '2026-06-12T02:14:00', sleepWakeTime: '2026-06-13T01:55:00',
  }]
  const s = buildSleep(daily, periodFrame(daily, 90, '2026-07-31'))!
  expect(s.nights[0].bedtime).toBe('02:14')
  expect(s.nights[0].bedtimeDate).toBe('12.06')
  expect(s.nights[0].wakeDate).toBeNull() // same day as the row
})
```

- [ ] **Step 2: Run both and watch them fail**

Run: `npm test -w tonus-web -- src/lib/doctorReport/metrics.test.ts src/lib/doctorReport/sleep.test.ts`
Expected: FAIL — `timeOfDayStats is not a function`.

- [ ] **Step 3: Implement `timeOfDayStats` in `metrics.ts`**

Replace `avgTimeOfDay` entirely:

```ts
/**
 * Circular statistics for a clock time. Times map to minutes since 18:00
 * before ordering, which keeps a cluster around midnight contiguous — with
 * daytime episodes excluded upstream, no realistic bedtime or wake time sits
 * near the 18:00 seam. A plain mean puts 23:50 and 00:10 at noon.
 */
const ORIGIN_MIN = 18 * 60

export interface TimeStat {
  median: string
  q1: string
  q3: string
  count: number
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function timeOfDayStats(isoList: string[]): TimeStat | null {
  const shifted = isoList
    .map(iso => new Date(iso))
    .filter(d => !isNaN(d.getTime()))
    .map(d => (d.getHours() * 60 + d.getMinutes() - ORIGIN_MIN + 1440) % 1440)
  if (!shifted.length) return null
  const back = (m: number): string => {
    const t = Math.round(m + ORIGIN_MIN) % 1440
    return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`
  }
  return {
    median: back(quantile(shifted, 0.5)),
    q1: back(quantile(shifted, 0.25)),
    q3: back(quantile(shifted, 0.75)),
    count: shifted.length,
  }
}
```

- [ ] **Step 4: Implement the date qualifiers in `sleep.ts`**

```ts
const localDay = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 'DD.MM' when the timestamp lands on another calendar day, null otherwise. */
const dateQualifier = (iso: string | undefined, rowDate: string): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime()) || localDay(d) === rowDate) return null
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
}
```

Add `bedtimeDate` and `wakeDate` to each night, and compute the section stats
over nights only:

```ts
  bedtime: timeOfDayStats(nightly.map(d => d.sleepBedtime).filter((v): v is string => !!v)),
  wake: timeOfDayStats(nightly.map(d => d.sleepWakeTime).filter((v): v is string => !!v)),
```

- [ ] **Step 5: Run both tests**

Run: `npm test -w tonus-web -- src/lib/doctorReport/metrics.test.ts src/lib/doctorReport/sleep.test.ts`
Expected: PASS.

- [ ] **Step 6: Render dates and medians**

Delete `avgBedtime` / `avgWakeTime` from `model.ts`. In both renderers:

- the sleep table prints `n.bedtime + (n.bedtimeDate ? ` (${n.bedtimeDate})` : '')`, same for wake;
- the two rows appended to the metric table become, when `model.sleep?.bedtime`
  exists:

```
Время отбоя (медиана) | 01:42 | половина ночей 00:58–02:31 | ...
Время подъёма (медиана) | 07:41 | половина ночей 07:02–08:20 | ...
```

Print the median in the `Среднее` column and `${t('половина ночей')} ${q1}–${q3}`
in the `Мин`/`Макс` pair merged into the `Мин` cell, with dashes elsewhere.

- [ ] **Step 7: Add the translation keys**

```ts
  'Время отбоя (медиана)': { uk: 'Час відходу до сну (медіана)', en: 'Bedtime (median)' },
  'Время подъёма (медиана)': { uk: 'Час підйому (медіана)', en: 'Wake time (median)' },
  'половина ночей': { uk: 'половина ночей', en: 'half the nights' },
```

Delete `'Время отбоя (среднее)'` and `'Время подъёма (среднее)'`.

- [ ] **Step 8: Run the suite and the build**

Run: `npm test -w tonus-web && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "fix(report): date the sleep times and report their medians"
```

---

### Task 8: Scores lose the duplicated row and gain their arithmetic

`stress_score` is `100 − recovery`, printed under a name that promises training
volume.

**Files:**
- Modify: `apps/web/src/lib/doctorReport/model.ts`
- Modify: `apps/web/src/lib/doctorReport/markdown.ts`, `apps/web/src/components/settings/DoctorReport.tsx`
- Modify: `apps/web/src/lib/translations/settings.ts`
- Test: `apps/web/src/lib/doctorReport/model.test.ts`

**Interfaces:**
- Consumes: `PeriodFrame` (Task 1), `addDays` (Task 1).
- Produces: `ScoreSummary { key: 'sleep_score' | 'recovery_score'; label; avg;
  first; last; days: number; trend: boolean }`.

- [ ] **Step 1: Write the failing test**

Replace the `reports sleep, recovery and load` test in `model.test.ts`:

```ts
  it('reports sleep and recovery only — load was recovery inverted', () => {
    const m = buildReportModel({ daily, sources: emptySources, periodDays: 30, today })
    expect(m.scores.map(s => s.key)).toEqual(['sleep_score', 'recovery_score'])
    expect(m.scores.every(s => s.days > 0)).toBe(true)
  })

  it('refuses a score trend when a third of the period is mostly empty', () => {
    const gappy = daily.map((d, i) => (i > 40 ? { date: d.date } : d))
    const m = buildReportModel({ daily: gappy, sources: emptySources, periodDays: 30, today })
    expect(m.scores.every(s => s.trend === false)).toBe(true)
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -w tonus-web -- src/lib/doctorReport/model.test.ts`
Expected: FAIL — `stress_score` is still in the list.

- [ ] **Step 3: Implement**

```ts
// Readiness is absent on purpose: on this data it carries little signal.
// Load is absent because it was not load — stress_score is 100 − recovery,
// the same number under a name that promises training volume.
const SCORE_DEFS: { key: ScoreSummary['key']; label: string }[] = [
  { key: 'sleep_score', label: 'Сон' },
  { key: 'recovery_score', label: 'Восстановление' },
]
```

and the trend gate:

```ts
  const thirdDays = Math.max(1, Math.floor(frame.calendarDays / 3))
  const firstEnd = addDays(frame.effectiveStart, thirdDays - 1)
  const lastStart = addDays(frame.end, -(thirdDays - 1))
  for (const def of SCORE_DEFS) {
    const has = (rows: typeof inPeriod) =>
      rows.map(s => s[def.key]).filter((v): v is number => typeof v === 'number')
    const vals = has(inPeriod)
    if (!vals.length) continue
    const firstVals = has(inPeriod.filter(s => s.date <= firstEnd))
    const lastVals = has(inPeriod.filter(s => s.date >= lastStart))
    const trend = firstVals.length >= thirdDays / 2 && lastVals.length >= thirdDays / 2
    scores.push({
      key: def.key,
      label: def.label,
      avg: Math.round(mean(vals)),
      first: trend ? Math.round(mean(firstVals)) : 0,
      last: trend ? Math.round(mean(lastVals)) : 0,
      days: vals.length,
      trend,
    })
  }
```

- [ ] **Step 4: Run the test**

Run: `npm test -w tonus-web -- src/lib/doctorReport/model.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the days column, the gated trend and the explainer**

Both renderers: the score table gains a `t('Дней с данными')` column showing
`s.days`; the start/end/trend cells print a dash and `t('не рассчитан')` when
`s.trend` is false. Under the table, three lines:

```
Сон: часы сна к 8 ч; 8 ч и больше — 100.
Восстановление: HRV к личной базе (вес 60%) и пульс покоя к личной базе (вес 40%). База — скользящее среднее за 30 дней.
Оценки считаются только по дням, где есть исходные данные: день без HRV не занижает восстановление, он в него не входит.
```

- [ ] **Step 6: Add the translation keys**

```ts
  'не рассчитан': { uk: 'не розрахований', en: 'not computed' },
  'Сон: часы сна к 8 ч; 8 ч и больше — 100.': { uk: 'Сон: години сну до 8 год; 8 год і більше — 100.', en: 'Sleep: hours slept against 8 h; 8 h or more is 100.' },
  'Восстановление: HRV к личной базе (вес 60%) и пульс покоя к личной базе (вес 40%). База — скользящее среднее за 30 дней.': { uk: 'Відновлення: HRV до особистої бази (вага 60%) і пульс спокою до особистої бази (вага 40%). База — ковзне середнє за 30 днів.', en: 'Recovery: HRV against a personal base (weight 60%) and resting heart rate against a personal base (weight 40%). The base is a rolling 30-day mean.' },
  'Оценки считаются только по дням, где есть исходные данные: день без HRV не занижает восстановление, он в него не входит.': { uk: 'Оцінки рахуються лише за днями, де є вихідні дані: день без HRV не занижує відновлення, він до нього не входить.', en: 'Scores average only the days that carry the inputs: a day without HRV does not lower recovery, it is simply not in it.' },
```

Delete the `'Нагрузка'` key.

- [ ] **Step 7: Run the suite and the build**

Run: `npm test -w tonus-web && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "fix(report): drop the load row and show how each score is built"
```

---

### Task 9: Labs stop guessing

A result with no reference range and no lab flag prints as "в норме"; a
percentage and an absolute count of the same analyte form one series.

**Files:**
- Modify: `apps/web/src/lib/doctorReport/labs.ts`
- Modify: `apps/web/src/lib/doctorReport/markdown.ts`, `apps/web/src/components/settings/DoctorReport.tsx`
- Modify: `apps/web/src/lib/translations/settings.ts`
- Test: `apps/web/src/lib/doctorReport/labs.test.ts`

**Interfaces:**
- Produces: `LabStatus = 'above' | 'below' | 'in-range' | 'unknown'`,
  `LabLine.status: LabStatus`, `LabLine.statusSource: 'range' | 'lab-flag' | null`.
  `LabLine.flag` is deleted.

- [ ] **Step 1: Write the failing test**

```ts
const r = (over: Partial<LabResult>): LabResult => ({
  id: '1', lab_file_id: 'f', marker: 'X', value: 1, unit: null, date: '2026-06-20', ...over,
})

describe('buildLabs', () => {
  it('refuses a verdict without a reference range or a lab flag', () => {
    const s = buildLabs([r({ marker: 'LDL', value: 147, unit: 'mg/dL' })], '2026-01-01')
    expect(s.lines[0].status).toBe('unknown')
    expect(s.lines[0].statusSource).toBeNull()
  })

  it('uses the range when it parses and names the source', () => {
    const s = buildLabs([r({ marker: 'LDL', value: 147, ref_range: '0-115' })], '2026-01-01')
    expect(s.lines[0].status).toBe('above')
    expect(s.lines[0].statusSource).toBe('range')
  })

  it('falls back to the laboratory flag and says so', () => {
    const s = buildLabs([r({ marker: 'LDL', value: 147, flag: 'high' })], '2026-01-01')
    expect(s.lines[0].status).toBe('above')
    expect(s.lines[0].statusSource).toBe('lab-flag')
  })

  it('keeps a percentage and an absolute count apart', () => {
    const s = buildLabs([
      r({ marker: 'LINFOCITOS', value: 42.2, unit: '%', date: '2026-06-20' }),
      r({ marker: 'LINFOCITOS', value: 2.16, unit: '10E3/µL', date: '2026-06-20' }),
    ], '2026-01-01')
    expect(s.lines).toHaveLength(2)
    expect(s.lines.every(l => l.delta === null)).toBe(true)
  })

  it('treats the same unit written differently as one series', () => {
    const s = buildLabs([
      r({ marker: 'Ferritin', value: 85, unit: 'ng/mL', date: '2026-01-10' }),
      r({ marker: 'Ferritin', value: 68, unit: ' NG/ML ', date: '2026-06-20' }),
    ], '2026-01-01')
    expect(s.lines).toHaveLength(1)
    expect(s.lines[0].delta).toBe(-17)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -w tonus-web -- src/lib/doctorReport/labs.test.ts`
Expected: FAIL — `status` is undefined.

- [ ] **Step 3: Implement**

```ts
export type LabStatus = 'above' | 'below' | 'in-range' | 'unknown'

export interface LabLine {
  marker: string
  value: number
  unit: string | null
  refRange: string | null
  status: LabStatus
  /** Where the status came from — never the app's own judgement. */
  statusSource: 'range' | 'lab-flag' | null
  date: string
  prevValue: number | null
  prevDate: string | null
  delta: number | null
}

/** Grouping key: same analyte in two units is two series, never one. */
const unitKey = (u: string | null | undefined): string =>
  (u ?? '').trim().toLowerCase().replace(/\s+/g, '')

export function buildLabs(results: LabResult[], periodStartDate: string): LabsSection {
  const byKey = new Map<string, LabResult[]>()
  for (const x of results) {
    const key = `${x.marker} ${unitKey(x.unit)}`
    byKey.set(key, [...(byKey.get(key) ?? []), x])
  }
  // ...per group, replacing the flag block:
    const range = parseRefRange(cur.ref_range)
    let status: LabStatus = 'unknown'
    let statusSource: LabLine['statusSource'] = null
    if (range) {
      status = cur.value > range.hi ? 'above' : cur.value < range.lo ? 'below' : 'in-range'
      statusSource = 'range'
    } else if (cur.flag) {
      const f = cur.flag.trim().toLowerCase()
      if (f === 'high' || f === 'h' || f === '↑') { status = 'above'; statusSource = 'lab-flag' }
      else if (f === 'low' || f === 'l' || f === '↓') { status = 'below'; statusSource = 'lab-flag' }
      else if (f === 'normal') { status = 'in-range'; statusSource = 'lab-flag' }
    }
```

`markerCount` counts distinct `marker` values (not keys) so the closing count
still means "markers". Sorting stays by marker, then by unit.

- [ ] **Step 4: Run the test**

Run: `npm test -w tonus-web -- src/lib/doctorReport/labs.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the three statuses and the caveats**

Both renderers print, in the status column:

```ts
const STATUS_TEXT: Record<LabStatus, string> = {
  above: 'выше диапазона лаборатории',
  below: 'ниже диапазона лаборатории',
  'in-range': 'в диапазоне лаборатории',
  unknown: 'статус не определён: лаборатория не указала референс',
}
```

with ` (${t('по флагу лаборатории')})` appended when
`statusSource === 'lab-flag'`. Rename the column header from `'Вне нормы'` to
`t('Статус')`.

Under the labs tables, two lines:

```
Показатели с одинаковым названием в разных единицах показаны отдельными строками и не сравниваются между собой.
Дата берётся из формы загрузки файла, а не с бланка: результаты из разных лабораторий могут стоять одним днём, и порядок внутри этого дня неизвестен.
```

- [ ] **Step 6: Add the translation keys**

```ts
  'выше диапазона лаборатории': { uk: 'вище діапазону лабораторії', en: 'above the laboratory range' },
  'ниже диапазона лаборатории': { uk: 'нижче діапазону лабораторії', en: 'below the laboratory range' },
  'в диапазоне лаборатории': { uk: 'у діапазоні лабораторії', en: 'inside the laboratory range' },
  'статус не определён: лаборатория не указала референс': { uk: 'статус не визначений: лабораторія не вказала референс', en: 'status undetermined: the laboratory gave no reference range' },
  'по флагу лаборатории': { uk: 'за флагом лабораторії', en: 'from the laboratory flag' },
  'Показатели с одинаковым названием в разных единицах показаны отдельными строками и не сравниваются между собой.': { uk: 'Показники з однаковою назвою в різних одиницях показані окремими рядками і не порівнюються між собою.', en: 'Markers sharing a name but measured in different units are listed separately and never compared with each other.' },
  'Дата берётся из формы загрузки файла, а не с бланка: результаты из разных лабораторий могут стоять одним днём, и порядок внутри этого дня неизвестен.': { uk: 'Дата береться з форми завантаження файлу, а не з бланка: результати з різних лабораторій можуть стояти одним днем, і порядок усередині цього дня невідомий.', en: 'The date comes from the upload form, not from the form itself: results from different laboratories can share one date, and their order within it is unknown.' },
```

Delete the keys `'в норме'`, `'выше нормы'`, `'ниже нормы'` and `'Вне нормы'`
from the doctor-report block if nothing else uses them (`grep -rn "'в норме'"
apps/web/src`).

- [ ] **Step 7: Add the markdown guard**

In `markdown.test.ts`:

```ts
  it('never calls a lab result normal on its own authority', () => {
    const withLabs = buildReportModel({
      daily,
      sources: { ...sources, labs: [{ id: '1', lab_file_id: 'f', marker: 'LDL', value: 147, unit: 'mg/dL', date: '2026-07-20' }] },
      periodDays: 30, today,
    })
    const md = toMarkdown(withLabs, 'ru')
    expect(md).toContain('статус не определён')
    expect(md).not.toContain('в норме')
    expect(md).not.toContain('Нагрузка')
  })
```

- [ ] **Step 8: Run the suite and the build**

Run: `npm test -w tonus-web && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "fix(report): never call a lab result normal without a reference"
```

---

### Task 10: What the data does not contain

**Files:**
- Modify: `apps/web/src/lib/doctorReport/markdown.ts`, `apps/web/src/components/settings/DoctorReport.tsx`
- Modify: `apps/web/src/lib/translations/settings.ts`
- Test: `apps/web/src/lib/doctorReport/markdown.test.ts`

**Interfaces:**
- Produces: `MISSING_LINES` exported from `markdown.ts` so `DoctorReport.tsx`
  imports the one list instead of keeping a second copy (it currently has its
  own).

- [ ] **Step 1: Write the failing test**

```ts
  it('names the data the app holds but the report leaves out', () => {
    const md = toMarkdown(model, 'ru')
    expect(md).toContain('кофе, алкоголь, лекарства')
    expect(md).toContain('время и длительность')
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -w tonus-web -- src/lib/doctorReport/markdown.test.ts`
Expected: FAIL — the strings are absent.

- [ ] **Step 3: Implement**

Export from `markdown.ts` and import in `DoctorReport.tsx`, deleting the local
copy there:

```ts
export const MISSING_LINES = [
  'Артериального давления, веса, роста, температуры тела',
  'Диагнозов, назначений врача и рецептурных препаратов (учитываются только добавки, отмеченные пациентом)',
  'Питания',
  'ЭКГ, аритмий и любых клинических измерений',
  'Время и длительность эпизодов низкого или высокого пульса: в отчёте есть только суточные минимум, максимум и среднее',
  'Тип тренировки и пульс во время неё: есть только минуты упражнений и активные калории',
  'Время в постели, засыпание, ночные пробуждения и эффективность сна',
  'Кофе, алкоголь, лекарства и события (болезнь, стресс, поездки) пациент отмечает в приложении, но в этот отчёт они не включены',
  'Всё перечисленное отсутствует, а не равно нулю: не делай выводов о том, чего здесь нет.',
]
```

- [ ] **Step 4: Add the translation keys**

```ts
  'Питания': { uk: 'Харчування', en: 'Nutrition' },
  'Время и длительность эпизодов низкого или высокого пульса: в отчёте есть только суточные минимум, максимум и среднее': { uk: 'Час і тривалість епізодів низького чи високого пульсу: у звіті є лише добові мінімум, максимум і середнє', en: 'The timing and duration of low or high heart-rate episodes: the report holds only the daily minimum, maximum and mean' },
  'Тип тренировки и пульс во время неё: есть только минуты упражнений и активные калории': { uk: 'Тип тренування і пульс під час нього: є лише хвилини вправ та активні калорії', en: 'Workout type and heart rate during exercise: only exercise minutes and active calories are stored' },
  'Время в постели, засыпание, ночные пробуждения и эффективность сна': { uk: 'Час у ліжку, засинання, нічні пробудження та ефективність сну', en: 'Time in bed, sleep latency, night-time awakenings and sleep efficiency' },
  'Кофе, алкоголь, лекарства и события (болезнь, стресс, поездки) пациент отмечает в приложении, но в этот отчёт они не включены': { uk: 'Каву, алкоголь, ліки та події (хвороба, стрес, поїздки) пацієнт відмічає в застосунку, але в цей звіт вони не включені', en: 'Coffee, alcohol, medication and events (illness, stress, travel) are logged by the patient in the app but excluded from this report' },
```

Delete the key `'Питания и алкоголя'`.

- [ ] **Step 5: Run the suite and the build**

Run: `npm test -w tonus-web && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "docs(report): name the data the app holds but the report omits"
```

---

### Task 11: Whole-suite verification

**Files:** none — this task only runs and reports.

- [ ] **Step 1: Run the entire suite**

Run: `npm test`
Expected: PASS across `tonus-web` (`node` and `jsdom`), `@tonus/shared`, `repo`
and `functions`. If `apps/web/src/components/settings/DoctorReport.test.ts` or
`DoctorReport.copy.test.tsx` fail on a renamed field, fix the assertion to the
new model — do not weaken it.

- [ ] **Step 2: Lint at zero tolerance**

Run: `npm run lint`
Expected: no errors, no warnings.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `tsc -b && vite build` clean.

- [ ] **Step 4: Look at the report in demo mode**

Create `apps/web/.env.local` with `VITE_SUPABASE_URL=http://localhost:54321`,
`VITE_SUPABASE_ANON_KEY=test-anon-key` and `VITE_DEMO=1`, run `npm run dev`,
open Settings → «Отчёт для врача», and check by eye: the data-quality line in
the header, a reliability column on every metric row, no «Нагрузка», no
«в норме», the labs status column, and «Скопировать для ИИ» producing markdown
that matches the printed page section for section.

- [ ] **Step 5: Commit anything the check turned up, then push**

```bash
git push -u origin feat/doctor-report-honesty
```

---

## Self-Review

**Spec coverage.** §3 denominators → Task 1. §4 bands and the four gates →
Tasks 2 (weekly cell), 3 (bands, metric row), 4 (baseline gate), 5 (deviations
gate), 8 (score trend gate). §5 scores → Task 8. §6 baseline → Task 4. §7 sleep
→ Tasks 6 and 7. §8 labs → Task 9. §9 missing block → Task 10. §10 testing →
every task plus Task 11. §11 acceptance criteria 1–12 → Tasks 1, 3/4, 2, 8, 6,
7, 7, 9, 9, 4, 10, 11 respectively.

**Placeholders.** None: every step carries the code or the exact command.

**Type consistency.** `PeriodFrame` (Task 1) is consumed by
`summarizeMetrics`, `coverage`, `weeklyRows`, `weekBuckets`, `detectDeviations`
and `buildSleep`. `quantile` lands in `metrics.ts` (Task 3) and is used by
`baselineOf` (Task 4) and `timeOfDayStats` (Task 7) — `reliability.ts` imports
from `metrics.ts` and never the other way, so no cycle. `Reliability` (Task 3)
is read by `supportsClaims` in Tasks 4 and 5. `isDaytimeEpisode` (Task 6) is
used by `buildSleep` in Task 7. `MetricSummary.baselinePct` dies in Task 4 and
is referenced nowhere afterwards; `LabLine.flag` dies in Task 9 and its two
renderer reads go with it.
