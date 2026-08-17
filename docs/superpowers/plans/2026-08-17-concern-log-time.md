# Time of Day on Concern Observations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An observation on a health concern records the time of day it
happened — prefilled with "now", correctable before saving — and that time
shows in the observation journal and in the doctor report.

**Architecture:** One nullable `time` column (`at_time`) is added to
`concern_logs` beside the existing local `date`, so no timezone arithmetic
enters the app. A pair of pure helpers in `src/lib/concerns.ts`
(`formatLogTime`, `compareLogsAsc`) is shared by the journal UI and the doctor
report so the two never disagree about ordering or about how a time is
rendered. Rows with `at_time === null` (every row stored before this feature)
behave exactly as today.

**Tech Stack:** React 19 + Vite (`apps/web`), TypeScript, Supabase (Postgres +
generated types in `packages/shared/src/database.types.ts`), vitest (node
project for `*.test.ts`, jsdom project for `*.test.tsx`).

Spec: `docs/superpowers/specs/2026-08-17-concern-log-time-design.md`

## Global Constraints

- **Node 24 for everything** — dev, build, test, lint. Before any command in
  this plan: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- **Repo language is English** — commit messages, comments, identifiers, docs.
  The only exceptions are product UI strings and i18n translations, which stay
  ru/uk. Do not translate existing Russian UI strings.
- **`npm run lint` runs with `--max-warnings 0`** — one new warning fails CI.
- **No new user-facing strings.** Everything this feature adds to the screen is
  a date input, a time input and a `HH:MM` label, none of which need
  translation. Do not add keys to `src/lib/translations/*`.
- **Times are rendered `HH:MM`, never with seconds.** Postgres `time` comes
  back over the wire as `"12:00:00"`.
- **`at_time === null` means "no time known"** — render the date alone, never a
  dash or a placeholder.
- Commands run from the repo root `/Users/anatolii/tonus`.
- Work happens on the branch `feat/concern-log-time` (already created off
  `origin/main`; the spec commit is its first commit).

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20260817120000_concern_log_time.sql` | **Create.** Adds the `at_time` column. |
| `packages/shared/src/database.types.ts` | **Modify.** `concern_logs` Row/Insert/Update gain `at_time`. |
| `apps/web/src/lib/concerns.ts` | **Modify.** `ConcernLog.at_time`; new pure helpers `formatLogTime` and `compareLogsAsc`; `loadLogs` sorts by date then time. |
| `apps/web/src/lib/concerns.test.ts` | **Create.** Unit tests for the two helpers. |
| `apps/web/src/components/concerns/ConcernsScreen.tsx` | **Modify.** Date + time inputs in the new-observation form; time in the journal row; `ConcernDetail` exported for testing. |
| `apps/web/src/components/concerns/ConcernsScreen.test.tsx` | **Create.** Component tests for prefill, edited time, journal rendering. |
| `apps/web/src/lib/doctorReport/journal.ts` | **Modify.** `ConcernLine.logs` entries carry `at_time`; ordered by date then time, ascending. |
| `apps/web/src/lib/doctorReport/journal.test.ts` | **Modify.** Ordering and pass-through tests. |
| `apps/web/src/lib/doctorReport/markdown.ts` | **Modify.** Prints `date HH:MM` when a time is present. |
| `apps/web/src/lib/doctorReport/markdown.test.ts` | **Modify.** Asserts the printed line shapes. |
| `apps/web/src/lib/exportData.ts` | **Modify.** `concern_logs` select list gains `at_time`. |
| `apps/web/src/lib/demoSeed.ts` | **Modify.** `SeedConcernLog.at_time`; demo logs get times, some without. |

---

### Task 1: Column, generated types, and the `at_time` field on `ConcernLog`

Nothing observable changes yet — this task makes the field exist end to end so
later tasks can use it.

**Files:**
- Create: `supabase/migrations/20260817120000_concern_log_time.sql`
- Modify: `packages/shared/src/database.types.ts:394-424` (the `concern_logs` block)
- Modify: `apps/web/src/lib/concerns.ts:20-28` (the `ConcernLog` interface)
- Modify: `apps/web/src/lib/exportData.ts:26`
- Modify: `apps/web/src/lib/demoSeed.ts:102-111` (`SeedConcernLog`)

**Interfaces:**
- Consumes: nothing.
- Produces: `ConcernLog.at_time: string | null` — a Postgres `time` value,
  i.e. the string `"12:00:00"` (or `"12:00"` when the browser sent it that
  way), or `null`. Every later task depends on this field name and type.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260817120000_concern_log_time.sql`:

