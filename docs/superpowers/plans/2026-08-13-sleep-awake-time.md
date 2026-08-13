# Night-time Awake Time and Sleep Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the awake time Apple Health already sends for every night, and surface it — with time in bed and sleep efficiency — in the sleep screen, the AI context and the doctor report.

**Architecture:** One new nullable column `awake_hours` on `sleep_sessions` (and its staging twin). `_shared/hae.ts` reads the `awake` field it currently ignores. Time in bed and efficiency are never stored — they are derived by a new pure module `apps/web/src/lib/sleepQuality.ts` on the client, and computed locally inside `_shared/healthContext.ts` for the edge side. A hand-run SQL script backfills history from `ingest_raw`.

**Tech Stack:** Supabase Postgres + Deno edge functions, React 19 + Vite + TypeScript, vitest (node + jsdom projects), recharts.

**Spec:** `docs/superpowers/specs/2026-08-13-sleep-awake-time-design.md`

## Global Constraints

- **Node 24 for everything** — dev, build, test, lint. Every command below assumes `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` has been run in the shell.
- **English-only in the repo** — commits, comments, identifiers, docs. The only exception is product UI copy, which stays Russian with `uk`/`en` translations added alongside.
- **`npm run lint` is zero-tolerance** (`--max-warnings 0`). A new warning fails CI.
- **`npm run check:functions`** must stay clean for edge-function production code (needs `export PATH="$HOME/.deno/bin:$PATH"`).
- **`NULL` is not `0`.** `awake_hours = null` means "this night predates the feature or the source sent nothing"; `0` means "Apple measured zero awake time". No code path may collapse the two — no `?? 0`, no `Number(undefined)`, no falsy checks (`if (awake)`) where `awake === 0` must pass.
- **Hours everywhere.** `awake_hours` is stored and passed as fractional hours, formatted to minutes only at the point of display.
- Work happens on branch `feat/sleep-awake` in the worktree `.worktrees/sleep-awake`.

---

## File Structure

**Create:**
- `supabase/migrations/20260813120000_sleep_awake_hours.sql` — the column on both tables.
- `apps/web/src/lib/sleepQuality.ts` — derived arithmetic (time in bed, efficiency), the single home of the formula.
- `apps/web/src/lib/sleepQuality.test.ts` — its tests.
- `scripts/backfill-sleep-awake.sql` — hand-run backfill from `ingest_raw`.

**Modify:**
- `packages/shared/src/database.types.ts` — generated types gain the column.
- `supabase/functions/_shared/hae.ts` — parse `awake` into `SleepRow`.
- `supabase/functions/_shared/hae.test.ts` — parser tests.
- `supabase/functions/_shared/healthContext.ts` — select the column, print awake + efficiency in the sleep block.
- `supabase/functions/_shared/healthContext.test.ts` — context tests.
- `apps/web/src/types/index.ts` — `sleepAwake` on `DailyMetrics`.
- `apps/web/src/lib/sync.ts` — map the column both ways.
- `apps/web/src/components/sleep/SleepScreen.tsx` — average efficiency stat, table column.
- `apps/web/src/components/sleep/SleepScreen.test.tsx` — component test (new file if absent).
- `apps/web/src/lib/translations/metrics.ts` — uk/en for the new UI strings.
- `apps/web/src/lib/doctorReport/sleep.ts` — `awake`, `timeInBed`, `efficiencyPct` on `SleepNight`; stale comment rewritten.
- `apps/web/src/lib/doctorReport/sleep.test.ts` — section tests.
- `apps/web/src/lib/doctorReport/markdown.ts` — table columns and `MISSING_LINES`.
- `apps/web/src/lib/doctorReport/markdown.test.ts` — updated assertions.
- `apps/web/src/components/settings/DoctorReport.tsx` — the same columns in the printed page.
- `apps/web/src/lib/translations/settings.ts` — uk/en for the new report strings.

---

### Task 1: Schema and generated types

The column has to exist before any code can reference it: `sync.ts` and the report read `Database['public']['Tables']['sleep_sessions']['Row']`, so a missing type is a compile error, not a runtime surprise.

**Files:**
- Create: `supabase/migrations/20260813120000_sleep_awake_hours.sql`
- Modify: `packages/shared/src/database.types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `sleep_sessions.awake_hours: number | null` and `sleep_sessions_staging.awake_hours: number | null` in the generated `Database` type.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260813120000_sleep_awake_hours.sql`:

