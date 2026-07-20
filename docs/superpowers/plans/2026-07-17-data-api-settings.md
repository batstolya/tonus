# B2 feature 1: Settings data-access layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all 13 direct `supabase.from(...)` queries out of the 5 settings components into a typed API module `src/lib/api/settings.ts`, add component tests for the migrated sections, and land a ratchet guard that forbids new direct queries in `src/components`.

**Architecture:** One per-feature API module (`src/lib/api/settings.ts`) exposing small typed async functions, mirroring the existing `src/lib/reportSettings.ts` / `src/lib/dailyNote.ts` pattern. Components keep UI state, demo-mode short-circuits, and non-Supabase fetches (geocoders); the module owns every Supabase query. A new guard script (`scripts/components-db-guard.test.mjs`, same ratchet style as `scripts/edge-fetch-guard.test.mjs`) starts with an allowlist of all 15 current offender files and shrinks by 5 within this PR; CI already runs it via `npm run test:scripts` (glob `scripts/*.test.mjs`).

**Tech Stack:** React 19 + Vite, supabase-js, vitest (node project for `*.test.ts`, jsdom for `*.test.tsx` via `renderWithProviders` from `src/test/utils.tsx`), node:test for guard scripts. Everything runs on Node 24 (`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`).

**Branch:** `feat/data-api-settings` off `main`.

**Repo language rule:** all code, comments, commits — English only (UI strings stay ru).

---

### Task 0: Branch

- [ ] **Step 0.1: Create the branch**

```bash
git checkout main && git pull && git checkout -b feat/data-api-settings
```

### Task 1: Ratchet guard — no direct DB queries in components

**Files:**
- Create: `scripts/components-db-guard.test.mjs`

The guard greps `src/components` for `.from('` / `.from("` (a string-literal table name — this matches Supabase query builders but not `Array.from({...})`, which always takes an object or callback). Allowlist = the 15 files that query today. Stale-entry check forces the allowlist to shrink as files are migrated.

- [ ] **Step 1.1: Write the guard**