```sql
-- Time of day for a concern observation.
--
-- The row already carries `date` as the user's local day, so a bare `time`
-- keeps 12:00 reading as 12:00 in the journal, the report and the export no
-- matter where the app is opened — no timezone arithmetic is introduced.
-- NULL means the time is unknown: every row written before this column
-- existed, and `created_at` is deliberately not used as a substitute because
-- it records when the row was inserted, not when the event happened.
alter table concern_logs add column if not exists at_time time;
```

- [ ] **Step 2: Add the column to the generated types**

In `packages/shared/src/database.types.ts`, inside `concern_logs`, add
`at_time` in alphabetical position — the generator sorts keys, and CI's
`gen:types:check` compares the file byte-for-byte against a fresh generation.
Alphabetically `at_time` sorts **before** `concern_id`, so it becomes the first
key of each of `Row`, `Insert` and `Update` — `Row` gets
`at_time: string | null`, the other two get `at_time?: string | null`:

```ts
        Row: {
          at_time: string | null
          concern_id: string
          created_at: string | null
          date: string
          id: string
          note: string | null
          photo_path: string | null
          severity: number | null
          user_id: string
        }
        Insert: {
          at_time?: string | null
          concern_id: string
          created_at?: string | null
          date?: string
          id?: string
          note?: string | null
          photo_path?: string | null
          severity?: number | null
          user_id: string
        }
        Update: {
          at_time?: string | null
          concern_id?: string
          created_at?: string | null
          date?: string
          id?: string
          note?: string | null
          photo_path?: string | null
          severity?: number | null
          user_id?: string
        }
```

- [ ] **Step 3: Add the field to `ConcernLog`**

In `apps/web/src/lib/concerns.ts`, the interface becomes:

```ts
export interface ConcernLog {
  id: string
  concern_id: string
  date: string
  /** Local wall-clock time of the event, `HH:MM[:SS]`; null when unknown. */
  at_time: string | null
  severity: number | null
  note: string | null
  photo_path: string | null
  created_at: string
}
```

- [ ] **Step 4: Add the column to the export and the demo seed type**

`apps/web/src/lib/exportData.ts` line 26 becomes:

```ts
    supabase.from('concern_logs').select('concern_id, date, at_time, severity, note').eq('user_id', userId),
```

`apps/web/src/lib/demoSeed.ts`, `SeedConcernLog`:

```ts
export interface SeedConcernLog {
  id: string
  user_id: string
  concern_id: string
  date: string
  at_time: string | null
  severity: number | null
  note: string | null
  photo_path: string | null
  created_at: string
}
```

This makes `makeConcernLogs()` fail to compile until Task 6 — so add
`at_time: null` to both `out.push({ … })` calls in `makeConcernLogs()`
(`demoSeed.ts:428-432` and `:435-440`) now; Task 6 replaces those values with
real times.

- [ ] **Step 5: Verify the tree compiles and existing tests still pass**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm run build && npm test && npm run lint
```

Expected: build succeeds, all tests pass, lint clean. Existing test helpers
that build `ConcernLog` objects with `as ConcernLog` (e.g.
`doctorReport/journal.test.ts:11`) keep compiling because of the cast — do not
"fix" them in this task.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260817120000_concern_log_time.sql packages/shared/src/database.types.ts apps/web/src/lib/concerns.ts apps/web/src/lib/exportData.ts apps/web/src/lib/demoSeed.ts
git commit -m "feat(concerns): store a time of day on an observation"
```

**Note for the human, not a step:** the migration still has to reach the
database with `npx supabase db push`, and `npm run gen:types` should be run
afterwards to confirm the hand-edited types match the generator exactly. Report
this in the final summary; do not attempt `db push` from the agent.