```sql
-- Night-time awake minutes, as reported by Health Auto Export in the
-- `awake` field of `sleep_analysis`. Nullable on purpose: NULL means the
-- night predates this column (or the source sent no field), 0 means the
-- source measured zero. Time in bed and sleep efficiency are derived from
-- duration_hours + awake_hours and are deliberately not stored.
alter table public.sleep_sessions
  add column if not exists awake_hours numeric;

alter table public.sleep_sessions_staging
  add column if not exists awake_hours real;
```

- [ ] **Step 2: Add the column to the generated types by hand**

`npm run gen:types` regenerates the whole file from the linked production project, which is only possible after the migration is applied there. Edit the file directly instead; the next real `gen:types` run must produce the same three lines.

In `packages/shared/src/database.types.ts`, find the `sleep_sessions` entry. Add `awake_hours: number | null` to its `Row`, and `awake_hours?: number | null` to both `Insert` and `Update`. Repeat for `sleep_sessions_staging`. Keep the alphabetical ordering the generator uses — `awake_hours` sorts before `bedtime`.

- [ ] **Step 3: Verify the project still type-checks**

Run: `npm run build`
Expected: PASS. (A failure here means the edit landed in the wrong table or broke the object literal.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260813120000_sleep_awake_hours.sql packages/shared/src/database.types.ts
git commit -m "feat(db): add awake_hours to sleep sessions"
```

---

### Task 2: Parse `awake` in the HAE ingest

**Files:**
- Modify: `supabase/functions/_shared/hae.ts:31` (`SleepRow`), `:34-40` (`HaePoint`), `:73-98` (the `sleep_analysis` branch)
- Test: `supabase/functions/_shared/hae.test.ts`

**Interfaces:**
- Consumes: `awake_hours` column from Task 1.
- Produces: `SleepRow` gains `awake_hours: number | null`. Both `ingest-health` upserts pass whole `SleepRow`s through, so no call site changes.

- [ ] **Step 1: Write the failing tests**

Add to `supabase/functions/_shared/hae.test.ts`:

```ts
  it('reads night-time awake hours', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          data: [{
            date: '2026-08-13 00:00:00 +0200',
            totalSleep: 8.35, deep: 0.52, rem: 2.11, core: 5.71, awake: 0.1498,
          }],
        }],
      },
    })
    expect(sleep[0].awake_hours).toBeCloseTo(0.1498)
  })

  it('converts a minutes-shaped awake value to hours', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          data: [{ date: '2026-08-13 00:00:00 +0200', totalSleep: 8.35, awake: 45 }],
        }],
      },
    })
    expect(sleep[0].awake_hours).toBeCloseTo(0.75)
  })

  it('reports a missing awake field as null, never zero', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          data: [{ date: '2026-08-13 00:00:00 +0200', totalSleep: 8.35 }],
        }],
      },
    })
    expect(sleep[0].awake_hours).toBeNull()
  })

  it('keeps a measured zero as zero', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          data: [{ date: '2026-08-13 00:00:00 +0200', totalSleep: 8.35, awake: 0 }],
        }],
      },
    })
    expect(sleep[0].awake_hours).toBe(0)
  })

  it('nulls an implausible awake value but keeps the night', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          data: [{ date: '2026-08-13 00:00:00 +0200', totalSleep: 8.35, awake: 9 }],
        }],
      },
    })
    expect(sleep).toHaveLength(1)
    expect(sleep[0].duration_hours).toBeCloseTo(8.35)
    expect(sleep[0].awake_hours).toBeNull()
  })
```

Note the third case: `awake: 45` is read as 45 minutes by the existing `toH()` heuristic (anything above 16 is minutes), and 9 hours awake in one night is rejected as implausible. Both share the phase logic already in the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/hae.test.ts`
Expected: FAIL — `awake_hours` is `undefined`, not a number/null.

- [ ] **Step 3: Implement**

In `supabase/functions/_shared/hae.ts`, extend the row type (line 31):

```ts
export interface SleepRow { user_id: string; date: string; duration_hours: number; deep_hours: number | null; rem_hours: number | null; core_hours: number | null; awake_hours: number | null; bedtime: string | null; wake_time: string | null }
```

Extend `HaePoint` (line 38) with `awake`:

```ts
  totalSleep?: unknown; asleep?: unknown; total?: unknown; deep?: unknown; rem?: unknown; core?: unknown; awake?: unknown
```

In the `sleep_analysis` branch, read it next to the phases and clamp it:

