# Gamified Home — Streak, Activity Calendar, Empty States — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gamified block to the Tonus home dashboard — a streak widget, an activity calendar, and reusable empty/locked states — porting the high-value patterns from mate.academy/home.

**Architecture:** Pure client-side derivation. Streak and freeze state are a pure function of the already-loaded `daily: DailyMetrics[]` timeline (no DB, no edge functions). Presentation is three focused components wired into `Dashboard.tsx`. All strings go through `useT()`; the streak engine is unit-tested.

**Tech Stack:** React 19, TypeScript, Vite, Motion (`motion/react`), Vitest (node env), existing i18n (`src/lib/i18n.tsx` + `src/lib/translations.ts`).

**Prerequisites (every command):** Node 24. Run once per shell:
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
```

**Spec:** `docs/superpowers/specs/2026-07-09-gamified-home-streak-design.md`

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `src/lib/streak.ts` | new | Pure streak/freeze engine + named constants |
| `src/lib/streak.test.ts` | new | Unit tests for the engine |
| `src/components/ui/EmptyState.tsx` | new | Reusable empty/locked card (icon + title + text + optional CTA) |
| `src/components/ui/EmptyState.test.ts` | new | Export + translation-coverage test |
| `src/components/dashboard/StreakWidget.tsx` | new | Day / Freeze / Week widget (uses `computeStreak` + `CountUp`) |
| `src/components/dashboard/StreakWidget.test.ts` | new | Export + translation-coverage test |
| `src/components/dashboard/ActivityCalendar.tsx` | new | Current-month activity grid (CSS grid, no recharts) |
| `src/components/dashboard/ActivityCalendar.test.ts` | new | Export + translation-coverage test |
| `src/components/dashboard/Dashboard.tsx` | modify | Insert streak block; friendly empty state when no history |
| `src/lib/translations.ts` | modify | uk/en keys for the new UI |
| `src/index.css` | modify | Styles for the new widgets |

---

## Task 1: Streak engine (`src/lib/streak.ts`)

**Files:**
- Create: `src/lib/streak.ts`
- Test: `src/lib/streak.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/streak.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeStreak, FREEZE_EARN_EVERY, MAX_FREEZES, WEEKLY_MIN_DAYS } from './streak'
import type { DailyMetrics } from '../types'

// Build a DailyMetrics with `steps` so the day counts as "active".
function day(date: string): DailyMetrics {
  return { date, steps: 5000 }
}
// A day present in the array but with no core metric → NOT active.
function emptyDay(date: string): DailyMetrics {
  return { date }
}
// Generate N consecutive active days ending on `end` (inclusive), oldest first.
function run(end: string, n: number): DailyMetrics[] {
  const out: DailyMetrics[] = []
  const base = new Date(end + 'T12:00:00')
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    out.push(day(d.toISOString().slice(0, 10)))
  }
  return out
}

const TODAY = new Date('2026-07-09T12:00:00') // Thursday