---

### Task 2: Shared helpers — `formatLogTime` and `compareLogsAsc`

**Files:**
- Modify: `apps/web/src/lib/concerns.ts` (add two exported functions after the interfaces, above `CATEGORIES`)
- Create: `apps/web/src/lib/concerns.test.ts`

**Interfaces:**
- Consumes: `ConcernLog.at_time` from Task 1.
- Produces, both used by Tasks 3, 4 and 5:
  - `formatLogTime(at: string | null | undefined): string` — `"12:00:00"` →
    `"12:00"`, `"12:00"` → `"12:00"`, `null`/`undefined`/`""` → `""`.
  - `compareLogsAsc(a: TimedLog, b: TimedLog): number` — orders by `date`
    ascending, then by `at_time` ascending, with a missing time sorting
    **after** all timed entries of the same date.
  - `export interface TimedLog { date: string; at_time?: string | null }` —
    the structural minimum `compareLogsAsc` needs, so both `ConcernLog` and the
    doctor report's own log shape can be passed in.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/concerns.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatLogTime, compareLogsAsc } from './concerns'

describe('formatLogTime', () => {
  it('trims the seconds Postgres sends back', () => {
    expect(formatLogTime('12:00:00')).toBe('12:00')
    expect(formatLogTime('09:44:31')).toBe('09:44')
  })

  it('passes an HH:MM value through unchanged', () => {
    expect(formatLogTime('12:00')).toBe('12:00')
  })

  it('renders nothing when the time is unknown', () => {
    expect(formatLogTime(null)).toBe('')
    expect(formatLogTime(undefined)).toBe('')
    expect(formatLogTime('')).toBe('')
  })
})

