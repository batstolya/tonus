# B2 feature 2: Dashboard data-access layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 7 direct `supabase.from(...)` query sites out of the 3 dashboard components (NotificationBell, HealthAlertBanner, WorkoutPlanCard) into `src/lib/api/dashboard.ts`, add component tests, shrink the components-db-guard allowlist 10 → 7.

**Architecture:** Same pattern as PR #89 (settings, plan `2026-07-17-data-api-settings.md`). One new module `src/lib/api/dashboard.ts` owns the `health_alerts` queries shared by NotificationBell and HealthAlertBanner (parameterised fetch + acknowledge). WorkoutPlanCard's `workout_schedule` query is byte-identical to `getWorkoutSchedule()` already in `src/lib/api/settings.ts` — reuse it, no duplicate. Demo-mode short-circuits stay in components.

**Tech Stack:** vitest node project for the module test (recording supabase mock), jsdom + `renderWithProviders` for component tests (pin `localStorage lang='en'` — jsdom defaults to English). Node 24.

**Branch:** `feat/data-api-dashboard` off `main`.

---

### Task 0: Branch

- [ ] `git checkout main && git pull && git checkout -b feat/data-api-dashboard`

### Task 1: API module `src/lib/api/dashboard.ts` (TDD)

**Files:**
- Create: `src/lib/api/dashboard.ts`
- Test: `src/lib/api/dashboard.test.ts`

- [ ] **Step 1.1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Recording mock for the supabase query builder (same pattern as settings.test.ts).
const state = vi.hoisted(() => ({
  calls: [] as { table: string; steps: [string, unknown[]][] }[],
  response: { data: null as unknown, error: null as unknown },
}))

