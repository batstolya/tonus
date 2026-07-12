# Chat Sleep Duration Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the health chat display sleep durations as Ukrainian hours and minutes instead of decimal hours.

**Architecture:** Keep raw numeric hour fields in `get_sleep_range` for analysis and add deterministic server-generated display strings for user-facing answers. A pure shared formatter owns rounding and omission rules; the chat tool decorates both nightly rows and server-computed averages and instructs Gemini to use those display values.

**Tech Stack:** TypeScript, Supabase Edge Functions, Vitest

## Global Constraints

- Apply the format to total, deep, REM, and core sleep durations.
- Round to the nearest whole minute.
- Preserve all existing numeric values.
- Do not change the sleep UI or unrelated metrics.

---

### Task 1: Add deterministic duration display values to `get_sleep_range`

**Files:**
- Modify: `supabase/functions/_shared/chatTools.ts`
- Test: `supabase/functions/_shared/chatTools.test.ts`

**Interfaces:**
- Consumes: decimal-hour values from `sleep_sessions` and `numericAverages()`.
- Produces: `formatHoursDuration(hours: number | null | undefined): string | null`, row properties named `<field>_display`, and average objects `{ avg, n, display }` for sleep durations.

- [x] **Step 1: Write failing formatter tests**

Import `formatHoursDuration` and add:

```ts
describe('formatHoursDuration', () => {
  it.each([
    [1.67, '1 год 40 хв'],
    [1.03, '1 год 2 хв'],
    [0.8, '48 хв'],
    [2, '2 год'],
    [1.999, '2 год'],
    [0, '0 хв'],
  ])('formats %s hours as %s', (hours, expected) => {
    expect(formatHoursDuration(hours)).toBe(expected)
  })

  it('returns null for missing or invalid values', () => {
    expect(formatHoursDuration(null)).toBeNull()
    expect(formatHoursDuration(undefined)).toBeNull()
    expect(formatHoursDuration(Number.NaN)).toBeNull()
  })
})
```

- [x] **Step 2: Write a failing integration assertion for the sleep tool**

In the existing server-computed sleep averages test, assert:

```ts
const rows = result.rows as Array<Record<string, unknown>>
expect(rows[0].deep_hours).toBe(1.67)
expect(rows[0].deep_hours_display).toBe('1 год 40 хв')
expect(summary.averages.deep_hours).toEqual({ avg: 1.567, n: 3, display: '1 год 34 хв' })
```

- [x] **Step 3: Run the target test and verify RED**

Run: `npm test -- supabase/functions/_shared/chatTools.test.ts`

Expected: FAIL because `formatHoursDuration` and display properties do not exist.

- [x] **Step 4: Add the pure formatter**

Add to `chatTools.ts`:

```ts
export function formatHoursDuration(hours: number | null | undefined): string | null {
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) return null
  const totalMinutes = Math.round(hours * 60)
  const wholeHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!wholeHours) return `${minutes} хв`
  if (!minutes) return `${wholeHours} год`
  return `${wholeHours} год ${minutes} хв`
}
```

- [x] **Step 5: Decorate sleep rows and averages without replacing numbers**

Use the four fields below and return display siblings:

```ts
const sleepDurationKeys = ['duration_hours', 'deep_hours', 'rem_hours', 'core_hours'] as const

const rows = (data ?? []).map((r) => {
  const row = r as Record<string, unknown> & { bedtime?: string; wake_time?: string; duration_hours?: number }
  const displays = Object.fromEntries(sleepDurationKeys.flatMap((key) => {
    const display = formatHoursDuration(row[key] as number | null | undefined)
    return display === null ? [] : [[`${key}_display`, display]]
  }))
  return {
    ...row,
    ...displays,
    bedtime: toLocalDateTime(row.bedtime, tz),
    wake_time: toLocalDateTime(effectiveWakeIso(row.bedtime, row.wake_time, row.duration_hours), tz),
  }
})

const averages = numericAverages(data ?? [], [...sleepDurationKeys])
for (const value of Object.values(averages)) {
  Object.assign(value, { display: formatHoursDuration(value.avg) })
}
```

Update the `get_sleep_range` declaration to say that user-facing answers must use `*_display` and `summary.averages.*.display`, while raw hour numbers are for analysis only.

- [x] **Step 6: Run the target and full suites and verify GREEN**

Run: `npm test -- supabase/functions/_shared/chatTools.test.ts`

Expected: the target file passes.

Run: `npm test`

Expected: all tests pass with no new failures.

- [ ] **Step 7: Commit the implementation**

```bash
git add supabase/functions/_shared/chatTools.ts supabase/functions/_shared/chatTools.test.ts docs/superpowers/plans/2026-07-12-chat-sleep-duration-format.md
git commit -m "fix(chat): format sleep durations as hours and minutes"
```