describe('compareLogsAsc', () => {
  it('orders by date first', () => {
    const logs = [
      { date: '2026-08-16', at_time: '08:00' },
      { date: '2026-08-13', at_time: '23:00' },
    ]
    expect([...logs].sort(compareLogsAsc).map(l => l.date))
      .toEqual(['2026-08-13', '2026-08-16'])
  })

  it('orders entries of one date by time', () => {
    const logs = [
      { date: '2026-08-16', at_time: '13:00' },
      { date: '2026-08-16', at_time: '12:00' },
      { date: '2026-08-16', at_time: '09:05' },
    ]
    expect([...logs].sort(compareLogsAsc).map(l => l.at_time))
      .toEqual(['09:05', '12:00', '13:00'])
  })

  // A legacy row has no time; putting it first would claim it happened before
  // the timed entries, which nothing in the data supports.
  it('puts an entry without a time after the timed entries of its date', () => {
    const logs = [
      { date: '2026-08-16', at_time: null },
      { date: '2026-08-16', at_time: '12:00' },
    ]
    expect([...logs].sort(compareLogsAsc).map(l => l.at_time))
      .toEqual(['12:00', null])
  })

  it('compares times of different precision consistently', () => {
    const logs = [
      { date: '2026-08-16', at_time: '13:00:00' },
      { date: '2026-08-16', at_time: '09:30' },
    ]
    expect([...logs].sort(compareLogsAsc).map(l => formatLogTime(l.at_time)))
      .toEqual(['09:30', '13:00'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run apps/web/src/lib/concerns.test.ts
```

Expected: FAIL — `formatLogTime` and `compareLogsAsc` are not exported from
`./concerns`.

- [ ] **Step 3: Implement the helpers**

In `apps/web/src/lib/concerns.ts`, after the interface declarations and before
`export const CATEGORIES`:

```ts
/** The structural minimum needed to order observations. */
export interface TimedLog {
  date: string
  at_time?: string | null
}

/**
 * A Postgres `time` arrives as `HH:MM:SS`; the interface and the doctor report
 * both show `HH:MM`. An unknown time renders as nothing at all rather than a
 * placeholder, so a legacy row looks exactly as it did before the column
 * existed.
 */
export function formatLogTime(at: string | null | undefined): string {
  return at ? at.slice(0, 5) : ''
}

/**
 * Orders observations oldest first: by date, then by time. An entry without a
 * time sorts after the timed entries of the same date — its position within
 * the day is unknown, and claiming it came first would be an invention.
 */
export function compareLogsAsc(a: TimedLog, b: TimedLog): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date)
  const at = formatLogTime(a.at_time)
  const bt = formatLogTime(b.at_time)
  if (!at && !bt) return 0
  if (!at) return 1
  if (!bt) return -1
  return at.localeCompare(bt)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run apps/web/src/lib/concerns.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Sort loaded observations by date then time**

`loadLogs` currently orders by date only, so two entries of one day come back
in whatever order Postgres returns. Both branches of
`apps/web/src/lib/concerns.ts:92-101` become:

```ts
export async function loadLogs(concernId: string): Promise<ConcernLog[]> {
  if (isDemoActive()) {
    return (demoList('concern_logs') as ConcernLog[])
      .filter(l => l.concern_id === concernId)
      .sort(compareLogsAsc)
  }
  const { data } = await supabase.from('concern_logs').select('*')
    .eq('concern_id', concernId)
    .order('date', { ascending: true })
    .order('at_time', { ascending: true, nullsFirst: false })
  return (data ?? []) as ConcernLog[]
}
```

Apply the same second `.order(…)` to `loadAllConcernLogs` in
`apps/web/src/lib/doctorReport/load.ts:38-44`, and sort the demo branch there
with `compareLogsAsc` (import it from `../concerns`):

```ts
export async function loadAllConcernLogs(userId: string, since: string): Promise<ConcernLog[]> {
  if (isDemoActive()) {
    return (demoList('concern_logs') as ConcernLog[])
      .filter(l => l.date >= since)
      .sort(compareLogsAsc)
  }
  return await fetchAllPages<ConcernLog>((from, to) => supabase
    .from('concern_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', since)
    .order('date')
    .order('at_time', { ascending: true, nullsFirst: false })
    .range(from, to))
}
```

- [ ] **Step 6: Run the full suite and lint**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test && npm run lint
```

Expected: all pass, lint clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/concerns.ts apps/web/src/lib/concerns.test.ts apps/web/src/lib/doctorReport/load.ts
git commit -m "feat(concerns): order observations by time and format it as HH:MM"
```

---

### Task 3: The doctor report model carries the time

**Files:**
- Modify: `apps/web/src/lib/doctorReport/journal.ts:5-52` (`ConcernLine`, `buildConcerns`)
- Modify: `apps/web/src/lib/doctorReport/journal.test.ts`

**Interfaces:**
- Consumes: `compareLogsAsc` from Task 2, `ConcernLog.at_time` from Task 1.
- Produces: `ConcernLine.logs` entries become
  `{ date: string; at_time: string | null; severity: number | null; note: string }`
  — Task 4 renders exactly this shape.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/lib/doctorReport/journal.test.ts`, first extend the `clog`
helper so a time can be given (keep the existing signature working — the other
tests call it with four arguments or fewer):

```ts
const clog = (
  concern_id: string,
  date: string,
  severity: number | null,
  note: string | null = null,
  at_time: string | null = null,
): ConcernLog =>
  ({ id: `${concern_id}-${date}-${at_time ?? ''}`, concern_id, date, at_time, severity, note, photo_path: null, created_at: date } as ConcernLog)
```

Then add these tests inside the existing `describe('buildConcerns', …)`:

```ts
  it('orders entries of one day by time, oldest first', () => {
    const logs = [
      clog('c', '2026-06-01', 3, 'вечером', '19:30'),
      clog('c', '2026-06-01', 3, 'утром', '08:05'),
      clog('c', '2026-06-01', 3, 'в обед', '13:00'),
    ]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].logs.map(l => l.note)).toEqual(['утром', 'в обед', 'вечером'])
  })

  it('carries the time of each entry through to the report model', () => {
    const logs = [clog('c', '2026-06-01', 3, 'запись', '12:00:00')]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].logs[0].at_time).toBe('12:00:00')
  })

  // Rows stored before the time column existed keep working, and they are not
  // reordered ahead of entries whose time is known.
  it('places an entry without a time after the timed entries of its day', () => {
    const logs = [
      clog('c', '2026-06-01', 3, 'без времени', null),
      clog('c', '2026-06-01', 3, 'в 12', '12:00'),
    ]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].logs.map(l => l.note)).toEqual(['в 12', 'без времени'])
    expect(out[0].logs[1].at_time).toBeNull()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run apps/web/src/lib/doctorReport/journal.test.ts
```

Expected: FAIL — `at_time` is not a property of the model's log entries, and
the same-day ordering assertion does not hold.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/doctorReport/journal.ts`, import the comparator:

```ts
import { compareLogsAsc, type HealthConcern, type ConcernLog } from '../concerns'
```

(keep it a type-only import for the two types — `import type { HealthConcern,
ConcernLog } from '../concerns'` on its own line plus a value import of
`compareLogsAsc` is equally fine; match whichever reads cleaner with the
surrounding imports.)

Widen the `ConcernLine.logs` declaration:

```ts
  /** Every noted entry of the period, oldest first. */
  logs: { date: string; at_time: string | null; severity: number | null; note: string }[]
```

Replace the date-only sort with the shared comparator, and pass the time
through:

```ts
    const own = logs
      .filter(l => l.concern_id === c.id && l.date >= periodStartDate)
      .sort(compareLogsAsc)
```

```ts
      logs: own
        .filter((l): l is ConcernLog & { note: string } => !!l.note)
        .map(l => ({ date: l.date, at_time: l.at_time ?? null, severity: l.severity, note: l.note })),
```

Leave the severity block and its comments untouched.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run apps/web/src/lib/doctorReport/
```

Expected: PASS — the new tests and every pre-existing doctorReport test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/doctorReport/journal.ts apps/web/src/lib/doctorReport/journal.test.ts
git commit -m "feat(report): carry the observation time into the report model"
```

---

### Task 4: The doctor report prints the time

**Files:**
- Modify: `apps/web/src/lib/doctorReport/markdown.ts:465-471`
- Modify: `apps/web/src/lib/doctorReport/markdown.test.ts`

**Interfaces:**
- Consumes: `ConcernLine.logs[].at_time` from Task 3, `formatLogTime` from Task 2.
- Produces: report lines of the form
  `  - 2026-08-16 12:00 (тяжесть 3/5): note` (timed) and
  `  - 2026-08-13 (тяжесть 3/5): note` (untimed).

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/doctorReport/markdown.test.ts` inside
`describe('toMarkdown', …)`. Build a model with concerns and logs by passing
them through `sources` — mirror the existing `sources` object and override the
two fields:

```ts
  it('prints the time of day next to the date of an observation', () => {
    const concern = {
      id: 'c', user_id: 'u', name: 'Стул', category: 'gut', status: 'active' as const,
      started_at: null, notes: null, is_private: false, created_at: '2026-07-01T00:00:00Z',
    }
    const log = (date: string, at_time: string | null, note: string) => ({
      id: `${date}-${at_time ?? ''}`, concern_id: 'c', date, at_time,
      severity: 3, note, photo_path: null, created_at: `${date}T00:00:00Z`,
    })
    const timedModel = buildReportModel({
      daily,
      sources: {
        ...sources,
        concerns: [concern],
        concernLogs: [
          log('2026-07-20', '12:00:00', 'кашеобразный'),
          log('2026-07-21', null, 'без времени'),
        ],
      },
      periodDays: 30,
      today,
    })

    const md = toMarkdown(timedModel, 'ru')
    expect(md).toContain('2026-07-20 12:00 (тяжесть 3/5): кашеобразный')
    expect(md).toContain('2026-07-21 (тяжесть 3/5): без времени')
    expect(md).not.toContain('12:00:00')
  })
```

If TypeScript objects to the shape of `concerns`/`concernLogs` in `sources`,
cast the two arrays to the types `buildReportModel` expects
(`HealthConcern[]` / `ConcernLog[]`, imported with `import type` from
`../concerns`) rather than loosening the model's types.

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run apps/web/src/lib/doctorReport/markdown.test.ts
```

Expected: FAIL — the line currently prints the date without the time, so the
first `toContain` misses.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/doctorReport/markdown.ts`, import the formatter
(`import { formatLogTime } from '../concerns'` — group it with the existing
imports at the top of the file) and change the per-entry loop at lines 465-471:

```ts
      if (c.logs.length) {
        p(`- ${t('Записи за период')}:`)
        for (const l of c.logs) {
          const sev = l.severity != null ? ` (${t('тяжесть')} ${l.severity}/5)` : ''
          // The time is part of the clinical picture for complaints like stool
          // or flare-ups. Entries stored before the time column existed print
          // the date alone.
          const at = formatLogTime(l.at_time)
          p(`  - ${l.date}${at ? ` ${at}` : ''}${sev}: ${l.note}`)
        }
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run apps/web/src/lib/doctorReport/
```

Expected: PASS, including the untouched Ukrainian/English report tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/doctorReport/markdown.ts apps/web/src/lib/doctorReport/markdown.test.ts
git commit -m "feat(report): print the time of day of an observation"
```

---

### Task 5: The screen records and shows the time

**Files:**
- Modify: `apps/web/src/components/concerns/ConcernsScreen.tsx:56-58` (export `ConcernDetail`), `:60-90` (state + `handleSave`), `:131-142` (form row), `:168-178` (journal row)
- Create: `apps/web/src/components/concerns/ConcernsScreen.test.tsx`

**Interfaces:**
- Consumes: `addLog` (`apps/web/src/lib/concerns.ts:103`, signature
  `addLog(userId: string, log: Omit<ConcernLog, 'id' | 'created_at'>)`),
  `formatLogTime` from Task 2.
- Produces: `export function ConcernDetail({ concern, userId, onBack, onUpdate })`
  — the component becomes a named export so the test can mount the detail view
  directly instead of driving the list screen.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/concerns/ConcernsScreen.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({
  loadLogs: vi.fn(),
  addLog: vi.fn(),
  deleteLog: vi.fn().mockResolvedValue(undefined),
  uploadConcernPhoto: vi.fn(),
  getPhotoUrl: vi.fn().mockResolvedValue(''),
  updateConcern: vi.fn().mockResolvedValue(undefined),
  CATEGORIES: { gut: '🫀 ЖКТ' },
  STATUS_LABELS: {
    active: { label: 'Активна', color: 'red' },
    improving: { label: 'Улучшается', color: 'orange' },
    resolved: { label: 'Решена', color: 'green' },
  },
  formatLogTime: (at: string | null | undefined) => (at ? at.slice(0, 5) : ''),
  compareLogsAsc: () => 0,
}))
vi.mock('../../lib/concerns', () => api)

import { ConcernDetail } from './ConcernsScreen'

const concern = {
  id: 'c1', user_id: 'u1', name: 'Стул', category: 'gut', status: 'active' as const,
  started_at: null, notes: null, is_private: false, created_at: '2026-08-01T00:00:00Z',
}

const log = (over: Record<string, unknown> = {}) => ({
  id: 'l1', concern_id: 'c1', date: '2026-08-16', at_time: '12:00:00',
  severity: 3, note: 'кашеобразный', photo_path: null, created_at: '2026-08-16T19:00:00Z',
  ...over,
})

const detail = () => (
  <ConcernDetail concern={concern} userId="u1" onBack={vi.fn()} onUpdate={vi.fn()} />
)

beforeEach(() => {
  localStorage.setItem('lang', 'en')
  api.loadLogs.mockResolvedValue([])
  api.addLog.mockResolvedValue(log())
})
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('ConcernDetail', () => {
  it('prefills the date and time of a new observation with now', async () => {
    vi.setSystemTime(new Date(2026, 7, 16, 14, 5))
    renderWithProviders(detail())

    const date = await screen.findByTestId('log-date')
    expect((date as HTMLInputElement).value).toBe('2026-08-16')
    expect((screen.getByTestId('log-time') as HTMLInputElement).value).toBe('14:05')
    vi.useRealTimers()
  })

  it('saves the time the user corrected it to', async () => {
    vi.setSystemTime(new Date(2026, 7, 16, 19, 0))
    renderWithProviders(detail())

    fireEvent.change(await screen.findByTestId('log-time'), { target: { value: '12:00' } })
    fireEvent.click(screen.getByRole('button', { name: /Add/i }))

    await waitFor(() => expect(api.addLog).toHaveBeenCalledWith('u1', expect.objectContaining({
      date: '2026-08-16', at_time: '12:00',
    })))
    vi.useRealTimers()
  })

  it('shows the time of an observation in the journal', async () => {
    api.loadLogs.mockResolvedValue([log()])
    renderWithProviders(detail())

    expect(await screen.findByText('12:00')).toBeTruthy()
    expect(screen.queryByText('12:00:00')).toBeNull()
  })

  it('shows the date alone for an observation without a time', async () => {
    api.loadLogs.mockResolvedValue([log({ at_time: null })])
    renderWithProviders(detail())

    expect(await screen.findByText('2026-08-16')).toBeTruthy()
    expect(screen.queryByTestId('log-item-time')).toBeNull()
  })
})
```

Note: `vi.setSystemTime` needs fake timers — add
`beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))` if
`setSystemTime` throws, and keep the `vi.useRealTimers()` calls.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run apps/web/src/components/concerns/ConcernsScreen.test.tsx
```