vi.mock('../supabase', () => {
  function chain(table: string) {
    const call = { table, steps: [] as [string, unknown[]][] }
    state.calls.push(call)
    const p: Record<string, unknown> = {}
    const record = (m: string) => (...args: unknown[]) => { call.steps.push([m, args]); return p }
    for (const m of ['select', 'eq', 'is', 'gte', 'order', 'limit', 'update', 'maybeSingle']) p[m] = record(m)
    ;(p as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(state.response).then(res)
    return p
  }
  return { supabase: { from: (t: string) => chain(t) } }
})

import { getOpenHealthAlerts, acknowledgeHealthAlert } from './dashboard'

beforeEach(() => {
  state.calls.length = 0
  state.response = { data: null, error: null }
})

describe('getOpenHealthAlerts', () => {
  it('queries unacknowledged alerts for the window, newest first', async () => {
    const rows = [{ id: 'a1', level: 'red', message: 'x', created_at: '2026-07-17T00:00:00Z' }]
    state.response = { data: rows, error: null }
    const before = Date.now()
    const alerts = await getOpenHealthAlerts('u1', { sinceHours: 48, limit: 10 })
    expect(alerts).toEqual(rows)
    expect(state.calls[0].table).toBe('health_alerts')
    const steps = state.calls[0].steps
    expect(steps).toContainEqual(['eq', ['user_id', 'u1']])
    expect(steps).toContainEqual(['is', ['acknowledged_at', null]])
    expect(steps).toContainEqual(['order', ['created_at', { ascending: false }]])
    expect(steps).toContainEqual(['limit', [10]])
    const [, [, since]] = steps.find(([m]) => m === 'gte')!
    const hoursAgo = (before - new Date(since as string).getTime()) / 3600_000
    expect(hoursAgo).toBeGreaterThan(47.9)
    expect(hoursAgo).toBeLessThan(48.1)
    // no type filter unless requested
    expect(steps.filter(([m, a]) => m === 'eq' && (a as unknown[])[0] === 'type')).toHaveLength(0)
  })

  it('adds the type filter when given and returns [] on null data', async () => {
    await getOpenHealthAlerts('u1', { sinceHours: 48, limit: 1, type: 'anomaly' })
    expect(state.calls[0].steps).toContainEqual(['eq', ['type', 'anomaly']])
    expect(await getOpenHealthAlerts('u1', { sinceHours: 1, limit: 1 })).toEqual([])
  })
})

describe('acknowledgeHealthAlert', () => {
  it('stamps acknowledged_at on the alert row', async () => {
    const before = Date.now()
    await acknowledgeHealthAlert('a1')
    expect(state.calls[0].table).toBe('health_alerts')
    const [, [patch]] = state.calls[0].steps.find(([m]) => m === 'update')!
    const at = new Date((patch as { acknowledged_at: string }).acknowledged_at).getTime()
    expect(Math.abs(at - before)).toBeLessThan(5000)
    expect(state.calls[0].steps).toContainEqual(['eq', ['id', 'a1']])
  })
})
```

- [ ] **Step 1.2: Run — expect FAIL (module missing)**

Run: `npx vitest run src/lib/api/dashboard.test.ts`

- [ ] **Step 1.3: Implement**

```ts
import { supabase } from '../supabase'

// Dashboard-feature data access (see scripts/components-db-guard.test.mjs).
// health_alerts are written by ingest-health; the dashboard only reads and acks.

export interface HealthAlert {
  id: string
  level: 'yellow' | 'red'
  message: string
  created_at: string
}

export async function getOpenHealthAlerts(
  userId: string,
  opts: { sinceHours: number; limit: number; type?: string },
): Promise<HealthAlert[]> {
  const since = new Date(Date.now() - opts.sinceHours * 3600_000).toISOString()
  let q = supabase.from('health_alerts')
    .select('id, level, message, created_at')
    .eq('user_id', userId)
  if (opts.type) q = q.eq('type', opts.type)
  const { data } = await q
    .is('acknowledged_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(opts.limit)
  return (data ?? []) as HealthAlert[]
}

export async function acknowledgeHealthAlert(alertId: string): Promise<void> {
  await supabase.from('health_alerts')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', alertId)
}
```

- [ ] **Step 1.4: Run — expect PASS**
- [ ] **Step 1.5: Commit** `feat(client): dashboard data-access module src/lib/api/dashboard.ts`

### Task 2: Migrate HealthAlertBanner + component test

**Files:**
- Modify: `src/components/dashboard/HealthAlertBanner.tsx`
- Create: `src/components/dashboard/HealthAlertBanner.test.tsx`
- Modify: `scripts/components-db-guard.test.mjs` (drop the file)

- [ ] **Step 2.1: Failing test**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({
  getOpenHealthAlerts: vi.fn(),
  acknowledgeHealthAlert: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/api/dashboard', () => api)

import HealthAlertBanner from './HealthAlertBanner'

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('HealthAlertBanner', () => {
  it('renders the latest anomaly alert with HTML stripped and acks it', async () => {
    api.getOpenHealthAlerts.mockResolvedValue([
      { id: 'a1', level: 'red', message: '<b>Pulse</b> is up', created_at: '2026-07-17T06:00:00Z' },
    ])
    renderWithProviders(<HealthAlertBanner userId="u1" demo={false} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Pulse is up')
    expect(api.getOpenHealthAlerts).toHaveBeenCalledWith('u1', { sinceHours: 48, limit: 1, type: 'anomaly' })

    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(api.acknowledgeHealthAlert).toHaveBeenCalledWith('a1'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders nothing when there are no alerts', async () => {
    api.getOpenHealthAlerts.mockResolvedValue([])
    const { container } = renderWithProviders(<HealthAlertBanner userId="u1" demo={false} />)
    await waitFor(() => expect(api.getOpenHealthAlerts).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2.2: Run — expect FAIL**
- [ ] **Step 2.3: Migrate** — replace the `supabase` import with `import { getOpenHealthAlerts, acknowledgeHealthAlert, type HealthAlert } from '../../lib/api/dashboard'`; delete the local `HealthAlert` interface; effect body becomes:

```tsx
  useEffect(() => {
    if (!userId || demo) return
    let cancelled = false
    getOpenHealthAlerts(userId, { sinceHours: 48, limit: 1, type: 'anomaly' })
      .then(alerts => { if (!cancelled && alerts.length) setAlert(alerts[0]) })
    return () => { cancelled = true }
  }, [userId, demo])
```

and in `ack`: `await acknowledgeHealthAlert(alert.id)`.

- [ ] **Step 2.4: Drop from allowlist, run test + guard — expect PASS**
- [ ] **Step 2.5: Commit** `refactor(dashboard): HealthAlertBanner via api module + component test`

### Task 3: Migrate NotificationBell + component test

**Files:**
- Modify: `src/components/dashboard/NotificationBell.tsx`
- Create: `src/components/dashboard/NotificationBell.test.tsx`
- Modify: `scripts/components-db-guard.test.mjs`

- [ ] **Step 3.1: Failing test** (derived client-side items are `buildBellItems`'s concern — mock it to `[]` so the test isolates the DB-alert path; `daily` must be non-empty or the bell renders null)

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DailyMetrics } from '../../types'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({
  getOpenHealthAlerts: vi.fn(),
  acknowledgeHealthAlert: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/api/dashboard', () => api)
vi.mock('../../lib/notifications', () => ({ buildBellItems: () => [] }))

import { NotificationBell } from './NotificationBell'

const daily = [{ date: '2026-07-17' } as DailyMetrics]

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('NotificationBell', () => {
  it('shows the alert count badge and lists alerts from the API', async () => {
    api.getOpenHealthAlerts.mockResolvedValue([
      { id: 'a1', level: 'yellow', message: '<i>HRV</i> low', created_at: '2026-07-17T06:00:00Z' },
    ])
    renderWithProviders(<NotificationBell daily={daily} userId="u1" demo={false} />)
    expect(await screen.findByText('1')).toBeInTheDocument()
    expect(api.getOpenHealthAlerts).toHaveBeenCalledWith('u1', { sinceHours: 14 * 24, limit: 10 })

    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(await screen.findByText('HRV low')).toBeInTheDocument()
  })

  it('acks an alert through the API module', async () => {
    api.getOpenHealthAlerts.mockResolvedValue([
      { id: 'a1', level: 'red', message: 'Alert', created_at: '2026-07-17T06:00:00Z' },
    ])
    renderWithProviders(<NotificationBell daily={daily} userId="u1" demo={false} />)
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Got it/ }))
    await waitFor(() => expect(api.acknowledgeHealthAlert).toHaveBeenCalledWith('a1'))
  })
})
```

(Verify the en translations of 'Уведомления' and 'Понятно' before asserting — adjust the names if the dictionary differs.)

- [ ] **Step 3.2: Run — expect FAIL**
- [ ] **Step 3.3: Migrate** — swap imports (`HealthAlert` type comes from the module), effect body:

```tsx
  useEffect(() => {
    if (!userId || demo) return
    let cancelled = false
    getOpenHealthAlerts(userId, { sinceHours: 14 * 24, limit: 10 })
      .then(data => { if (!cancelled && data.length) setAlerts(data) })
    return () => { cancelled = true }
  }, [userId, demo])
```

Note the original set state whenever `data` was non-null (including `[]`); initial state is already `[]` for non-demo, so gating on `length` is equivalent. `ackAlert` calls `acknowledgeHealthAlert(id)`.

- [ ] **Step 3.4: Drop from allowlist, run test + guard — expect PASS**
- [ ] **Step 3.5: Commit** `refactor(dashboard): NotificationBell via api module + component test`

### Task 4: Migrate WorkoutPlanCard (reuse settings API) + component test

**Files:**
- Modify: `src/components/dashboard/WorkoutPlanCard.tsx`
- Create: `src/components/dashboard/WorkoutPlanCard.test.tsx`
- Modify: `scripts/components-db-guard.test.mjs`

- [ ] **Step 4.1: Failing test**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DailyMetrics } from '../../types'
import { renderWithProviders, screen, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({ getWorkoutSchedule: vi.fn() }))
vi.mock('../../lib/api/settings', () => api)
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))