```js
// Guard: components must not query the DB directly — use src/lib/api/* (or src/lib/*) modules.
// Ratchet: the allowlist below may only shrink. New `.from('table')` calls in
// src/components fail here; migrated files must be removed from the allowlist.
import { test } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'

const ALLOWLIST = new Set([
  'src/components/dashboard/HealthAlertBanner.tsx',
  'src/components/dashboard/NotificationBell.tsx',
  'src/components/dashboard/WorkoutPlanCard.tsx',
  'src/components/insights/CorrelationsBlock.tsx',
  'src/components/intake/QuickLog.tsx',
  'src/components/nutrition/MealLogger.tsx',
  'src/components/nutrition/NutritionScreen.tsx',
  'src/components/research/ExperimentsScreen.tsx',
  'src/components/settings/DoctorReport.tsx',
  'src/components/settings/WorkoutScheduleSettings.tsx',
  'src/components/settings/sections/CalSyncSection.tsx',
  'src/components/settings/sections/EnvironmentSection.tsx',
  'src/components/settings/sections/TelegramSection.tsx',
  'src/components/supplements/AdherenceBlock.tsx',
  'src/components/supplements/TreatmentTracker.tsx',
])

const grep = () => {
  try {
    return execSync(
      String.raw`grep -rln --include='*.ts' --include='*.tsx' -E "\.from\(['\"]" src/components | grep -v '\.test\.'`,
      { encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

test('direct DB queries in components only where allowlisted', () => {
  const offenders = grep()
  const fresh = offenders.filter((f) => !ALLOWLIST.has(f))
  assert.deepEqual(fresh, [], `direct .from() outside allowlist (move to src/lib/api/*): ${fresh.join(', ')}`)
  const stale = [...ALLOWLIST].filter((f) => !offenders.includes(f))
  assert.deepEqual(stale, [], `allowlist entries now clean — remove them: ${stale.join(', ')}`)
})
```

- [ ] **Step 1.2: Run it — must pass (all 15 offenders allowlisted, none stale)**

Run: `node --test scripts/components-db-guard.test.mjs`
Expected: PASS (1 test). If it fails on a stale/fresh entry, the allowlist above is out of date — re-grep and fix the list, not the regex.

- [ ] **Step 1.3: Commit**

```bash
git add scripts/components-db-guard.test.mjs
git commit -m "test(client): ratchet guard — no direct DB queries in components"
```

### Task 2: API module `src/lib/api/settings.ts` (TDD)

**Files:**
- Create: `src/lib/api/settings.ts`
- Test: `src/lib/api/settings.test.ts` (node project — no DOM needed)

Eight functions covering all 13 query sites. Types re-use `DayTimes` from `src/lib/workoutPlan` and `Json` from `src/lib/database.types`.

- [ ] **Step 2.1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Recording mock for the supabase query builder: every method call is captured
// as [method, args]; awaiting the chain resolves with the stubbed response.
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
    for (const m of ['select', 'eq', 'gte', 'order', 'insert', 'update', 'upsert', 'delete', 'maybeSingle']) p[m] = record(m)
    ;(p as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(state.response).then(res)
    return p
  }
  return { supabase: { from: (t: string) => chain(t) } }
})

import {
  getActiveTelegramLink, createTelegramLinkToken, pauseTelegramLink,
  getWorkoutSchedule, saveWorkoutSchedule,
  getCalSyncStatus,
  getProfileLocation, saveProfileLocation, updateLocationLabel,
  getSupplementLogsSince,
} from './settings'

beforeEach(() => {
  state.calls.length = 0
  state.response = { data: null, error: null }
})

const steps = (i = 0) => Object.fromEntries(state.calls[i].steps)

describe('telegram link', () => {
  it('getActiveTelegramLink queries active link and returns it', async () => {
    state.response = { data: { telegram_username: 'gleb' }, error: null }
    const link = await getActiveTelegramLink('u1')
    expect(state.calls[0].table).toBe('telegram_links')
    expect(state.calls[0].steps).toContainEqual(['eq', ['user_id', 'u1']])
    expect(state.calls[0].steps).toContainEqual(['eq', ['status', 'active']])
    expect(link).toEqual({ telegram_username: 'gleb' })
  })

  it('getActiveTelegramLink returns null when no link', async () => {
    expect(await getActiveTelegramLink('u1')).toBeNull()
  })

  it('createTelegramLinkToken inserts a 16-char token with 10-min expiry and returns it', async () => {
    const before = Date.now()
    const token = await createTelegramLinkToken('u1')
    expect(token).toMatch(/^[0-9a-f]{16}$/)
    expect(state.calls[0].table).toBe('telegram_link_tokens')
    const [, [row]] = state.calls[0].steps.find(([m]) => m === 'insert')!
    const r = row as { token: string; user_id: string; expires_at: string }
    expect(r.token).toBe(token)
    expect(r.user_id).toBe('u1')
    const ttlMin = (new Date(r.expires_at).getTime() - before) / 60000
    expect(ttlMin).toBeGreaterThan(9)
    expect(ttlMin).toBeLessThan(11)
  })

  it('pauseTelegramLink updates status for the user', async () => {
    await pauseTelegramLink('u1')
    expect(state.calls[0].table).toBe('telegram_links')
    expect(state.calls[0].steps).toContainEqual(['update', [{ status: 'paused' }]])
    expect(state.calls[0].steps).toContainEqual(['eq', ['user_id', 'u1']])
  })
})

describe('workout schedule', () => {
  it('getWorkoutSchedule maps day_times and returns the row', async () => {
    state.response = { data: { day_times: { '1': { time: '19:00' } }, notify_hours_before: 4, enabled: true }, error: null }
    const ws = await getWorkoutSchedule()
    expect(state.calls[0].table).toBe('workout_schedule')
    expect(ws).toEqual({ day_times: { '1': { time: '19:00' } }, notify_hours_before: 4, enabled: true })
  })

  it('getWorkoutSchedule defaults null day_times to {} and returns null on no row', async () => {
    state.response = { data: { day_times: null, notify_hours_before: 4, enabled: true }, error: null }
    expect((await getWorkoutSchedule())!.day_times).toEqual({})
    state.response = { data: null, error: null }
    expect(await getWorkoutSchedule()).toBeNull()
  })

  it('saveWorkoutSchedule upserts with user_id and timezone, returns success', async () => {
    const ok = await saveWorkoutSchedule('u1', { day_times: {}, notify_hours_before: 4, enabled: true })
    expect(ok).toBe(true)
    expect(state.calls[0].table).toBe('workout_schedule')
    const [, [row]] = state.calls[0].steps.find(([m]) => m === 'upsert')!
    const r = row as Record<string, unknown>
    expect(r.user_id).toBe('u1')
    expect(typeof r.timezone).toBe('string')
    expect((r.timezone as string).length).toBeGreaterThan(0)
  })

  it('saveWorkoutSchedule returns false on error', async () => {
    state.response = { data: null, error: { message: 'boom' } }
    expect(await saveWorkoutSchedule('u1', { day_times: {}, notify_hours_before: 4, enabled: true })).toBe(false)
  })
})

describe('cal sync + profile location', () => {
  it('getCalSyncStatus returns the row or null', async () => {
    const row = { cal_email: 'a@b.c', last_sync_at: null, last_status: null, event_count: 3, enabled: true }
    state.response = { data: row, error: null }
    expect(await getCalSyncStatus('u1')).toEqual(row)
    expect(state.calls[0].table).toBe('cal_sync')
    expect(state.calls[0].steps).toContainEqual(['eq', ['user_id', 'u1']])
  })

  it('getProfileLocation selects label and coords by profile id', async () => {
    const row = { location_label: 'Kyiv', latitude: 50.4, longitude: 30.5 }
    state.response = { data: row, error: null }
    expect(await getProfileLocation('u1')).toEqual(row)
    expect(state.calls[0].table).toBe('profiles')
    expect(state.calls[0].steps).toContainEqual(['eq', ['id', 'u1']])
  })

  it('saveProfileLocation upserts and returns null on success, message on error', async () => {
    expect(await saveProfileLocation('u1', { latitude: 1, longitude: 2, label: 'X' })).toBeNull()
    expect(state.calls[0].steps).toContainEqual(['upsert', [{ id: 'u1', latitude: 1, longitude: 2, location_label: 'X' }]])
    state.response = { data: null, error: { message: 'denied' } }
    expect(await saveProfileLocation('u1', { latitude: 1, longitude: 2, label: 'X' })).toBe('denied')
  })

  it('updateLocationLabel updates only the label', async () => {
    await updateLocationLabel('u1', 'Kyiv')
    expect(state.calls[0].table).toBe('profiles')
    expect(state.calls[0].steps).toContainEqual(['update', [{ location_label: 'Kyiv' }]])
    expect(state.calls[0].steps).toContainEqual(['eq', ['id', 'u1']])
  })
})

describe('supplement logs', () => {
  it('getSupplementLogsSince filters by user and date, returns [] on null', async () => {
    state.response = { data: [{ supplement_id: 's1', date: '2026-01-01', taken: true }], error: null }
    const logs = await getSupplementLogsSince('u1', '2026-01-01')
    expect(logs).toHaveLength(1)
    expect(state.calls[0].table).toBe('supplement_logs')
    expect(state.calls[0].steps).toContainEqual(['eq', ['user_id', 'u1']])
    expect(state.calls[0].steps).toContainEqual(['gte', ['date', '2026-01-01']])
    state.response = { data: null, error: null }
    expect(await getSupplementLogsSince('u1', '2026-01-01')).toEqual([])
  })
})
```

- [ ] **Step 2.2: Run tests — must fail (module missing)**

Run: `npx vitest run src/lib/api/settings.test.ts`
Expected: FAIL — cannot resolve `./settings`.

- [ ] **Step 2.3: Implement the module**

```ts
import { supabase } from '../supabase'
import type { Json } from '../database.types'
import type { DayTimes } from '../workoutPlan'

// Settings-feature data access. Components in src/components/settings must not
// query Supabase directly (see scripts/components-db-guard.test.mjs) — every
// table read/write for this feature lives here.

// ── Telegram link ────────────────────────────────────────────────────────────

export interface TelegramLink { telegram_username: string | null }

export async function getActiveTelegramLink(userId: string): Promise<TelegramLink | null> {
  const { data } = await supabase.from('telegram_links')
    .select('telegram_username')
    .eq('user_id', userId).eq('status', 'active').maybeSingle()
  return data ?? null
}

/** Creates a one-time deep-link token (10-min TTL) and returns it. */
export async function createTelegramLinkToken(userId: string): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  await supabase.from('telegram_link_tokens').insert({ token, user_id: userId, expires_at: expires })
  return token
}