Expected: FAIL — `ConcernDetail` is not exported, and the `log-date` /
`log-time` inputs do not exist.

- [ ] **Step 3: Export the component and add the state**

`apps/web/src/components/concerns/ConcernsScreen.tsx:56` becomes
`export function ConcernDetail({ … })`.

Add two helpers above the component (they read the browser clock, so they live
in the component file rather than in `lib/concerns.ts`, which stays pure):

```tsx
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const localTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
```

`new Date().toISOString().slice(0, 10)` — the current expression at line 85 —
is a UTC date and is off by a day for a late-evening entry in Kyiv; `localDate`
replaces it.

Add state beside the existing `severity` / `note` state (line 62-63):

```tsx
  const [logDate, setLogDate] = useState(() => localDate(new Date()))
  const [logTime, setLogTime] = useState(() => localTime(new Date()))
```

- [ ] **Step 4: Save the chosen date and time**

`handleSave` (lines 80-90) becomes:

```tsx
  async function handleSave() {
    setSaving(true)
    let photo_path: string | null = null
    if (photoFile) photo_path = await uploadConcernPhoto(userId, photoFile)
    await addLog(userId, {
      concern_id: concern.id, date: logDate, at_time: logTime || null,
      severity, note: note.trim() || null, photo_path,
    })
    const now = new Date()
    setNote(''); setPhotoFile(null); setSeverity(3)
    setLogDate(localDate(now)); setLogTime(localTime(now))
    await reload()
    setSaving(false)
  }
```

