# Focus Auto-Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-compute weekly-focus adherence ("N/7" or "N/target") from logged data instead of manual taps, by having the AI coach attach a machine-checkable condition to each focus.

**Architecture:** The coach (`coach-weekly`) emits a structured `check` alongside the focus text. A pure client function `evaluateFocus` computes per-day adherence from already-available data (daily metrics, intake events, wellbeing). The dashboard card auto-renders the count + day dots when a `check` exists; falls back to the existing manual button when it doesn't. No DB migration — `coach_profile.focus` is already `jsonb`.

**Tech Stack:** React + TypeScript + Vite, Vitest (`src/lib/*.test.ts`), Supabase Postgres + Deno edge functions. Type-check via `npx tsc -b` (sandbox Node 18 can't run `vite build`; UI/edge verified by type-check + manual).

**Reference spec:** `docs/superpowers/specs/2026-06-21-focus-auto-tracking-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/coach.ts` | Focus types, validation, data loader | Modify (`CoachFocus.check`, `FocusCheck`/`DayPredicate`, `validateFocusCheck`, `loadFocusInputs`) |
| `src/lib/coach.test.ts` | Validation tests | Create |
| `src/lib/focusAdherence.ts` | Pure adherence evaluator | Create |
| `src/lib/focusAdherence.test.ts` | Evaluator tests | Create |
| `src/components/dashboard/Dashboard.tsx` | `CoachFocusCard` auto mode + dots | Modify |
| `supabase/functions/coach-weekly/index.ts` | Prompt + parse/validate `CHECK:` | Modify |
| `src/lib/translations.ts` | New UI strings | Modify |

**Note:** `Dashboard.events` is `CalendarEvent[]` (not intake), so `CoachFocusCard` loads its own intake + wellbeing via `loadFocusInputs`; it only needs the existing `daily` prop. Edge function (`coach-weekly`) is Deno — not covered by tsc/vitest, verified by review + manual.

---

## Task 1: coach.ts — types, validation, data loader

**Files:**
- Modify: `src/lib/coach.ts`
- Test: `src/lib/coach.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/coach.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateFocusCheck } from './coach'

describe('validateFocusCheck', () => {
  it('принимает валидные формы', () => {
    expect(validateFocusCheck({ predicate: { kind: 'steps_gte', value: 8000 } }))
      .toEqual({ predicate: { kind: 'steps_gte', value: 8000 } })
    expect(validateFocusCheck({ predicate: { kind: 'bedtime_before', time: '23:00' } })!.predicate.kind).toBe('bedtime_before')
    expect(validateFocusCheck({ predicate: { kind: 'event_absent_after', event: 'coffee', time: '16:00' } })!.predicate.kind).toBe('event_absent_after')
    const wk = validateFocusCheck({ predicate: { kind: 'event_present', event: 'workout' }, target: 3 })
    expect(wk!.target).toBe(3)
  })

  it('отклоняет мусор', () => {
    expect(validateFocusCheck(null)).toBeNull()
    expect(validateFocusCheck({ predicate: { kind: 'unknown' } })).toBeNull()
    expect(validateFocusCheck({ predicate: { kind: 'steps_gte' } })).toBeNull()           // нет value
    expect(validateFocusCheck({ predicate: { kind: 'event_present', event: 'pizza' } })).toBeNull() // плохой event
    expect(validateFocusCheck({ predicate: { kind: 'event_present', event: 'workout' }, target: 9 })).toBeNull() // target вне 1..7
    expect(validateFocusCheck({ predicate: { kind: 'bedtime_before', time: 'вечером' } })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/coach.test.ts`
Expected: FAIL — `validateFocusCheck` is not exported.

- [ ] **Step 3: Add types + validation to coach.ts**

In `src/lib/coach.ts`, replace the existing `CoachFocus` interface line:

```ts
export interface CoachFocus { text: string; set_at: string }
```

with:

```ts
export interface CoachFocus { text: string; set_at: string; check?: FocusCheck | null }

export interface FocusCheck {
  predicate: DayPredicate
  target?: number   // задан → цель-частота (знаменатель = target); иначе ежедневная (=7)
  label?: string
}

export type DayPredicate =
  | { kind: 'steps_gte'; value: number }
  | { kind: 'sleep_hours_gte'; value: number }
  | { kind: 'bedtime_before'; time: string }
  | { kind: 'meals_gte'; value: number }
  | { kind: 'event_count_lte'; event: string; value: number }
  | { kind: 'event_absent_after'; event: string; time: string }
  | { kind: 'event_present'; event: string }
  | { kind: 'event_absent'; event: string }
  | { kind: 'wellbeing_gte'; value: number }

export const FOCUS_EVENT_TYPES = ['coffee', 'alcohol', 'meal', 'water', 'meds', 'workout', 'illness', 'stress', 'travel', 'custom']

export function validateFocusCheck(obj: any): FocusCheck | null {
  if (!obj || typeof obj !== 'object') return null
  const p = obj.predicate
  if (!p || typeof p !== 'object') return null
  const numOk = (v: any) => typeof v === 'number' && isFinite(v)
  const timeOk = (v: any) => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v)
  const evOk = (v: any) => typeof v === 'string' && FOCUS_EVENT_TYPES.includes(v)
  let ok = false
  switch (p.kind) {
    case 'steps_gte': case 'sleep_hours_gte': case 'meals_gte': case 'wellbeing_gte': ok = numOk(p.value); break
    case 'bedtime_before': ok = timeOk(p.time); break
    case 'event_count_lte': ok = evOk(p.event) && numOk(p.value); break
    case 'event_absent_after': ok = evOk(p.event) && timeOk(p.time); break
    case 'event_present': case 'event_absent': ok = evOk(p.event); break
    default: ok = false
  }
  if (!ok) return null
  const out: FocusCheck = { predicate: p as DayPredicate }
  if (obj.target != null) {
    if (!numOk(obj.target) || obj.target < 1 || obj.target > 7) return null
    out.target = Math.round(obj.target)
  }
  if (typeof obj.label === 'string') out.label = obj.label
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/coach.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the data loader**

Append to `src/lib/coach.ts`:

```ts
// Данные для авто-оценки фокуса: intake-события + самочувствие по дням, начиная с sinceDate.
export async function loadFocusInputs(userId: string, sinceDate: string): Promise<{ intake: { ts: string; type: string }[]; wellbeingByDate: Record<string, number> }> {
  const [intakeRes, noteRes] = await Promise.all([
    supabase.from('intake_events').select('ts, type').eq('user_id', userId).gte('ts', `${sinceDate}T00:00:00Z`),
    supabase.from('context_notes').select('date, wellbeing').eq('user_id', userId).gte('date', sinceDate),
  ])
  const wellbeingByDate: Record<string, number> = {}
  for (const r of noteRes.data ?? []) if (typeof (r as any).wellbeing === 'number') wellbeingByDate[(r as any).date] = (r as any).wellbeing
  return { intake: (intakeRes.data ?? []) as { ts: string; type: string }[], wellbeingByDate }
}
```

- [ ] **Step 6: Verify build + tests**

Run: `npx tsc -b && npm run test -- src/lib/coach.test.ts`
Expected: tsc exit 0; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/coach.ts src/lib/coach.test.ts
git commit -m "feat(coach): FocusCheck types + validateFocusCheck + loadFocusInputs"
```

---

## Task 2: focusAdherence.ts — evaluator

**Files:**
- Create: `src/lib/focusAdherence.ts`
- Test: `src/lib/focusAdherence.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/focusAdherence.test.ts` (uses 2020 dates so all 7 days are in the past → deterministic, no `future` days):

```ts
import { describe, it, expect } from 'vitest'
import { evaluateFocus, type FocusData } from './focusAdherence'
import type { FocusCheck } from './coach'
import type { DailyMetrics } from '../types'

const setAt = '2020-01-01T08:00:00Z'
const dates = Array.from({ length: 7 }, (_, i) => `2020-01-0${i + 1}`)

function daily(overrides: Partial<DailyMetrics>[] = []): DailyMetrics[] {
  return dates.map((date, i) => ({ date, ...(overrides[i] ?? {}) }))
}
const empty: FocusData = { daily: [], intake: [], wellbeingByDate: {} }

describe('evaluateFocus', () => {
  it('steps_gte: считает дни с шагами >= порога', () => {
    const data: FocusData = { ...empty, daily: daily(dates.map((_, i) => ({ steps: i < 4 ? 9000 : 100 }))) }
    const p = evaluateFocus({ predicate: { kind: 'steps_gte', value: 8000 } }, setAt, data)
    expect(p.mode).toBe('daily'); expect(p.denom).toBe(7); expect(p.daysMet).toBe(4)
    expect(p.perDay).toHaveLength(7); expect(p.perDay.every(d => !d.future)).toBe(true)
  })

  it('presence-цель без данных = не выполнено', () => {
    const p = evaluateFocus({ predicate: { kind: 'steps_gte', value: 8000 } }, setAt, empty)
    expect(p.daysMet).toBe(0)
  })

  it('meals_gte: считает meal-события за день', () => {
    const intake = [
      { ts: '2020-01-01T09:00:00Z', type: 'meal' }, { ts: '2020-01-01T13:00:00Z', type: 'meal' }, { ts: '2020-01-01T19:00:00Z', type: 'meal' },
      { ts: '2020-01-02T13:00:00Z', type: 'meal' },
    ]
    const p = evaluateFocus({ predicate: { kind: 'meals_gte', value: 3 } }, setAt, { ...empty, intake })
    expect(p.daysMet).toBe(1) // только 1-е
  })

  it('event_absent: день без события = выполнено (absence-цель)', () => {
    const intake = [{ ts: '2020-01-03T20:00:00Z', type: 'alcohol' }]
    const p = evaluateFocus({ predicate: { kind: 'event_absent', event: 'alcohol' } }, setAt, { ...empty, intake })
    expect(p.daysMet).toBe(6) // все кроме 3-го
  })

  it('event_absent_after: кофе после 16:00 ломает день', () => {
    const intake = [
      { ts: '2020-01-01T09:00:00', type: 'coffee' },  // утро — ок
      { ts: '2020-01-02T18:00:00', type: 'coffee' },  // вечер — не ок
    ]
    const p = evaluateFocus({ predicate: { kind: 'event_absent_after', event: 'coffee', time: '16:00' } }, setAt, { ...empty, intake })
    // 2-е не выполнено, остальные 6 — выполнены (нет позднего кофе)
    expect(p.perDay.find(d => d.date === '2020-01-02')!.met).toBe(false)
    expect(p.daysMet).toBe(6)
  })

  it('bedtime_before: отбой после полуночи = поздно', () => {
    const d = daily([
      { sleepBedtime: '2020-01-01T22:30:00' }, // рано — ок
      { sleepBedtime: '2020-01-03T00:30:00' }, // 00:30 — поздно
    ])
    const p = evaluateFocus({ predicate: { kind: 'bedtime_before', time: '23:00' } }, setAt, { ...empty, daily: d })
    expect(p.perDay[0].met).toBe(true)
    expect(p.perDay[1].met).toBe(false)
  })

  it('weekly: target задаёт знаменатель и done', () => {
    const intake = ['2020-01-01', '2020-01-03', '2020-01-05'].map(d => ({ ts: `${d}T18:00:00Z`, type: 'workout' }))
    const p = evaluateFocus({ predicate: { kind: 'event_present', event: 'workout' }, target: 3 }, setAt, { ...empty, intake })
    expect(p.mode).toBe('weekly'); expect(p.denom).toBe(3); expect(p.daysMet).toBe(3); expect(p.done).toBe(true)
  })

  it('wellbeing_gte: по самочувствию', () => {
    const p = evaluateFocus({ predicate: { kind: 'wellbeing_gte', value: 4 } }, setAt, { ...empty, wellbeingByDate: { '2020-01-01': 5, '2020-01-02': 3 } })
    expect(p.daysMet).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/focusAdherence.test.ts`
Expected: FAIL — `Cannot find module './focusAdherence'`.

- [ ] **Step 3: Implement focusAdherence.ts**

Create `src/lib/focusAdherence.ts`:

```ts
import type { DailyMetrics } from '../types'
import type { FocusCheck, DayPredicate } from './coach'

export interface FocusData {
  daily: DailyMetrics[]
  intake: { ts: string; type: string }[]
  wellbeingByDate: Record<string, number>
}

export interface FocusProgress {
  daysMet: number
  denom: number
  mode: 'daily' | 'weekly'
  done: boolean
  perDay: { date: string; met: boolean; future: boolean }[]
}

function addDays(dateStr: string, n: number): string {
  const dt = new Date(`${dateStr}T00:00:00Z`); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10)
}
// минуты от 00:00; eveningAnchor: время раньше 12:00 трактуем как «следующий день» (+1440)
function toMin(hhmm: string, eveningAnchor: boolean): number {
  const [h, m] = hhmm.split(':').map(Number); let min = h * 60 + m
  if (eveningAnchor && min < 720) min += 1440
  return min
}
function clockMin(iso: string, eveningAnchor: boolean): number {
  const d = new Date(iso); let min = d.getHours() * 60 + d.getMinutes()
  if (eveningAnchor && min < 720) min += 1440
  return min
}

function evalPredicate(p: DayPredicate, date: string, data: FocusData, byDate: Map<string, DailyMetrics>): boolean {
  const dm = byDate.get(date)
  const dayEvents = (ev: string) => data.intake.filter(e => e.type === ev && e.ts.slice(0, 10) === date)
  switch (p.kind) {
    case 'steps_gte': return dm?.steps != null && dm.steps >= p.value
    case 'sleep_hours_gte': return dm?.sleepHours != null && dm.sleepHours >= p.value
    case 'bedtime_before': return dm?.sleepBedtime != null && clockMin(dm.sleepBedtime, true) <= toMin(p.time, true)
    case 'meals_gte': return dayEvents('meal').length >= p.value
    case 'event_count_lte': return dayEvents(p.event).length <= p.value
    case 'event_absent_after': { const thr = toMin(p.time, false); return !dayEvents(p.event).some(e => clockMin(e.ts, false) > thr) }
    case 'event_present': return dayEvents(p.event).length >= 1
    case 'event_absent': return dayEvents(p.event).length === 0
    case 'wellbeing_gte': return data.wellbeingByDate[date] != null && data.wellbeingByDate[date] >= p.value
  }
}

export function evaluateFocus(check: FocusCheck, setAt: string, data: FocusData): FocusProgress {
  const start = setAt.slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const byDate = new Map(data.daily.map(d => [d.date, d]))
  const perDay = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    const future = date > today
    return { date, future, met: future ? false : evalPredicate(check.predicate, date, data, byDate) }
  })
  const daysMet = perDay.filter(d => d.met).length
  const mode = check.target != null ? 'weekly' : 'daily'
  const denom = check.target != null ? check.target : 7
  const done = check.target != null ? daysMet >= check.target : false
  return { daysMet, denom, mode, done, perDay }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/focusAdherence.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Run full suite + build**

Run: `npm run test && npx tsc -b`
Expected: all tests PASS; tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/focusAdherence.ts src/lib/focusAdherence.test.ts
git commit -m "feat(focus): evaluateFocus — per-day adherence from data (daily/weekly)"
```

---

## Task 3: Dashboard CoachFocusCard — auto mode + dots

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx`

- [ ] **Step 1: Extend the coach import**

In `src/components/dashboard/Dashboard.tsx`, change line 11:

```ts
import { loadFocus, loadCheckins, checkInToday, removeCheckinToday, type CoachFocus } from '../../lib/coach'
```

to:

```ts
import { loadFocus, loadCheckins, checkInToday, removeCheckinToday, loadFocusInputs, type CoachFocus } from '../../lib/coach'
import { evaluateFocus, type FocusData } from '../../lib/focusAdherence'
```

- [ ] **Step 2: Replace CoachFocusCard with the auto/manual branching version**

Replace the entire `CoachFocusCard` function (currently lines ~199-237) with:

```tsx
function CoachFocusCard({ user, daily }: { user: User; daily: DailyMetrics[] }) {
  const { t } = useT()
  const [focus, setFocus] = useState<CoachFocus | null>(null)
  const [checkins, setCheckins] = useState<string[]>([])
  const [inputs, setInputs] = useState<{ intake: { ts: string; type: string }[]; wellbeingByDate: Record<string, number> } | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    loadFocus(user.id).then(f => {
      setFocus(f)
      if (!f) return
      if (f.check) loadFocusInputs(user.id, f.set_at.slice(0, 10)).then(setInputs)
      else loadCheckins(user.id, f.set_at).then(setCheckins)
    })
  }, [user.id])

  if (!focus) return null

  // ── Авто-режим: есть машинное условие ──
  if (focus.check) {
    const data: FocusData = { daily, intake: inputs?.intake ?? [], wellbeingByDate: inputs?.wellbeingByDate ?? {} }
    const p = evaluateFocus(focus.check, focus.set_at, data)
    const count = p.mode === 'weekly' ? `${p.daysMet}/${p.denom} ${t('за неделю')}` : `${p.daysMet}/7`
    return (
      <div className="coach-focus-card">
        <div className="coach-focus-head">
          <span className="coach-focus-label">🎯 {t('Фокус недели')}</span>
          <span className="coach-focus-count">{count}</span>
        </div>
        <div className="coach-focus-text">{focus.text}</div>
        <div className="coach-focus-dots" style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {p.perDay.map((d, i) => (
            <span key={i} title={d.date} style={{ opacity: d.future ? 0.3 : 1 }}>{d.met ? '🟢' : '⚪'}</span>
          ))}
        </div>
        <div className="coach-focus-auto" style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}>🔄 {t('по данным')}</div>
      </div>
    )
  }

  // ── Ручной fallback: цель не выражается через данные ──
  const doneToday = checkins.includes(today)
  async function toggle() {
    if (doneToday) {
      setCheckins(c => c.filter(d => d !== today))
      await removeCheckinToday(user.id)
    } else {
      setCheckins(c => [today, ...c])
      await checkInToday(user.id)
    }
  }
  return (
    <div className="coach-focus-card">
      <div className="coach-focus-head">
        <span className="coach-focus-label">🎯 {t('Фокус недели')}</span>
        <span className="coach-focus-count">{checkins.length} {t('из 7 дней')}</span>
      </div>
      <div className="coach-focus-text">{focus.text}</div>
      <button className={`coach-focus-btn${doneToday ? ' done' : ''}`} onClick={toggle}>
        {doneToday ? `✓ ${t('Сегодня держусь')}` : t('Отметить сегодня')}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Pass `daily` at the render site**

In `src/components/dashboard/Dashboard.tsx`, change the render line (~369):

```tsx
      {user && <CoachFocusCard user={user} />}
```

to:

```tsx
      {user && <CoachFocusCard user={user} daily={daily} />}
```

- [ ] **Step 4: Verify the build compiles**

Run: `npx tsc -b`
Expected: tsc exit 0.

- [ ] **Step 5: Manual check (after deploy/build)**

Open the dashboard. For a focus with a `check`, the card shows `N/7` (or `N/target за неделю`) + 7 day dots (🟢/⚪) + "🔄 по данным", no button. For a focus without `check`, the manual "Отметить сегодня" button still works.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx
git commit -m "feat(dashboard): auto-compute focus adherence from data + day dots; manual fallback"
```

---

## Task 4: coach-weekly — emit + validate CHECK

**Files:**
- Modify: `supabase/functions/coach-weekly/index.ts`

The edge function is Deno; it cannot import from `src/`. The validation logic from `validateFocusCheck` (Task 1) is duplicated inline here with the same rules.

- [ ] **Step 1: Extend the prompt to emit a CHECK line**

In `supabase/functions/coach-weekly/index.ts`, change the prompt's final instruction block. Replace:

```
В конце ОТДЕЛЬНОЙ строкой: FOCUS: <одна фраза фокуса для трекинга>
Без диагнозов. Опирайся на цифры, не выдумывай. На русском.`
```

with:

```
В конце ДВЕ ОТДЕЛЬНЫЕ строки:
FOCUS: <одна фраза фокуса для трекинга>
CHECK: <JSON условия выполнения за ОДИН день, или none>
JSON строго одной из форм (target — добавь только если цель «N раз в неделю», 1..7):
{"predicate":{"kind":"steps_gte","value":8000}}
{"predicate":{"kind":"sleep_hours_gte","value":7}}
{"predicate":{"kind":"bedtime_before","time":"23:00"}}
{"predicate":{"kind":"meals_gte","value":3}}
{"predicate":{"kind":"event_count_lte","event":"coffee","value":1}}
{"predicate":{"kind":"event_absent_after","event":"coffee","time":"16:00"}}
{"predicate":{"kind":"event_present","event":"workout"},"target":3}
{"predicate":{"kind":"event_absent","event":"alcohol"}}
{"predicate":{"kind":"wellbeing_gte","value":4}}
event ∈ coffee|alcohol|meal|water|meds|workout|illness|stress|travel. Если фокус нельзя выразить — CHECK: none. Не выдумывай поля.
Без диагнозов. Опирайся на цифры, не выдумывай. На русском.`
```

- [ ] **Step 2: Add the inline validator above the handler**

In `supabase/functions/coach-weekly/index.ts`, add near the top (after imports, module scope):

```ts
const FOCUS_EVENT_TYPES = ['coffee', 'alcohol', 'meal', 'water', 'meds', 'workout', 'illness', 'stress', 'travel', 'custom']
function validateFocusCheck(obj: any): any | null {
  if (!obj || typeof obj !== 'object') return null
  const p = obj.predicate
  if (!p || typeof p !== 'object') return null
  const numOk = (v: any) => typeof v === 'number' && isFinite(v)
  const timeOk = (v: any) => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v)
  const evOk = (v: any) => typeof v === 'string' && FOCUS_EVENT_TYPES.includes(v)
  let ok = false
  switch (p.kind) {
    case 'steps_gte': case 'sleep_hours_gte': case 'meals_gte': case 'wellbeing_gte': ok = numOk(p.value); break
    case 'bedtime_before': ok = timeOk(p.time); break
    case 'event_count_lte': ok = evOk(p.event) && numOk(p.value); break
    case 'event_absent_after': ok = evOk(p.event) && timeOk(p.time); break
    case 'event_present': case 'event_absent': ok = evOk(p.event); break
    default: ok = false
  }
  if (!ok) return null
  const out: any = { predicate: p }
  if (obj.target != null) { if (!numOk(obj.target) || obj.target < 1 || obj.target > 7) return null; out.target = Math.round(obj.target) }
  if (typeof obj.label === 'string') out.label = obj.label
  return out
}
```

- [ ] **Step 3: Parse CHECK and store it in focus**

In `supabase/functions/coach-weekly/index.ts`, the focus extraction currently is:

```ts
  const focusMatch = text.match(/FOCUS:\s*(.+)$/m)
  const focusText = focusMatch ? focusMatch[1].trim() : null
  text = text.replace(/\n?FOCUS:.*$/m, '').trim()