```ts
        let total = num(p.totalSleep ?? p.asleep ?? p.total ?? p.value)
        let deep = num(p.deep), rem = num(p.rem), core = num(p.core)
        let awake = num(p.awake)
        // если значения выглядят как минуты (>16) — переведём в часы
        const toH = (x: number | null) => x == null ? null : (x > 16 ? x / 60 : x)
        total = toH(total); deep = toH(deep); rem = toH(rem); core = toH(core)
        awake = toH(awake)
        // Ночное бодрствование дольше 6 ч — испорченное значение. Гасим только
        // его: длительность сна в этой же записи измерена независимо и остаётся
        // годной. NULL здесь означает «не знаем», а не «ноль».
        if (awake != null && (awake < 0 || awake > 6)) awake = null
        if (total == null || total <= 0 || total > 16) continue // отбрасываем мусор
```

and add the field to the row literal, next to `core_hours`:

```ts
            deep_hours: deep, rem_hours: rem, core_hours: core,
            awake_hours: awake,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/hae.test.ts`
Expected: PASS, including the pre-existing sleep tests.

- [ ] **Step 5: Type-check the edge code**

Run: `export PATH="$HOME/.deno/bin:$PATH" && npm run check:functions`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/hae.ts supabase/functions/_shared/hae.test.ts
git commit -m "feat(ingest): read night-time awake hours from HAE payloads"
```

---

### Task 3: Derived arithmetic module

**Files:**
- Create: `apps/web/src/lib/sleepQuality.ts`
- Test: `apps/web/src/lib/sleepQuality.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `timeInBedHours(durationHours: number | null | undefined, awakeHours: number | null | undefined): number | null` and `sleepEfficiencyPct(durationHours: number | null | undefined, awakeHours: number | null | undefined): number | null`. Later tasks call both; the efficiency helper returns whole percent (rounded), not a fraction.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/sleepQuality.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { timeInBedHours, sleepEfficiencyPct } from './sleepQuality'

describe('timeInBedHours', () => {
  it('adds awake time to sleep', () => {
    expect(timeInBedHours(8.35, 0.15)).toBeCloseTo(8.5)
  })

  it('is null when awake time is unknown', () => {
    expect(timeInBedHours(8.35, null)).toBeNull()
    expect(timeInBedHours(8.35, undefined)).toBeNull()
  })

  it('is null without a sleep duration', () => {
    expect(timeInBedHours(null, 0.15)).toBeNull()
  })

  it('treats a measured zero as a value, not as missing', () => {
    expect(timeInBedHours(8, 0)).toBeCloseTo(8)
  })
})