- [ ] **Step 5: Add the two inputs to the form row**

At the end of the severity row (`ConcernsScreen.tsx:131-142`), after the
severity label `<span>`, before the closing `</div>`:

```tsx
          <input className="log-input" type="date" data-testid="log-date"
            value={logDate} onChange={e => setLogDate(e.target.value)}
            style={{ marginLeft: 'auto', width: 140, fontSize: 13 }} />
          <input className="log-input" type="time" data-testid="log-time"
            value={logTime} onChange={e => setLogTime(e.target.value)}
            style={{ width: 96, fontSize: 13 }} />
```

`marginLeft: 'auto'` pushes the pair to the right end of the row; the row is
already `display: flex` with `flexWrap: 'wrap'`, so on a narrow screen the two
inputs wrap onto their own line instead of squeezing the severity buttons.

- [ ] **Step 6: Show the time in the journal row**

Import `formatLogTime` from `../../lib/concerns` (add it to the existing import
list at line 5) and insert the time between the date and the severity in the
journal row (`ConcernsScreen.tsx:172-173`):

```tsx
              <span style={{ fontSize: 13, fontWeight: 600 }}>{l.date}</span>
              {formatLogTime(l.at_time) && (
                <span data-testid="log-item-time" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {formatLogTime(l.at_time)}
                </span>
              )}
              {l.severity && <span style={{ fontSize: 12, color: SEVERITY_COLOR[l.severity] }}>{l.severity}/5</span>}
```