```

Add CHECK parsing right after it:

```ts
  const checkMatch = text.match(/CHECK:\s*(.+)$/m)
  let focusCheck: any = null
  if (checkMatch) {
    const raw = checkMatch[1].trim()
    if (raw.toLowerCase() !== 'none') { try { focusCheck = validateFocusCheck(JSON.parse(raw)) } catch { focusCheck = null } }
  }
  text = text.replace(/\n?CHECK:.*$/m, '').trim()
```

Then change the focus upsert to include `check`:

```ts
  if (focusText) {
    await supabase.from('coach_profile').upsert(
      { user_id: userId, focus: { text: focusText, set_at: new Date().toISOString(), check: focusCheck }, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  }
```

- [ ] **Step 4: Deploy coach-weekly**

`coach-weekly` is single-file (no `_shared` imports — verify with `grep -nE "_shared" supabase/functions/coach-weekly/index.ts`, expect no output). Deploy with `verify_jwt=false` (it's pinned in `config.toml` — pg_cron caller, no JWT):

```bash
TOKEN=<SUPABASE_ACCESS_TOKEN>; REF=mxnmubakfzqoosgsqmhh
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  "https://api.supabase.com/v1/projects/$REF/functions/deploy?slug=coach-weekly" \
  -H "Authorization: Bearer $TOKEN" \
  -F 'metadata={"name":"coach-weekly","entrypoint_path":"index.ts","verify_jwt":false};type=application/json' \
  -F "file=@supabase/functions/coach-weekly/index.ts;type=application/typescript"
```
Expected: HTTP 201, `verify_jwt:false`, version bumped.

- [ ] **Step 5: Manual check**

Trigger a weekly review (the dashboard "запустить разбор" path calls `runWeeklyReview` → `coach-weekly`). Confirm the new focus in `coach_profile.focus` has a non-null `check` for a measurable goal; a fuzzy goal yields `check:null` → manual card.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/coach-weekly/index.ts
git commit -m "feat(coach-weekly): emit + validate machine-checkable focus condition (CHECK)"
```

---

## Task 5: translations

**Files:**
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Add the new UI strings**

In `src/lib/translations.ts`, add two entries (match the file's existing `'<ru>': { uk, en }` shape):

```ts
  'за неделю': { uk: 'за тиждень', en: 'this week' },
  'по данным': { uk: 'за даними', en: 'from data' },
```

- [ ] **Step 2: Verify build**

Run: `npx tsc -b`
Expected: tsc exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/translations.ts
git commit -m "i18n: focus auto-tracking strings (за неделю, по данным)"
```

---

## Self-Review

**Spec coverage:**
- `check` field on `coach_profile.focus` (jsonb, no migration) → Task 1. ✅
- `FocusCheck`/`DayPredicate` vocabulary → Task 1. ✅
- `evaluateFocus` with daily/weekly, evening-anchor bedtime, presence-vs-absence semantics, future days, 7-day window → Task 2 (+tests). ✅
- coach-weekly emits + strictly validates CHECK → Task 4. ✅
- Dashboard auto mode (count + day dots) with manual fallback → Task 3. ✅
- Wellbeing as a predicate + loader → Task 1 (`loadFocusInputs`), Task 2 (`wellbeing_gte`). ✅
- Translations → Task 5. ✅

**Placeholder scan:** none — every code step shows complete code. ✅

**Type consistency:** `FocusCheck`/`DayPredicate`/`validateFocusCheck`/`FOCUS_EVENT_TYPES` defined in Task 1 and reused in Tasks 2–4 with matching names. `FocusData`/`FocusProgress`/`evaluateFocus` defined in Task 2, consumed in Task 3. `loadFocusInputs` shape (`{intake, wellbeingByDate}`) defined in Task 1, consumed identically in Task 3. The inline validator in Task 4 mirrors Task 1's (Deno can't import `src/`) — same rules, intentional duplication noted. ✅

## Open items (not in this plan)
- Manual override of an auto-verdict (day dots show which days counted; user logs missing data instead).
- One-time parse of the *currently-set* focus into a `check` (it converts on the next `coach-weekly` run, within a week).
- Absence-goals (`event_absent`/`event_count_lte`/`event_absent_after`) treat a day with no logs as met — adherence is inferred from logged data only.