export async function pauseTelegramLink(userId: string): Promise<void> {
  await supabase.from('telegram_links').update({ status: 'paused' }).eq('user_id', userId)
}

// ── Workout schedule ─────────────────────────────────────────────────────────

export interface WorkoutSchedule {
  day_times: DayTimes
  notify_hours_before: number
  enabled: boolean
}

export async function getWorkoutSchedule(): Promise<WorkoutSchedule | null> {
  const { data } = await supabase.from('workout_schedule')
    .select('day_times, notify_hours_before, enabled')
    .maybeSingle()
  if (!data) return null
  return { ...data, day_times: (data.day_times ?? {}) as unknown as DayTimes }
}

export async function saveWorkoutSchedule(userId: string, ws: WorkoutSchedule): Promise<boolean> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'
  const { error } = await supabase.from('workout_schedule')
    .upsert({ user_id: userId, ...ws, day_times: ws.day_times as unknown as Json, timezone })
  return !error
}

// ── Cal.com sync status ──────────────────────────────────────────────────────

export interface CalSyncStatus {
  cal_email: string | null
  last_sync_at: string | null
  last_status: string | null
  event_count: number | null
  enabled: boolean
}

export async function getCalSyncStatus(userId: string): Promise<CalSyncStatus | null> {
  const { data } = await supabase.from('cal_sync')
    .select('cal_email, last_sync_at, last_status, event_count, enabled')
    .eq('user_id', userId).maybeSingle()
  return data ?? null
}