The list itself needs no sort change: `loadLogs` now returns oldest-first by
date and time (Task 2), and the render already does `.reverse()` to show the
newest first.

`(showResolved ? logs : logs.slice(-5)).reverse()` mutates `logs` in place when
`showResolved` is true — pre-existing, out of scope, do not fix here.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run apps/web/src/components/concerns/ConcernsScreen.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 8: Run the whole suite, the build and lint**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test && npm run build && npm run lint
```

Expected: all pass, lint clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/concerns/ConcernsScreen.tsx apps/web/src/components/concerns/ConcernsScreen.test.tsx
git commit -m "feat(concerns): record and show the time of an observation"
```

---

### Task 6: Demo fixtures show both states

**Files:**
- Modify: `apps/web/src/lib/demoSeed.ts:423-443` (`makeConcernLogs`)

**Interfaces:**
- Consumes: `SeedConcernLog.at_time` from Task 1.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Give the demo logs times**

The hair concern's entries get a time; the head concern's entries stay
untimed, so the demo shows the legacy state as well. Replace the two
`out.push({ … })` calls in `makeConcernLogs()` with:

```ts
  for (let i = 56; i >= 0; i -= 7) {
    out.push({
      id: `demo-clog-${n++}`, user_id: DEMO_USER, concern_id: 'demo-concern-hair',
      date: dateStr(i), at_time: '09:15', severity: Math.max(1, Math.round(4 - (56 - i) / 20)),
      note: null, photo_path: null, created_at: at(i, 20),
    })
  }
  // The head-ache entries stay without a time: the demo has to show how an
  // observation stored before the time column existed still reads.
  for (let i = 28; i >= 0; i -= 4) {
    out.push({
      id: `demo-clog-${n++}`, user_id: DEMO_USER, concern_id: 'demo-concern-head',
      date: dateStr(i), at_time: null, severity: 1 + Math.round(rnd(i * 3) * 3),
      note: rnd(i * 5) > 0.7 ? 'После короткого сна' : null,
      photo_path: null, created_at: at(i, 21),
    })
  }
```