describe('sleepEfficiencyPct', () => {
  it('is asleep over time in bed, in whole percent', () => {
    expect(sleepEfficiencyPct(8.35, 0.15)).toBe(98)
  })

  it('is 100 when the source measured no awake time', () => {
    expect(sleepEfficiencyPct(8, 0)).toBe(100)
  })

  it('is null when awake time is unknown', () => {
    expect(sleepEfficiencyPct(8.35, null)).toBeNull()
  })

  it('is null rather than NaN when there is no time in bed', () => {
    expect(sleepEfficiencyPct(0, 0)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/lib/sleepQuality.test.ts`
Expected: FAIL — cannot resolve `./sleepQuality`.

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/sleepQuality.ts`:

```ts
/**
 * Time in bed and sleep efficiency, derived — never stored. Health Auto
 * Export sends asleep and awake hours as two independent numbers whose sum
 * matches its own in-bed span, so the pair is enough and a stored copy would
 * only be a third number to keep in sync.
 *
 * Every function returns null when awake time is unknown, which is every
 * night ingested before `awake_hours` existed. A missing value must never
 * arrive at the screen as 0 h awake / 100% efficient — that is a claim the
 * data does not make.
 */

const known = (v: number | null | undefined): v is number => v != null && isFinite(v)

/** Asleep plus awake-in-bed. Null when either side is unknown. */
export function timeInBedHours(
  durationHours: number | null | undefined,
  awakeHours: number | null | undefined,
): number | null {
  if (!known(durationHours) || !known(awakeHours)) return null
  return durationHours + awakeHours
}

/** Share of the night actually spent asleep, whole percent. Null when unknown. */
export function sleepEfficiencyPct(
  durationHours: number | null | undefined,
  awakeHours: number | null | undefined,
): number | null {
  const inBed = timeInBedHours(durationHours, awakeHours)
  if (inBed == null || inBed <= 0) return null
  return Math.round((durationHours! / inBed) * 100)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/lib/sleepQuality.test.ts`
Expected: PASS, eight tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/sleepQuality.ts apps/web/src/lib/sleepQuality.test.ts
git commit -m "feat(web): derive time in bed and sleep efficiency"
```

---

### Task 4: Carry the column into the client model

**Files:**
- Modify: `apps/web/src/types/index.ts:21-25`, `apps/web/src/lib/sync.ts:49-102` and `:196-210`
- Test: `apps/web/src/lib/sync.test.ts` (create if absent)

**Interfaces:**
- Consumes: `awake_hours` from Task 1, parser output from Task 2.
- Produces: `DailyMetrics.sleepAwake?: number` — hours, `undefined` when unknown. Tasks 5, 6 and 7 read this field.

- [ ] **Step 1: Extract the row mapping so it can be tested**

`sync.ts` has no test file, and the mapping lives inline inside `loadMetricsFromSupabase` (lines 196-211), which needs a Supabase client. Extract the per-row assignment first — a pure function, no behaviour change:

```ts
type SleepSessionRowLike = Pick<SleepSessionRow,
  'duration_hours' | 'bedtime' | 'wake_time' | 'deep_hours' | 'rem_hours' | 'core_hours' | 'awake_hours'>

/** One sleep_sessions row onto the daily model. `null` becomes `undefined`; a measured 0 survives. */
export function applySleepRow(d: DailyMetrics, row: SleepSessionRowLike): void {
  d.sleepHours = row.duration_hours ?? undefined
  d.sleepBedtime = row.bedtime ?? undefined
  d.sleepWakeTime = row.wake_time ?? undefined
  d.sleepDeep = row.deep_hours ?? undefined
  d.sleepREM = row.rem_hours ?? undefined
  d.sleepCore = row.core_hours ?? undefined
}
```

and replace lines 205-210 in the loop with `applySleepRow(d, row)`.

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/lib/sync.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applySleepRow } from './sync'
import type { DailyMetrics } from '../types'

const row = (awake: number | null) => ({
  duration_hours: 8.35, bedtime: null, wake_time: null,
  deep_hours: null, rem_hours: null, core_hours: null, awake_hours: awake,
})

describe('applySleepRow', () => {
  it('carries awake hours into the daily model', () => {
    const d: DailyMetrics = { date: '2026-08-13' }
    applySleepRow(d, row(0.15))
    expect(d.sleepAwake).toBeCloseTo(0.15)
  })

  it('leaves awake undefined when the column is null', () => {
    const d: DailyMetrics = { date: '2026-08-13' }
    applySleepRow(d, row(null))
    expect(d.sleepAwake).toBeUndefined()
  })

  it('keeps a measured zero', () => {
    const d: DailyMetrics = { date: '2026-08-13' }
    applySleepRow(d, row(0))
    expect(d.sleepAwake).toBe(0)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run apps/web/src/lib/sync.test.ts`
Expected: FAIL — the first test gets `undefined`; TypeScript also rejects `sleepAwake`, which does not exist yet.

- [ ] **Step 4: Implement**

In `apps/web/src/types/index.ts`, next to the other sleep fields:

```ts
  sleepAwake?: number      // hours awake during the night; undefined = unknown, 0 = measured zero
```

In `applySleepRow`, one more line:

```ts
  d.sleepAwake = row.awake_hours ?? undefined
```

and in the upload builder (`sync.ts:84`, next to `core_hours`):

```ts
        awake_hours: d.sleepAwake ?? null,
```

`?? undefined` and `?? null` both pass a measured `0` through untouched — that is why neither side uses `||`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/lib/sync.test.ts`
Expected: PASS, three tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/types/index.ts apps/web/src/lib/sync.ts apps/web/src/lib/sync.test.ts
git commit -m "feat(web): carry awake hours into the daily model"
```

---

### Task 5: Sleep screen

**Files:**
- Modify: `apps/web/src/components/sleep/SleepScreen.tsx:74-96` (data + averages), `:125-139` (stat row), `:190-219` (table)
- Modify: `apps/web/src/lib/translations/metrics.ts`
- Test: `apps/web/src/components/sleep/SleepScreen.test.tsx`

**Interfaces:**
- Consumes: `DailyMetrics.sleepAwake` (Task 4), `sleepEfficiencyPct` (Task 3).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/sleep/SleepScreen.test.tsx`. The jsdom project is network-isolated (`vitest.setup.ts`), and this component takes all its data as a prop, so no mocking is needed.

```tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { SleepScreen } from './SleepScreen'
import type { DailyMetrics } from '../../types'

const night = (date: string, extra: Partial<DailyMetrics> = {}): DailyMetrics => ({
  date, sleepHours: 8, sleepBedtime: `${date}T23:00:00.000Z`,
  sleepWakeTime: `${date}T07:00:00.000Z`, ...extra,
} as DailyMetrics)

describe('SleepScreen awake time', () => {
  it('shows average efficiency when awake time is known', () => {
    renderWithProviders(<SleepScreen daily={[night('2026-08-12', { sleepAwake: 0.15 })]} />)
    expect(screen.getByText(/98%/)).toBeTruthy()
  })

  it('shows no efficiency stat when no night reports awake time', () => {
    renderWithProviders(<SleepScreen daily={[night('2026-08-12')]} />)
    expect(screen.queryByText(/эффективность/i)).toBeNull()
  })

  it('renders awake minutes per night in the table', () => {
    renderWithProviders(<SleepScreen daily={[night('2026-08-12', { sleepAwake: 0.15 })]} />)
    expect(screen.getByText('0ч 9м')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run apps/web/src/components/sleep/SleepScreen.test.tsx`
Expected: FAIL — no efficiency text is rendered.

- [ ] **Step 3: Implement**

In `SleepScreen.tsx`, import the helper:

```tsx
import { sleepEfficiencyPct } from '../../lib/sleepQuality'
```

After `hasPhases` (line 84), add the gate and the average. `!= null` rather than a truthy check, so a measured `0` counts:

```tsx
  const withAwake = slice.filter(d => d.sleepAwake != null)
  const hasAwake = withAwake.length > 0

  // Средняя эффективность считается только по ночам, где бодрствование
  // измерено: ночь без него не «100%», она неизвестна.
  const avgEfficiency = hasAwake
    ? Math.round(
        withAwake.reduce((a, d) => a + (sleepEfficiencyPct(d.sleepHours, d.sleepAwake) ?? 0), 0) / withAwake.length,
      )
    : null
```

In the stat row, after the `avgWake` stat:

```tsx
        {avgEfficiency !== null && (
          <div className="stat">
            <span style={{ color: avgEfficiency >= 90 ? 'var(--green)' : avgEfficiency >= 85 ? 'var(--yellow)' : 'var(--red)' }}>
              {avgEfficiency}%
            </span>
            {t('эффективность сна')}
          </div>
        )}
```

In the table head, after the phase headers:

```tsx
              {hasAwake && <th>{t('Бодрствование')}</th>}
```

and in the body row, after the phase cells:

```tsx
                {hasAwake && <td>{d.sleepAwake != null ? fmtHours(d.sleepAwake) : '—'}</td>}
```

- [ ] **Step 4: Add the translations**

In `apps/web/src/lib/translations/metrics.ts`, next to the other sleep-screen keys:

```ts
  'эффективность сна': { uk: 'ефективність сну', en: 'sleep efficiency' },
  'Бодрствование': { uk: 'Неспання', en: 'Awake' },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/components/sleep/SleepScreen.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/sleep apps/web/src/lib/translations/metrics.ts
git commit -m "feat(web): show awake time and sleep efficiency on the sleep screen"
```

---

### Task 6: AI context

**Files:**
- Modify: `supabase/functions/_shared/healthContext.ts:31` (`CtxSleepRow`), `:144` (select), `:349-375` (sleep block)
- Test: `supabase/functions/_shared/healthContext.test.ts`

**Interfaces:**
- Consumes: `awake_hours` (Task 1).
- Produces: nothing other tasks depend on. The efficiency arithmetic is duplicated locally — `_shared` cannot import from `apps/web`, and a two-line formula is not worth a shared package.

- [ ] **Step 1: Write the failing test**

The file already imports `healthContextToText` and defines `emptyCtx` (a fully-populated `HealthContext` with empty arrays). Add:

```ts
  const nightWith = (awake: number | null) => ({
    date: '2026-08-13', bedtime: null, wake_time: null,
    duration_hours: 8.35, deep_hours: 0.52, rem_hours: 2.11, core_hours: 5.71,
    awake_hours: awake,
  })

  it('reports night-time awake time and efficiency', () => {
    const text = healthContextToText({ ...emptyCtx, sleep: [nightWith(0.15)] })
    expect(text).toContain('бодрств 9 мин')
    expect(text).toContain('98%')
  })

  it('says nothing about efficiency when awake time is unknown', () => {
    const text = healthContextToText({ ...emptyCtx, sleep: [nightWith(null)] })
    expect(text).not.toContain('бодрств')
    expect(text).not.toContain('%')
  })
```

The second assertion is only safe because `emptyCtx` carries no other section that prints a percent sign; keep the night as the only populated field.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: FAIL — the rendered text contains no awake figure.

- [ ] **Step 3: Implement**

Extend `CtxSleepRow` (line 31):

```ts
  duration_hours: number | null; deep_hours: number | null; rem_hours: number | null; core_hours: number | null
  awake_hours: number | null
```

Extend the select (line 144):

```ts
      .select('date, bedtime, wake_time, duration_hours, deep_hours, rem_hours, core_hours, awake_hours')
```

In the sleep block, add the per-night figure to the `recent` line (around line 357-361), appending only when the value exists:

```ts
      const awake = s.awake_hours != null
        ? `, бодрств ${Math.round(s.awake_hours * 60)} мин (эффективность ${Math.round((s.duration_hours! / (s.duration_hours! + s.awake_hours)) * 100)}%)`
        : ''
      return `${s.date}: всего ${s.duration_hours?.toFixed?.(1) ?? '—'}ч (глуб ${s.deep_hours?.toFixed?.(1) ?? '—'}, REM ${s.rem_hours?.toFixed?.(1) ?? '—'})${awake}${times}`
```

Guard the division: skip the suffix when `duration_hours` is null or `duration_hours + awake_hours <= 0`, so the string can never contain `NaN%`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check the edge code**

Run: `export PATH="$HOME/.deno/bin:$PATH" && npm run check:functions`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/healthContext.ts supabase/functions/_shared/healthContext.test.ts
git commit -m "feat(ai): include night-time awake time in the health context"
```

---

### Task 7: Doctor report

The report's own comment (`sleep.ts:197-202`) states that time in bed and efficiency are absent because no ingest path supplies them. That is no longer true for HAE nights and false for XML nights, and the comment must say so precisely.

**Files:**
- Modify: `apps/web/src/lib/doctorReport/sleep.ts:14-48` (`SleepNight`), `:197-234` (builder + comment)
- Modify: `apps/web/src/lib/doctorReport/markdown.ts:60-70` (`MISSING_LINES`), `:165-190` (sleep table)
- Modify: `apps/web/src/components/settings/DoctorReport.tsx:319-335`
- Modify: `apps/web/src/lib/translations/settings.ts`
- Test: `apps/web/src/lib/doctorReport/sleep.test.ts`, `apps/web/src/lib/doctorReport/markdown.test.ts`

**Interfaces:**
- Consumes: `DailyMetrics.sleepAwake` (Task 4), `sleepEfficiencyPct` and `timeInBedHours` (Task 3).
- Produces: `SleepNight` gains `awake: number | null`, `timeInBed: number | null`, `efficiencyPct: number | null`.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/lib/doctorReport/sleep.test.ts`:

```ts
  it('derives time in bed and efficiency from awake hours', () => {
    const daily: DailyMetrics[] = [{ date: '2026-08-13', sleepHours: 8.35, sleepAwake: 0.15 }]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-08-13'))!
    expect(s.nights[0].awake).toBeCloseTo(0.15)
    expect(s.nights[0].timeInBed).toBeCloseTo(8.5)
    expect(s.nights[0].efficiencyPct).toBe(98)
  })

  it('leaves all three null when the night predates awake tracking', () => {
    const daily: DailyMetrics[] = [{ date: '2026-08-13', sleepHours: 8.35 }]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-08-13'))!
    expect(s.nights[0].awake).toBeNull()
    expect(s.nights[0].timeInBed).toBeNull()
    expect(s.nights[0].efficiencyPct).toBeNull()
  })
```

`periodFrame(daily, 30, today)` is the fixture helper the other tests in this file already use.

In `apps/web/src/lib/doctorReport/markdown.test.ts`, update the `MISSING_LINES` assertion (line 93) to the new wording and add:

```ts
  it('names the awake columns in the sleep table', () => {
    const md = toMarkdown(model, 'ru')
    expect(md).toContain('Бодрствование, ч')
    expect(md).toContain('В постели, ч')
    expect(md).toContain('Эффективность')
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run apps/web/src/lib/doctorReport`
Expected: FAIL — `awake` is not a property of `SleepNight`; the markdown lacks the columns.

- [ ] **Step 3: Implement the section**

In `apps/web/src/lib/doctorReport/sleep.ts`, import the helpers:

```ts
import { timeInBedHours, sleepEfficiencyPct } from '../sleepQuality'
```

Add to `SleepNight`, after `core`:

```ts
  /**
   * Hours awake during the night, as measured by the source. `null` on every
   * night that arrived before `awake_hours` existed and on every XML-imported
   * night — the importer discards awake intervals. Never 0 in those cases:
   * an unmeasured night is not a night without awakenings.
   */
  awake: number | null
  /** Asleep plus awake. `null` whenever `awake` is. */
  timeInBed: number | null
  /** Asleep over time in bed, whole percent. `null` whenever `awake` is. */
  efficiencyPct: number | null
```

In the `nights` map, after `core`:

```ts
      awake: d.sleepAwake != null ? +d.sleepAwake.toFixed(2) : null,
      timeInBed: (v => v == null ? null : +v.toFixed(1))(timeInBedHours(d.sleepHours, d.sleepAwake)),
      efficiencyPct: sleepEfficiencyPct(d.sleepHours, d.sleepAwake),
```

In `withoutDaytimeSleep`, blank the new field alongside the others so a nap cannot contribute an efficiency figure:

```ts
    delete copy.sleepAwake
```

Replace the stale comment above `buildSleep`:

```ts
/**
 * Measured values only. Time in bed and sleep efficiency are derived from the
 * night's own awake hours, so they exist only where the source measured them:
 * HAE auto-sync supplies `awake`, the XML importer discards awake intervals
 * and leaves all three columns empty. They are never derived from
 * bedtime/wake_time, which mean different things per ingest path and would
 * lie differently on every night.
 */
```

- [ ] **Step 4: Implement the markdown renderer**

In `markdown.ts`, replace the `MISSING_LINES` entry at line 67:

```ts
  'Количество ночных пробуждений и время каждого: в отчёте есть только суммарное время бодрствования за ночь и эффективность сна, и только за те ночи, где источник их измерил',
```

Add the three columns to the sleep table header, after `'Не классифицировано, ч'`:

```ts
        t('Бодрствование, ч'), t('В постели, ч'), t('Эффективность'),
```

and to each row, in the same position:

```ts
        n.awake != null ? n.awake.toFixed(2) : dash,
        n.timeInBed != null ? n.timeInBed.toFixed(1) : dash,
        n.efficiencyPct != null ? `${n.efficiencyPct}%` : dash,
```

- [ ] **Step 5: Implement the printed page**

In `apps/web/src/components/settings/DoctorReport.tsx`, add the matching `<th>` cells after the unclassified column and the matching `<td>` cells in the same order — the two renderers must stay column-for-column identical, which is what the doctor-report tests check:

```tsx
                <th>{rt('Бодрствование, ч')}</th><th>{rt('В постели, ч')}</th><th>{rt('Эффективность')}</th>
```

```tsx
                    <td>{n.awake != null ? n.awake.toFixed(2) : dash}</td>
                    <td>{n.timeInBed != null ? n.timeInBed.toFixed(1) : dash}</td>
                    <td>{n.efficiencyPct != null ? `${n.efficiencyPct}%` : dash}</td>
```

- [ ] **Step 6: Add the translations**

In `apps/web/src/lib/translations/settings.ts`, replace the old missing-line key with the new one and add the column headers:

```ts
  'Количество ночных пробуждений и время каждого: в отчёте есть только суммарное время бодрствования за ночь и эффективность сна, и только за те ночи, где источник их измерил': { uk: 'Кількість нічних пробуджень і час кожного: у звіті є лише сумарний час неспання за ніч та ефективність сну, і лише за ті ночі, де джерело їх виміряло', en: 'The number of night-time awakenings and when each happened: the report has only the total awake time per night and sleep efficiency, and only for nights the source measured' },
  'Бодрствование, ч': { uk: 'Неспання, год', en: 'Awake, h' },
  'В постели, ч': { uk: 'У ліжку, год', en: 'Time in bed, h' },
  'Эффективность': { uk: 'Ефективність', en: 'Efficiency' },
```

Delete the now-unused `'Время в постели, засыпание, ночные пробуждения и эффективность сна'` entry.

- [ ] **Step 7: Run the doctor-report tests**

Run: `npx vitest run apps/web/src/lib/doctorReport apps/web/src/components/settings`
Expected: PASS. `DoctorReport.test.ts` asserts the `MISSING_LINES` list too (line 199) — update that copy of the string as well if the run flags it.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/doctorReport apps/web/src/components/settings apps/web/src/lib/translations/settings.ts
git commit -m "feat(report): add awake time, time in bed and efficiency to the doctor report"
```

---

### Task 8: Backfill script

**Files:**
- Create: `scripts/backfill-sleep-awake.sql`

**Interfaces:**
- Consumes: the `awake_hours` column (Task 1) and the parsing rules from Task 2 — the SQL must apply the same minutes heuristic and the same 6-hour plausibility bound, or the backfilled history will disagree with everything ingested after it.
- Produces: nothing code depends on. The user runs it by hand.

- [ ] **Step 1: Write the script**

Create `scripts/backfill-sleep-awake.sql`, following the style of `scripts/backfill-lab-sample-dates.sql`:

```sql
-- Backfill for 20260813120000_sleep_awake_hours.sql.
--
-- NOT a migration, on purpose: it reads `ingest_raw`, whose payloads are the
-- only surviving copy of what the phone sent, and writes a column the ingest
-- will keep filling on its own. Run it once, read the row counts it prints.
--
-- Coverage is bounded by ingest_raw, which starts 2026-06-19. Nights imported
-- from the Apple Health XML export (back to 2021) keep awake_hours NULL: the
-- XML importer discards awake intervals, and NULL is the honest answer there.
--
-- The two rules below mirror _shared/hae.ts exactly. If that heuristic ever
-- changes, this script is wrong and must change with it:
--   * a value above 16 is minutes, not hours
--   * a value below 0 or above 6 hours is not a night's awake time
--
-- Run:  psql "$TONUS_DB_URL" -f scripts/backfill-sleep-awake.sql

begin;

with points as (
  select r.user_id,
         (p.value ->> 'date')::timestamptz::date as night,
         (p.value ->> 'awake')::numeric          as raw_awake,
         (p.value ->> 'totalSleep')::numeric     as total_sleep
    from public.ingest_raw r
    cross join lateral jsonb_array_elements(r.payload -> 'data' -> 'metrics') m(value)
    cross join lateral jsonb_array_elements(m.value -> 'data') p(value)
   where m.value ->> 'name' = 'sleep_analysis'
     and jsonb_typeof(p.value -> 'awake') = 'number'
     and p.value ->> 'date' is not null
),
normalized as (
  select user_id, night, total_sleep,
         case when raw_awake > 16 then raw_awake / 60 else raw_awake end as awake_hours
    from points
),
plausible as (
  select user_id, night, awake_hours, total_sleep
    from normalized
   where awake_hours >= 0 and awake_hours <= 6
),
-- One payload can carry several sessions for a night, and a night can appear
-- in several payloads. hae.ts keeps the longest sleep; do the same here.
picked as (
  select distinct on (user_id, night) user_id, night, awake_hours
    from plausible
   order by user_id, night, total_sleep desc nulls last
)
update public.sleep_sessions s
   set awake_hours = picked.awake_hours
  from picked
 where s.user_id = picked.user_id
   and s.date = picked.night
   and s.awake_hours is null;

-- Print what changed before deciding to keep it.
select count(*) filter (where awake_hours is not null) as with_awake,
       count(*)                                        as total_nights,
       min(date) filter (where awake_hours is not null) as first_night,
       max(date) filter (where awake_hours is not null) as last_night
  from public.sleep_sessions;

commit;
```

- [ ] **Step 2: Sanity-check the query shape without writing**

The script mutates production, so it is not run during implementation. Verify the read half against production first by running only the `with points … select * from picked limit 20` portion through the read-only PostgREST/psql path, and confirm the dates and values match the payloads inspected in the spec (2026-08-13 should show `0.1498`).

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-sleep-awake.sql
git commit -m "chore(db): backfill script for night-time awake hours"
```

---

### Task 9: Full verification and PR

**Files:** none modified.

- [ ] **Step 1: Run the whole test suite**

Run: `VITE_DEMO= npm test`
Expected: PASS, no skipped suites. (`VITE_DEMO=` is required if a local `.env.local` sets demo mode — it breaks several tests.)

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS with zero warnings.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Deno check for the edge functions**

Run: `export PATH="$HOME/.deno/bin:$PATH" && npm run check:functions`
Expected: PASS.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/sleep-awake
gh pr create --title "feat: night-time awake time and sleep efficiency" --body "..."
```

The PR body must list the manual steps that are the user's to run, in order:

1. `npx supabase db push` — applies the migration.
2. `npm run gen:types` — confirms the hand-edited types match the generator.
3. `psql "$TONUS_DB_URL" -f scripts/backfill-sleep-awake.sql` — backfills June onwards.
4. Redeploy the edge functions that embed `_shared`: `ingest-health` (**with `--no-verify-jwt`**, or it will 401), plus `chat-health`, `analyze-health`, `biweekly-report` and `coach-weekly` for the context change.

- [ ] **Step 6: Verify against the phone**

After the backfill runs, re-read one recent night and confirm the stored value matches what Apple Health shows for it — 2026-08-13 should read 9 minutes awake, 98% efficiency.