// ── Profile location (environment data) ──────────────────────────────────────

export interface ProfileLocation {
  location_label: string | null
  latitude: number | null
  longitude: number | null
}

export async function getProfileLocation(userId: string): Promise<ProfileLocation | null> {
  const { data } = await supabase.from('profiles')
    .select('location_label, latitude, longitude')
    .eq('id', userId).maybeSingle()
  return data ?? null
}

/** Returns an error message on failure, null on success. */
export async function saveProfileLocation(
  userId: string,
  loc: { latitude: number; longitude: number; label: string },
): Promise<string | null> {
  const { error } = await supabase.from('profiles')
    .upsert({ id: userId, latitude: loc.latitude, longitude: loc.longitude, location_label: loc.label })
  return error ? error.message : null
}

export async function updateLocationLabel(userId: string, label: string): Promise<void> {
  await supabase.from('profiles').update({ location_label: label }).eq('id', userId)
}

// ── Supplement adherence logs (doctor report) ────────────────────────────────

export interface SupplementAdherenceLog { supplement_id: string; date: string; taken: boolean }

export async function getSupplementLogsSince(userId: string, sinceDate: string): Promise<SupplementAdherenceLog[]> {
  const { data } = await supabase.from('supplement_logs')
    .select('supplement_id, date, taken')
    .eq('user_id', userId)
    .gte('date', sinceDate)
  return (data ?? []) as SupplementAdherenceLog[]
}
```

- [ ] **Step 2.4: Run tests — must pass**

Run: `npx vitest run src/lib/api/settings.test.ts`
Expected: PASS (all tests).

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/api/settings.ts src/lib/api/settings.test.ts
git commit -m "feat(client): settings data-access module src/lib/api/settings.ts"
```

### Task 3: Migrate TelegramSection + component test

**Files:**
- Modify: `src/components/settings/sections/TelegramSection.tsx`
- Create: `src/components/settings/sections/TelegramSection.test.tsx`
- Modify: `scripts/components-db-guard.test.mjs` (remove the file from the allowlist)

- [ ] **Step 3.1: Write the failing component test**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../../test/utils'