- [ ] **Step 2: Run the suite**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test && npm run lint
```

Expected: PASS — in particular the demo-translation guard that walks
`demoSeedStrings()` (`demoSeed.ts:563`), which is unaffected because no new
strings were added.

- [ ] **Step 3: Check it in the browser**

Start the dev server in demo mode and look at a concern's detail view: the
"Волосы" concern's entries show `09:15` beside the date, the head-ache entries
show the date alone, and the new-observation form is prefilled with today and
the current time.

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm run dev
```

`.env.local` must contain `VITE_DEMO=1` plus the dummy Supabase keys (see
`CLAUDE.md`); the project skill `running-tonus` has the full recipe. Take a
screenshot of the detail view for the summary.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/demoSeed.ts
git commit -m "feat(demo): give some concern observations a time of day"
```

---

## Verification before opening the PR

- [ ] `npm test` — full suite green (node + jsdom projects).
- [ ] `npm run build` — `tsc -b && vite build` clean.
- [ ] `npm run lint` — zero errors and zero warnings.
- [ ] `npm run check:functions` — unchanged by this work, but run it (needs
      `export PATH="$HOME/.deno/bin:$PATH"`).
- [ ] Screenshot of the concern detail view in demo mode attached to the PR.

## Left to the human (state this explicitly in the final summary)

- `npx supabase db push` — the `at_time` column has to reach the database
  before the deployed frontend writes to it. Until then, saving an observation
  in production fails.
- `npm run gen:types` after the push, to confirm the hand-edited
  `packages/shared/src/database.types.ts` matches the generator byte-for-byte.
  CI's `gen:types:check` compares them and fails on any drift.
- No edge function needs redeploying. `supabase/functions/_shared/healthContext.ts:177-179`
  does read `concern_logs`, but it selects named columns, so the new column
  neither breaks it nor reaches it — the AI chat will not see the time of day.
  Whether it should is a separate decision, deliberately left out of this spec.