import { WorkoutPlanCard } from './WorkoutPlanCard'

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('WorkoutPlanCard', () => {
  it('shows next workout and monthly attendance when a schedule exists', async () => {
    api.getWorkoutSchedule.mockResolvedValue({ day_times: { '1': { time: '19:00' } }, notify_hours_before: 4, enabled: true })
    renderWithProviders(<WorkoutPlanCard daily={[] as DailyMetrics[]} />)
    expect(await screen.findByText(/Next workout/)).toBeInTheDocument()
  })

  it('renders nothing when the schedule is disabled', async () => {
    api.getWorkoutSchedule.mockResolvedValue({ day_times: { '1': { time: '19:00' } }, notify_hours_before: 4, enabled: false })
    const { container } = renderWithProviders(<WorkoutPlanCard daily={[] as DailyMetrics[]} />)
    await waitFor(() => expect(api.getWorkoutSchedule).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })
})
```

(Verify the en translation of 'Следующая тренировка' first.)

- [ ] **Step 4.2: Run — expect FAIL**
- [ ] **Step 4.3: Migrate** — replace the `supabase` import with `import { getWorkoutSchedule } from '../../lib/api/settings'`; drop the now-unused `DayTimes` import if nothing else uses it; effect becomes:

```tsx
  useEffect(() => {
    if (isDemoActive()) return
    getWorkoutSchedule().then(setWs)
  }, [])
```

(`WorkoutSchedule` from the api module is structurally identical to `WorkoutScheduleRow`, so `setWs` accepts it as-is.)

- [ ] **Step 4.4: Drop from allowlist, run test + guard — expect PASS**
- [ ] **Step 4.5: Commit** `refactor(dashboard): WorkoutPlanCard reuses settings api + component test`

### Task 5: Gate + PR

- [ ] Full gate: `VITE_DEMO= npm test && npm run test:scripts && npm run build && npm run lint:ceiling && npm run check:functions` (local `.env.local` has `VITE_DEMO=1`, hence the override; CI unaffected)
- [ ] Update spec status table: `guard 15→10` → `guard 15→7 (settings, dashboard)`
- [ ] Commit docs, push, `gh pr create`, merge on green CI (squash, delete branch). No edge functions touched.