const api = vi.hoisted(() => ({
  getActiveTelegramLink: vi.fn(),
  createTelegramLinkToken: vi.fn(),
  pauseTelegramLink: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../lib/api/settings', () => api)
vi.mock('../../../lib/dailyNote', () => ({
  loadDailyNoteSettings: vi.fn().mockResolvedValue({ enabled: false, time: '21:00' }),
  saveDailyNoteSettings: vi.fn().mockResolvedValue(true),
}))
vi.mock('../../../lib/reportSettings', () => ({
  loadReportSettings: vi.fn().mockResolvedValue(null),
  saveReportSettings: vi.fn().mockResolvedValue(true),
}))

import { TelegramSection } from './TelegramSection'

const user = { id: 'u1' } as User
const renderSection = () => renderWithProviders(
  <TelegramSection user={user} archivedTelegram={false} archivedReports={false} onArchive={() => {}} />,
)

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('TelegramSection', () => {
  it('shows connect button when no active link', async () => {
    api.getActiveTelegramLink.mockResolvedValue(null)
    renderSection()
    expect(await screen.findByRole('button', { name: /Подключить Telegram/ })).toBeInTheDocument()
  })

  it('shows username and disconnects via the API module', async () => {
    api.getActiveTelegramLink.mockResolvedValue({ telegram_username: 'gleb' })
    renderSection()
    expect(await screen.findByText(/@gleb/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Отключить/ }))
    await waitFor(() => expect(api.pauseTelegramLink).toHaveBeenCalledWith('u1'))
    expect(await screen.findByRole('button', { name: /Подключить Telegram/ })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3.2: Run it — must fail (component still queries supabase directly)**

Run: `npx vitest run src/components/settings/sections/TelegramSection.test.tsx`
Expected: FAIL — the real `../../../lib/supabase` import is not mocked, so the mount effect throws / никакой `getActiveTelegramLink` не вызывается.

- [ ] **Step 3.3: Migrate the component**

In `TelegramSection.tsx`:

Replace the import of `supabase`:
```tsx
// remove: import { supabase } from '../../../lib/supabase'
import { getActiveTelegramLink, createTelegramLinkToken, pauseTelegramLink } from '../../../lib/api/settings'
```

Mount effect — replace the `telegram_links` query:
```tsx
  useEffect(() => {
    getActiveTelegramLink(user.id).then(link => {
      if (link) { setTgLinked(true); setTgUsername(link.telegram_username) }
    })
    loadDailyNoteSettings(user.id).then(s => { setNoteEnabled(s.enabled); setNoteTime(s.time) }).catch(() => {})
    loadReportSettings(user.id).then(setRep).catch(() => {})
  }, [user.id])
```

`handleTgConnect` — token creation and the 3-second poll go through the module:
```tsx
  async function handleTgConnect() {
    setTgLinking(true)
    setTgMsg(null)
    try {
      const token = await createTelegramLinkToken(user.id)
      const botName = import.meta.env.VITE_TELEGRAM_BOT_NAME ?? 'tonus_health_bot'
      const url = `https://t.me/${botName}?start=${token}`
      window.open(url, '_blank')
      setTgMsg('Открыли Telegram. После нажатия Start аккаунт привяжется автоматически.')
      // Poll for 60s
      const interval = setInterval(async () => {
        const link = await getActiveTelegramLink(user.id)
        if (link) { setTgLinked(true); setTgUsername(link.telegram_username); setTgMsg(null); clearInterval(interval) }
      }, 3000)
      setTimeout(() => clearInterval(interval), 60000)
    } catch (e) {
      setTgMsg(`Ошибка: ${(e as Error).message}`)
    }
    setTgLinking(false)
  }
```

`handleTgDisconnect`:
```tsx
  async function handleTgDisconnect() {
    await pauseTelegramLink(user.id)
    setTgLinked(false)
    setTgUsername(null)
    setTgMsg('Telegram отключён.')
  }
```

- [ ] **Step 3.4: Remove the file from the guard allowlist**

In `scripts/components-db-guard.test.mjs` delete the line:
```js
  'src/components/settings/sections/TelegramSection.tsx',
```

- [ ] **Step 3.5: Run tests — component test and guard must pass**

Run: `npx vitest run src/components/settings/sections/TelegramSection.test.tsx && node --test scripts/components-db-guard.test.mjs`
Expected: both PASS.

- [ ] **Step 3.6: Commit**

```bash
git add src/components/settings/sections/TelegramSection.tsx src/components/settings/sections/TelegramSection.test.tsx scripts/components-db-guard.test.mjs
git commit -m "refactor(settings): TelegramSection via api module + component test"
```

### Task 4: Migrate WorkoutScheduleSettings + component test

**Files:**
- Modify: `src/components/settings/WorkoutScheduleSettings.tsx`
- Create: `src/components/settings/WorkoutScheduleSettings.test.tsx`
- Modify: `scripts/components-db-guard.test.mjs`

- [ ] **Step 4.1: Write the failing component test**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({
  getWorkoutSchedule: vi.fn(),
  saveWorkoutSchedule: vi.fn().mockResolvedValue(true),
}))
vi.mock('../../lib/api/settings', () => api)
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))

import { WorkoutScheduleSettings } from './WorkoutScheduleSettings'

const user = { id: 'u1' } as User

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('WorkoutScheduleSettings', () => {
  it('loads the schedule and marks configured days', async () => {
    api.getWorkoutSchedule.mockResolvedValue({ day_times: { '1': { time: '19:00' } }, notify_hours_before: 4, enabled: true })
    renderWithProviders(<WorkoutScheduleSettings user={user} />)
    const mon = await screen.findByRole('button', { name: 'Пн' })
    await waitFor(() => expect(mon.className).toMatch(/\bon\b/))
  })

  it('toggling a day saves through the API module', async () => {
    api.getWorkoutSchedule.mockResolvedValue({ day_times: {}, notify_hours_before: 4, enabled: true })
    renderWithProviders(<WorkoutScheduleSettings user={user} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Вт' }))
    await waitFor(() => expect(api.saveWorkoutSchedule).toHaveBeenCalledWith('u1', expect.objectContaining({
      day_times: { '2': { time: '19:00' } },
    })))
  })
})
```

- [ ] **Step 4.2: Run it — must fail**

Run: `npx vitest run src/components/settings/WorkoutScheduleSettings.test.tsx`
Expected: FAIL (unmocked supabase client in the component).

- [ ] **Step 4.3: Migrate the component**

In `WorkoutScheduleSettings.tsx`:

Imports — drop `supabase` and `Json`, add the module (local `ScheduleState` is replaced by the module's `WorkoutSchedule`):
```tsx
// remove: import { supabase } from '../../lib/supabase'
// remove: import type { Json } from '../../lib/database.types'
// remove the local `interface ScheduleState { ... }` block
import { getWorkoutSchedule, saveWorkoutSchedule, type WorkoutSchedule } from '../../lib/api/settings'
```

State + load effect:
```tsx
  const [ws, setWs] = useState<WorkoutSchedule>(() => demo ? makeDemoWorkoutSchedule() : { day_times: {}, notify_hours_before: 4, enabled: true })
  const [loaded, setLoaded] = useState(() => demo)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (demo) return
    getWorkoutSchedule().then(data => {
      if (data) setWs(data)
      setLoaded(true)
    })
  }, [demo])
```

Save path (timezone now computed inside the module):
```tsx
  const patch = (p: Partial<WorkoutSchedule>) => {
    const next = { ...ws, ...p }
    setWs(next)
    if (demo) return
    saveWorkoutSchedule(user.id, next).then(ok => {
      if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1500) }
    })
  }
```

`toggleDay` / `patchDay` and the JSX stay unchanged (they only use `ws`/`patch`). Note: `makeDemoWorkoutSchedule()` returns the same shape — if tsc complains about `DayTimes`, its return type already matches `WorkoutSchedule`.

- [ ] **Step 4.4: Remove from the guard allowlist**

Delete `'src/components/settings/WorkoutScheduleSettings.tsx',` from `scripts/components-db-guard.test.mjs`.

- [ ] **Step 4.5: Run tests**

Run: `npx vitest run src/components/settings/WorkoutScheduleSettings.test.tsx && node --test scripts/components-db-guard.test.mjs`
Expected: both PASS.

- [ ] **Step 4.6: Commit**

```bash
git add src/components/settings/WorkoutScheduleSettings.tsx src/components/settings/WorkoutScheduleSettings.test.tsx scripts/components-db-guard.test.mjs
git commit -m "refactor(settings): WorkoutScheduleSettings via api module + component test"
```

### Task 5: Migrate CalSyncSection + component test

**Files:**
- Modify: `src/components/settings/sections/CalSyncSection.tsx`
- Create: `src/components/settings/sections/CalSyncSection.test.tsx`
- Modify: `scripts/components-db-guard.test.mjs`

- [ ] **Step 5.1: Write the failing component test**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, cleanup } from '../../../test/utils'

const api = vi.hoisted(() => ({ getCalSyncStatus: vi.fn() }))
vi.mock('../../../lib/api/settings', () => api)
vi.mock('../../../lib/edgeFunctions', () => ({ callFunction: vi.fn().mockResolvedValue({}) }))

import { CalSyncSection } from './CalSyncSection'

const user = { id: 'u1' } as User
const renderSection = () => renderWithProviders(
  <CalSyncSection archived={false} onArchive={() => {}} user={user} />,
)

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('CalSyncSection', () => {
  it('shows the connected account in compact view', async () => {
    api.getCalSyncStatus.mockResolvedValue({
      cal_email: 'gleb@cal.com', last_sync_at: '2026-07-16T10:00:00Z', last_status: 'ok', event_count: 12, enabled: true,
    })
    renderSection()
    expect(await screen.findByText(/gleb@cal\.com/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Сменить аккаунт/ })).toBeInTheDocument()
    // login form is hidden in compact view
    expect(screen.queryByPlaceholderText('email@cal.com')).toBeNull()
  })

  it('shows the login form when nothing is connected', async () => {
    api.getCalSyncStatus.mockResolvedValue(null)
    renderSection()
    expect(await screen.findByPlaceholderText('email@cal.com')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5.2: Run it — must fail**

Run: `npx vitest run src/components/settings/sections/CalSyncSection.test.tsx`
Expected: FAIL (unmocked supabase client).

- [ ] **Step 5.3: Migrate the component**

In `CalSyncSection.tsx`:

Imports — replace `supabase` with the module; the local `CalStatus` type is replaced by the module's `CalSyncStatus`:
```tsx
// remove: import { supabase } from '../../../lib/supabase'
// remove the local `type CalStatus = { ... }` line
import { getCalSyncStatus, type CalSyncStatus } from '../../../lib/api/settings'
```

State: `const [calStatus, setCalStatus] = useState<CalSyncStatus | null>(null)`

Both query sites collapse onto one function:
```tsx
  async function refreshCalStatus() {
    setCalStatus(await getCalSyncStatus(user.id))
  }

  useEffect(() => {
    getCalSyncStatus(user.id).then(setCalStatus)
  }, [user.id])
```

Everything else (handlers using `callFunction`, JSX) stays unchanged.

- [ ] **Step 5.4: Remove from the guard allowlist**

Delete `'src/components/settings/sections/CalSyncSection.tsx',` from the guard.

- [ ] **Step 5.5: Run tests**

Run: `npx vitest run src/components/settings/sections/CalSyncSection.test.tsx && node --test scripts/components-db-guard.test.mjs`
Expected: both PASS.

- [ ] **Step 5.6: Commit**

```bash
git add src/components/settings/sections/CalSyncSection.tsx src/components/settings/sections/CalSyncSection.test.tsx scripts/components-db-guard.test.mjs
git commit -m "refactor(settings): CalSyncSection via api module + component test"
```

### Task 6: Migrate EnvironmentSection + component test

**Files:**
- Modify: `src/components/settings/sections/EnvironmentSection.tsx`
- Create: `src/components/settings/sections/EnvironmentSection.test.tsx`
- Modify: `scripts/components-db-guard.test.mjs`

Non-Supabase fetches (open-meteo geocoding, BigDataCloud reverse geocode) stay in the component — the module owns only DB access.

- [ ] **Step 6.1: Write the failing component test**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, cleanup } from '../../../test/utils'

const api = vi.hoisted(() => ({
  getProfileLocation: vi.fn(),
  saveProfileLocation: vi.fn().mockResolvedValue(null),
  updateLocationLabel: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../lib/api/settings', () => api)
vi.mock('../../../lib/edgeFunctions', () => ({ callFunction: vi.fn().mockResolvedValue({}) }))

import { EnvironmentSection } from './EnvironmentSection'

const user = { id: 'u1' } as User
const renderSection = () => renderWithProviders(
  <EnvironmentSection archived={false} onArchive={() => {}} user={user} />,
)

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('EnvironmentSection', () => {
  it('shows the saved location label', async () => {
    // null coords → the label-refresh geocoder path is skipped, no fetch needed
    api.getProfileLocation.mockResolvedValue({ location_label: 'Kyiv, Ukraine', latitude: null, longitude: null })
    renderSection()
    expect(await screen.findByText('Kyiv, Ukraine')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Обновить сейчас/ })).toBeInTheDocument()
  })

  it('offers location pick when no profile location', async () => {
    api.getProfileLocation.mockResolvedValue(null)
    renderSection()
    expect(await screen.findByRole('button', { name: /Определить автоматически/ })).toBeInTheDocument()
  })
})
```

- [ ] **Step 6.2: Run it — must fail**

Run: `npx vitest run src/components/settings/sections/EnvironmentSection.test.tsx`
Expected: FAIL (unmocked supabase client).

- [ ] **Step 6.3: Migrate the component**

In `EnvironmentSection.tsx`:

Imports:
```tsx
// remove: import { supabase } from '../../../lib/supabase'
import { getProfileLocation, saveProfileLocation, updateLocationLabel } from '../../../lib/api/settings'
```

`handleLocationPick`:
```tsx
  async function handleLocationPick(r: LocResult) {
    const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ')
    const err = await saveProfileLocation(user.id, { latitude: r.latitude, longitude: r.longitude, label })
    if (err) { setLocMsg(`${t('Ошибка')}: ${err}`); return }
    setLocLabel(label); setLocResults([]); setLocQuery(''); setEditingLoc(false); setLocMsg(`✅ ${t('Локация определена')}`)
  }
```

`handleUseMyLocation` — the geolocation success callback's save block becomes:
```tsx
        const err = await saveProfileLocation(user.id, { latitude, longitude, label })
        setLocLocating(false)
        if (err) { setLocMsg(`${t('Ошибка')}: ${err}`); return }
        setLocLabel(label); setLocResults([]); setLocQuery(''); setEditingLoc(false); setLocMsg(`✅ ${t('Локация определена')}`)
```
(the BigDataCloud `fetch` above it stays as is).

Label-refresh effect:
```tsx
  useEffect(() => {
    let cancelled = false
    getProfileLocation(user.id).then(async data => {
      if (cancelled || !data) return
      if (data.location_label) setLocLabel(data.location_label)
      if (data.latitude == null || data.longitude == null) return
      try {
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${data.latitude}&longitude=${data.longitude}&localityLanguage=${lang}`)
        const g = await res.json()
        const parts = [g.city || g.locality, g.principalSubdivision, g.countryName].filter(Boolean)
        const label = parts.join(', ')
        if (!cancelled && label && label !== data.location_label) {
          setLocLabel(label)
          await updateLocationLabel(user.id, label)
        }
      } catch { /* no network/geocoder — keep the stored label */ }
    })
    return () => { cancelled = true }
  }, [user.id, lang])
```
(keep the existing Russian explainer comment above the effect; drop the inner "без await builder…" comment — it described the query builder, which is gone).

- [ ] **Step 6.4: Remove from the guard allowlist**

Delete `'src/components/settings/sections/EnvironmentSection.tsx',` from the guard.

- [ ] **Step 6.5: Run tests**

Run: `npx vitest run src/components/settings/sections/EnvironmentSection.test.tsx && node --test scripts/components-db-guard.test.mjs`
Expected: both PASS.

- [ ] **Step 6.6: Commit**

```bash
git add src/components/settings/sections/EnvironmentSection.tsx src/components/settings/sections/EnvironmentSection.test.tsx scripts/components-db-guard.test.mjs
git commit -m "refactor(settings): EnvironmentSection via api module + component test"
```

### Task 7: Migrate DoctorReport

**Files:**
- Modify: `src/components/settings/DoctorReport.tsx`
- Modify: `scripts/components-db-guard.test.mjs`

Single query site; the report logic already has unit tests (`src/lib/doctorReport.test.ts`, `src/components/settings/DoctorReport.test.ts`), so no new component test — just the migration.

- [ ] **Step 7.1: Migrate the component**

Imports:
```tsx
// remove: import { supabase } from '../../lib/supabase'
import { getSupplementLogsSince, type SupplementAdherenceLog } from '../../lib/api/settings'
```

Delete the local `interface AdhLog { supplement_id: string; date: string; taken: boolean }` and replace its uses (`useState<AdhLog[]>`, `as AdhLog[]`) with `SupplementAdherenceLog`.

In the load effect, replace the query:
```tsx
    if (!isDemoActive()) {
      getSupplementLogsSince(user.id, addDays(localDate(), -365)).then(setAdhLogs)
    }
```

The demo lazy initializer keeps its cast target: `as SupplementAdherenceLog[]`.

- [ ] **Step 7.2: Remove from the guard allowlist**

Delete `'src/components/settings/DoctorReport.tsx',` from the guard. The settings block of the allowlist is now empty — 10 files remain.

- [ ] **Step 7.3: Run the guard and the existing DoctorReport tests**

Run: `node --test scripts/components-db-guard.test.mjs && npx vitest run src/components/settings/DoctorReport.test.ts`
Expected: both PASS.

- [ ] **Step 7.4: Commit**

```bash
git add src/components/settings/DoctorReport.tsx scripts/components-db-guard.test.mjs
git commit -m "refactor(settings): DoctorReport adherence logs via api module"
```

### Task 8: Spec status + full gate + PR

**Files:**
- Modify: `docs/superpowers/specs/2026-07-16-tech-debt-workstream-b.md` (status table)

- [ ] **Step 8.1: Update the spec status table**

In the `## Order and status` table change the B2 row to:
```markdown
| B2 data layer + component tests | L (per-feature PRs) | in progress — settings migrated (guard 15→10) |
```

- [ ] **Step 8.2: Full verification gate**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
export PATH="$HOME/.deno/bin:$PATH"
npm test && npm run test:scripts && npm run build && npm run lint:ceiling && npm run check:functions
```
Expected: vitest fully green (~575 tests + the new API/component tests), scripts tests green (both guards), build OK, both ceilings hold.

- [ ] **Step 8.3: Commit, push, PR**

```bash
git add docs/superpowers/specs/2026-07-16-tech-debt-workstream-b.md
git commit -m "docs(spec): mark B2 in progress — settings feature migrated"
git push -u origin feat/data-api-settings
gh pr create --title "refactor(settings): data-access layer + component tests (B2 feature 1)" --body "..."
```

PR body should cover: the new `src/lib/api/settings.ts` module (8 functions, 13 query sites migrated), the `components-db-guard` ratchet (allowlist 15 → 10), new tests (API module + 4 section component tests), and note that no edge functions changed (no redeploy needed).

- [ ] **Step 8.4: Merge on green CI**

Watch CI (`gh pr checks --watch`); merge when green (`gh pr merge --squash --delete-branch` — match the repo's usual merge style: check `gh pr view 88 --json mergedBy,mergeCommit` if unsure). Green CI on `main` triggers the Vercel deploy hook automatically; edge functions are untouched.

---

## Self-review notes

- **Spec coverage:** B2 requires (a) per-feature API module — Task 2; (b) components call it — Tasks 3–7; (c) ratchet guard on `.from(` in components — Task 1; (d) component tests via `renderWithProviders` — Tasks 3–6 (DoctorReport covered by existing logic tests; SettingsScreen itself already has a characterization test).
- **Guard regex** `\.from\(['"]` deliberately requires a string-literal argument: catches every Supabase query (`.from('table')`) including multiline chains (`supabase\n .from('x')`), skips `Array.from({...})` / `Array.from(arr)`.
- **Behavior deltas (intentional, invisible):** TelegramSection mount query no longer selects the unused `telegram_chat_id` column; CalSync mount effect and `refreshCalStatus` now share one function. Everything else is a mechanical move.
- **`SettingsScreen.characterization.test.tsx`** mocks `lib/supabase` globally and stubs child components — it stays valid; child sections it does render (Telegram/CalSync/Environment) now go through the api module, which hits the same supabase mock through real module code. If it flakes after migration, add `vi.mock` for `../../lib/api/settings` returning resolved nulls — but expect no change needed since the api module uses the same mocked client.
  — Correction: the characterization test mocks `../../lib/supabase`, and vitest module mocks apply app-wide for the test file, so `src/lib/api/settings.ts` imports the mocked client too. No change expected.
- **Type consistency check:** `WorkoutSchedule` (module) replaces `ScheduleState` (component) — same shape `{ day_times: DayTimes; notify_hours_before: number; enabled: boolean }`. `CalSyncStatus` replaces `CalStatus` — same fields. `SupplementAdherenceLog` replaces `AdhLog` — same fields. Function names used in component tasks match Task 2 exports exactly.