describe('computeStreak', () => {
  it('returns all-zero for empty input', () => {
    const s = computeStreak([], TODAY)
    expect(s).toEqual({ current: 0, freezesAvailable: 0, freezesSpent: 0, weekly: 0, todayPending: false, frozenDates: [] })
  })

  it('counts consecutive active days ending today', () => {
    const s = computeStreak(run('2026-07-09', 3), TODAY)
    expect(s.current).toBe(3)
    expect(s.todayPending).toBe(false)
  })

  it('keeps streak alive and flags todayPending when today has no data yet', () => {
    const s = computeStreak(run('2026-07-08', 3), TODAY) // last active day = yesterday
    expect(s.current).toBe(3)
    expect(s.todayPending).toBe(true)
  })

  it('a day present but with no core metric does not count as active', () => {
    const daily = [...run('2026-07-08', 2), emptyDay('2026-07-09')]
    const s = computeStreak(daily, TODAY)
    expect(s.current).toBe(2)
    expect(s.todayPending).toBe(true)
  })

  it('earns one freeze per 7 streak days, capped at MAX_FREEZES', () => {
    const s = computeStreak(run('2026-07-09', 21), TODAY)
    expect(FREEZE_EARN_EVERY).toBe(7)
    expect(s.freezesAvailable).toBe(Math.min(MAX_FREEZES, 3))
  })

  it('spends a freeze to bridge a one-day gap', () => {
    // active: 8 days ending 2026-07-07, gap on 07-08, then... today pending.
    // 8-day run earns 1 freeze which bridges the 07-08 gap.
    const daily = run('2026-07-07', 8)
    const s = computeStreak(daily, TODAY)
    expect(s.current).toBe(8)
    expect(s.freezesSpent).toBe(1)
    expect(s.frozenDates).toContain('2026-07-08')
  })

  it('breaks when a gap cannot be bridged (no freeze earned yet)', () => {
    // 2-day run then a gap — only 2 days, no freeze earned → streak = the recent side only.
    const daily = [day('2026-07-05'), day('2026-07-08'), day('2026-07-09')]
    const s = computeStreak(daily, TODAY)
    expect(s.current).toBe(2) // 07-08, 07-09; 07-06/07-07 gap, no freeze
    expect(s.freezesSpent).toBe(0)
  })

  it('counts consecutive weeks with enough active days', () => {
    const s = computeStreak(run('2026-07-09', 14), TODAY)
    expect(WEEKLY_MIN_DAYS).toBe(5)
    expect(s.weekly).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test -- src/lib/streak.test.ts
```
Expected: FAIL — cannot resolve `./streak` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/streak.ts`:

```ts
import type { DailyMetrics } from '../types'

// Named tuning constants (single source of truth — client-only mechanic).
export const FREEZE_EARN_EVERY = 7 // 1 freeze earned per this many streak days
export const MAX_FREEZES = 3        // cap on stored freezes
export const WEEKLY_MIN_DAYS = 5    // active days needed for a week to "count"

// Core metrics: a day is "active" if any of these is present.
const CORE_KEYS: (keyof DailyMetrics)[] = ['steps', 'sleepHours', 'restingHeartRate', 'hrv']

export interface StreakState {
  current: number          // consecutive active days
  freezesAvailable: number // 0..MAX_FREEZES
  freezesSpent: number     // spent bridging gaps in the current window
  weekly: number           // consecutive weeks with >= WEEKLY_MIN_DAYS active days
  todayPending: boolean    // today has no data yet, but the streak is alive
  frozenDates: string[]    // dates bridged by a freeze (for the calendar)
}

function isActive(d: DailyMetrics): boolean {
  return CORE_KEYS.some(k => d[k] != null)
}

// Local-time YYYY-MM-DD (matches how DailyMetrics.date is stored).
function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function addDays(date: Date, n: number): Date {
  const c = new Date(date)
  c.setDate(c.getDate() + n)
  return c
}

// Monday of the week containing `date` (Mon=start).
function startOfWeek(date: Date): Date {
  const c = new Date(date)
  const day = (c.getDay() + 6) % 7 // Mon=0 … Sun=6
  return addDays(c, -day)
}

function computeWeekly(active: Set<string>, today: Date): number {
  let weeks = 0
  let monday = startOfWeek(today)
  while (true) {
    let count = 0
    for (let i = 0; i < 7; i++) if (active.has(ymd(addDays(monday, i)))) count++
    if (count >= WEEKLY_MIN_DAYS) { weeks++; monday = addDays(monday, -7) } else break
  }
  return weeks
}

export function computeStreak(daily: DailyMetrics[], today: Date = new Date()): StreakState {
  const empty: StreakState = {
    current: 0, freezesAvailable: 0, freezesSpent: 0, weekly: 0, todayPending: false, frozenDates: [],
  }
  const active = new Set<string>()
  for (const d of daily) if (isActive(d)) active.add(d.date)
  if (active.size === 0) return empty

  const todayStr = ymd(today)
  const todayActive = active.has(todayStr)
  // Grace: if today has no data yet, start the walk at yesterday.
  let cursor = todayActive ? new Date(today) : addDays(today, -1)

  let current = 0
  let freezesSpent = 0
  const frozenDates: string[] = []
  const earned = () => Math.min(MAX_FREEZES, Math.floor(current / FREEZE_EARN_EVERY))

  while (true) {
    const cur = ymd(cursor)
    if (active.has(cur)) {
      current++
      cursor = addDays(cursor, -1)
    } else if (earned() - freezesSpent > 0) {
      freezesSpent++
      frozenDates.push(cur)
      cursor = addDays(cursor, -1)
    } else {
      break
    }
  }

  const freezesAvailable = Math.max(0, earned() - freezesSpent)
  const weekly = computeWeekly(active, today)
  return {
    current,
    freezesAvailable,
    freezesSpent,
    weekly,
    todayPending: !todayActive && current > 0,
    frozenDates,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test -- src/lib/streak.test.ts
```
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/streak.ts src/lib/streak.test.ts
git commit -m "feat(streak): pure client-side streak/freeze engine"
```

---

## Task 2: Translation keys (`src/lib/translations.ts`)

All new UI strings must exist as uk/en keys (the Russian source is the key). Add these once, up front, so component tests in later tasks pass.

**Files:**
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Add the keys**

Add this block near the end of the `translations` object (before its closing `}`):

```ts
  // ── Серия (геймифицированный home) ─────────────────────────
  'Серия': { uk: 'Серія', en: 'Streak' },
  'Дней подряд': { uk: 'Днів поспіль', en: 'Day streak' },
  'Заморозки': { uk: 'Заморозки', en: 'Freezes' },
  'Недель подряд': { uk: 'Тижнів поспіль', en: 'Week streak' },
  'Синхронизация ожидается': { uk: 'Синхронізація очікується', en: 'Sync pending' },
  'Активность': { uk: 'Активність', en: 'Activity' },
  'данные есть': { uk: 'дані є', en: 'has data' },
  'пропуск': { uk: 'пропуск', en: 'missed' },
  'заморожено': { uk: 'заморожено', en: 'frozen' },
  'Подключи Apple Health, чтобы начать серию': {
    uk: 'Підключи Apple Health, щоб почати серію',
    en: 'Connect Apple Health to start your streak',
  },
  'Настроить синхронизацию': { uk: 'Налаштувати синхронізацію', en: 'Set up sync' },
```

Note: `'Активность'` may already exist in the navigation block. If `npm run build` later reports a duplicate key, delete this second `'Активность'` line (keep the existing one).

- [ ] **Step 2: Commit**

```bash
git add src/lib/translations.ts
git commit -m "i18n(streak): uk/en keys for gamified home"
```

---

## Task 3: EmptyState component (`src/components/ui/EmptyState.tsx`)

**Files:**
- Create: `src/components/ui/EmptyState.tsx`
- Test: `src/components/ui/EmptyState.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/EmptyState.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('exports a component', () => {
    expect(typeof EmptyState).toBe('function')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test -- src/components/ui/EmptyState.test.ts
```
Expected: FAIL — cannot resolve `./EmptyState`.

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/EmptyState.tsx`:

```tsx
import type { ReactNode } from 'react'
import { motion } from 'motion/react'

interface Props {
  icon: ReactNode        // emoji or small element
  title: string          // already-translated string
  text?: string          // already-translated string
  cta?: { label: string; onClick: () => void }
}

// Reusable friendly empty / locked state. Callers pass already-translated text.
export function EmptyState({ icon, title, text, cta }: Props) {
  return (
    <motion.div className="empty-state" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}>
      <div className="empty-state-icon" aria-hidden>{icon}</div>
      <div className="empty-state-title">{title}</div>
      {text && <p className="empty-state-text">{text}</p>}
      {cta && (
        <button className="empty-state-cta" onClick={cta.onClick}>{cta.label}</button>
      )}
    </motion.div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test -- src/components/ui/EmptyState.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/EmptyState.tsx src/components/ui/EmptyState.test.ts
git commit -m "feat(ui): reusable EmptyState card"
```

---

## Task 4: StreakWidget (`src/components/dashboard/StreakWidget.tsx`)

**Files:**
- Create: `src/components/dashboard/StreakWidget.tsx`
- Test: `src/components/dashboard/StreakWidget.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/dashboard/StreakWidget.test.ts` (export + translation coverage, per the `TelegramDemo.test.ts` pattern):

```ts
import { describe, it, expect } from 'vitest'
import { StreakWidget } from './StreakWidget'
import { translations } from '../../lib/translations'

const KEYS = [
  'Серия',
  'Дней подряд',
  'Заморозки',
  'Недель подряд',
  'Синхронизация ожидается',
]

describe('StreakWidget', () => {
  it('exports a component', () => {
    expect(typeof StreakWidget).toBe('function')
  })
  it('all user-facing keys are translated (uk + en)', () => {
    for (const k of KEYS) {
      expect(translations[k], `missing translation: ${k}`).toBeTruthy()
      expect(translations[k].uk).toBeTruthy()
      expect(translations[k].en).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test -- src/components/dashboard/StreakWidget.test.ts
```
Expected: FAIL — cannot resolve `./StreakWidget`.

- [ ] **Step 3: Write the implementation**

Create `src/components/dashboard/StreakWidget.tsx`:

```tsx
import { motion } from 'motion/react'
import type { DailyMetrics } from '../../types'
import { computeStreak } from '../../lib/streak'
import { CountUp } from '../common/CountUp'
import { useT } from '../../lib/i18n'

interface Props {
  daily: DailyMetrics[]
}

// mate-style streak block: Day / Freeze / Week + fire icon. Derives everything
// from the daily timeline via computeStreak (no persisted state).
export function StreakWidget({ daily }: Props) {
  const { t } = useT()
  const s = computeStreak(daily)

  const items = [
    { emoji: '🔥', value: s.current, label: t('Дней подряд') },
    { emoji: '❄️', value: s.freezesAvailable, label: t('Заморозки') },
    { emoji: '⚡', value: s.weekly, label: t('Недель подряд') },
  ]

  return (
    <div className="streak-widget">
      <div className="streak-widget-head">
        <span className="streak-widget-title">{t('Серия')}</span>
        {s.todayPending && (
          <span className="streak-widget-pending">{t('Синхронизация ожидается')}</span>
        )}
      </div>
      <div className="streak-widget-row">
        {items.map(it => (
          <div key={it.label} className="streak-metric">
            <motion.span className="streak-metric-emoji" aria-hidden
              animate={it.emoji === '🔥' && s.current > 0 ? { scale: [1, 1.18, 1] } : undefined}
              transition={{ duration: 0.5, ease: 'easeOut' }}>
              {it.emoji}
            </motion.span>
            <span className="streak-metric-value"><CountUp value={it.value} /></span>
            <span className="streak-metric-label">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test -- src/components/dashboard/StreakWidget.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/StreakWidget.tsx src/components/dashboard/StreakWidget.test.ts
git commit -m "feat(dashboard): StreakWidget (day/freeze/week)"
```

---

## Task 5: ActivityCalendar (`src/components/dashboard/ActivityCalendar.tsx`)

**Files:**
- Create: `src/components/dashboard/ActivityCalendar.tsx`
- Test: `src/components/dashboard/ActivityCalendar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/dashboard/ActivityCalendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ActivityCalendar } from './ActivityCalendar'
import { translations } from '../../lib/translations'

const KEYS = ['Активность', 'данные есть', 'пропуск', 'заморожено']

describe('ActivityCalendar', () => {
  it('exports a component', () => {
    expect(typeof ActivityCalendar).toBe('function')
  })
  it('all user-facing keys are translated (uk + en)', () => {
    for (const k of KEYS) {
      expect(translations[k], `missing translation: ${k}`).toBeTruthy()
      expect(translations[k].uk).toBeTruthy()
      expect(translations[k].en).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test -- src/components/dashboard/ActivityCalendar.test.ts
```
Expected: FAIL — cannot resolve `./ActivityCalendar`.

- [ ] **Step 3: Write the implementation**

Create `src/components/dashboard/ActivityCalendar.tsx`. Current month; each day is a circle: filled if active, ringed if today, snowflake if frozen. Pure CSS grid — no recharts.

```tsx
import { motion } from 'motion/react'
import type { DailyMetrics } from '../../types'
import { computeStreak } from '../../lib/streak'
import { useT } from '../../lib/i18n'

interface Props {
  daily: DailyMetrics[]
}

const CORE_KEYS: (keyof DailyMetrics)[] = ['steps', 'sleepHours', 'restingHeartRate', 'hrv']

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

type Status = 'active' | 'frozen' | 'missed' | 'future'

export function ActivityCalendar({ daily }: Props) {
  const { t } = useT()
  const today = new Date()
  const todayStr = ymd(today)

  const active = new Set<string>()
  for (const d of daily) if (CORE_KEYS.some(k => d[k] != null)) active.add(d.date)
  const frozen = new Set(computeStreak(daily, today).frozenDates)

  const year = today.getFullYear()
  const month = today.getMonth()
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leadBlanks = (first.getDay() + 6) % 7 // Mon-first grid

  const cells: { key: string; blank?: boolean; date?: string; day?: number; status?: Status }[] = []
  for (let i = 0; i < leadBlanks; i++) cells.push({ key: `b${i}`, blank: true })
  for (let d = 1; d <= daysInMonth; d++) {
    const date = ymd(new Date(year, month, d))
    let status: Status
    if (date > todayStr) status = 'future'
    else if (active.has(date)) status = 'active'
    else if (frozen.has(date)) status = 'frozen'
    else status = 'missed'
    cells.push({ key: date, date, day: d, status })
  }

  const label = (status?: Status) =>
    status === 'active' ? t('данные есть') : status === 'frozen' ? t('заморожено') : status === 'missed' ? t('пропуск') : ''

  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  return (
    <div className="activity-cal">
      <div className="activity-cal-title">{t('Активность')}</div>
      <div className="activity-cal-grid">
        {weekdays.map(w => <div key={w} className="activity-cal-dow">{t(w)}</div>)}
        {cells.map((c, i) =>
          c.blank ? (
            <div key={c.key} className="activity-cal-cell blank" />
          ) : (
            <motion.div
              key={c.key}
              className={`activity-cal-cell status-${c.status}${c.date === todayStr ? ' is-today' : ''}`}
              title={label(c.status)}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(0.4, i * 0.008), duration: 0.2 }}
            >
              {c.status === 'frozen' ? '❄️' : c.day}
            </motion.div>
          )
        )}
      </div>
    </div>
  )
}
```

Note: weekday keys `Пн Вт Ср Чт Пт Сб Вс` — if any are not already in `translations.ts`, `t()` falls back to the Russian source (acceptable; they are 2-letter and identical enough). Do not add them unless you want uk variants.

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test -- src/components/dashboard/ActivityCalendar.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ActivityCalendar.tsx src/components/dashboard/ActivityCalendar.test.ts
git commit -m "feat(dashboard): ActivityCalendar month grid"
```

---

## Task 6: Styles (`src/index.css`)

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Append styles**

Add to the end of `src/index.css`:

```css
/* ── Gamified home: streak widget ───────────────────────────── */
.streak-widget {
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 16px;
  padding: 16px 18px;
  margin: 12px 0;
  background: var(--card, #fff);
}
.streak-widget-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.streak-widget-title { font-weight: 600; }
.streak-widget-pending {
  font-size: 12px; color: var(--muted, #888);
  background: var(--chip, #f2f2f2); padding: 2px 8px; border-radius: 999px;
}
.streak-widget-row { display: flex; gap: 24px; }
.streak-metric { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.streak-metric-emoji { font-size: 20px; line-height: 1; }
.streak-metric-value { font-size: 28px; font-weight: 700; }
.streak-metric-label { font-size: 12px; color: var(--muted, #888); }

/* ── Gamified home: activity calendar ───────────────────────── */
.activity-cal {
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 16px; padding: 16px 18px; margin: 12px 0;
  background: var(--card, #fff);
}
.activity-cal-title { font-weight: 600; margin-bottom: 12px; }
.activity-cal-grid {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px;
}
.activity-cal-dow { font-size: 11px; color: var(--muted, #888); text-align: center; }
.activity-cal-cell {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  border-radius: 999px; font-size: 12px;
}
.activity-cal-cell.blank { background: transparent; }
.activity-cal-cell.status-active { background: var(--green, #34c759); color: #fff; }
.activity-cal-cell.status-frozen { background: var(--chip, #eef3ff); }
.activity-cal-cell.status-missed { background: var(--chip, #f2f2f2); color: var(--muted, #aaa); }
.activity-cal-cell.status-future { color: var(--muted, #ccc); }
.activity-cal-cell.is-today { outline: 2px solid var(--accent, #ff6a2b); outline-offset: 1px; }

/* ── Gamified home: empty state ─────────────────────────────── */
.empty-state {
  border: 1px dashed var(--border, #ddd); border-radius: 16px;
  padding: 24px; text-align: center; margin: 12px 0;
}
.empty-state-icon { font-size: 32px; margin-bottom: 8px; }
.empty-state-title { font-weight: 600; margin-bottom: 4px; }
.empty-state-text { font-size: 13px; color: var(--muted, #888); margin: 0 0 12px; }
.empty-state-cta {
  border: none; border-radius: 999px; padding: 8px 16px; cursor: pointer;
  background: var(--accent, #ff6a2b); color: #fff; font-weight: 600;
}
```

Note: `var(--…)` fallbacks are provided in case a token is not defined. If the project already defines `--green`, `--accent`, `--border`, `--card`, `--muted`, `--chip`, they win.

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "style(dashboard): streak widget, activity calendar, empty state"
```

---

## Task 7: Wire into Dashboard (`src/components/dashboard/Dashboard.tsx`)

Insert the streak block right after the greeting/heading, before `EarlyWarningBanner`. Show a friendly `EmptyState` (with a CTA to sync settings) when there is no history at all; otherwise show `StreakWidget` + `ActivityCalendar`.

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/components/dashboard/Dashboard.tsx`, alongside the other component imports (near the `import { DataGaps } from '../ui/DataGaps'` line), add:

```tsx
import { StreakWidget } from './StreakWidget'
import { ActivityCalendar } from './ActivityCalendar'
import { EmptyState } from '../ui/EmptyState'
```

- [ ] **Step 2: Render the block**

In the returned JSX, find:

```tsx
      {user && <p className="dashboard-greeting">{greeting(user, t)}</p>}
      <h2>{t('Дашборд')}</h2>

      <EarlyWarningBanner daily={daily} />
```

Insert the streak block between the `<h2>` and `<EarlyWarningBanner>`:

```tsx
      {user && <p className="dashboard-greeting">{greeting(user, t)}</p>}
      <h2>{t('Дашборд')}</h2>

      {daily.length === 0 ? (
        <EmptyState
          icon="🔥"
          title={t('Подключи Apple Health, чтобы начать серию')}
          cta={{ label: t('Настроить синхронизацию'), onClick: () => onNavigate('settings') }}
        />
      ) : (
        <>
          <StreakWidget daily={daily} />
          <ActivityCalendar daily={daily} />
        </>
      )}

      <EarlyWarningBanner daily={daily} />
```

Note: `'settings'` is a confirmed valid `AppView` (`src/store/appStore.ts:4`) and `onNavigate: (view: AppView) => void` accepts it — no change needed. The `EmptyState` also renders fine without the `cta` prop if you ever drop it.

- [ ] **Step 3: Run the full test suite**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test
```
Expected: PASS (all suites, including the new streak/widget/calendar/empty-state tests).

- [ ] **Step 4: Typecheck + build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm run build
```
Expected: `tsc -b` clean, `vite build` succeeds. If a duplicate-key TS error mentions `'Активность'`, remove the duplicate added in Task 2.

- [ ] **Step 5: Lint (no new errors)**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm run lint
```
Expected: no NEW errors from the added files (the project has pre-existing lint errors; do not add to them).

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx
git commit -m "feat(dashboard): wire streak block into home with empty-state fallback"
```

---

## Task 8: Visual verification (demo mode)

**Files:** none (verification only)

- [ ] **Step 1: Run the app in demo mode**

Demo mode renders the dashboard on fixture data without Supabase. Create `.env.local` (gitignored) if absent:
```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=test-anon-key
VITE_DEMO=1
```
Then start the dev server via the preview tooling (see the `running-tonus` skill) and open the dashboard.

- [ ] **Step 2: Confirm**

Verify on the home screen:
- StreakWidget shows Day / Freeze / Week with the 🔥 pulse when streak > 0.
- ActivityCalendar shows the current month; active days filled, today ringed, frozen days show ❄️.
- With empty fixture data, the EmptyState card appears instead.

Capture a screenshot for the user.

---

## Self-Review Notes (author)

- **Spec coverage:** streak engine (Task 1) ✓, freeze currency (Task 1) ✓, activity calendar (Task 5) ✓, EmptyState + no-history fallback (Tasks 3, 7) ✓, i18n (Task 2) ✓, unit + component tests (Tasks 1,3,4,5) ✓, Motion animations & existing tokens (Tasks 4,5,6) ✓, staleness banner superseded on home by streak block (Task 7) ✓.
- **Type consistency:** `StreakState` fields (`current`, `freezesAvailable`, `freezesSpent`, `weekly`, `todayPending`, `frozenDates`) and `computeStreak(daily, today?)` signature are identical across engine, widget, calendar, and tests. `CORE_KEYS` set matches between `streak.ts` and `ActivityCalendar.tsx` (duplicated intentionally — the calendar recomputes the active set locally).
- **No placeholders:** every step ships concrete code/commands.
```
