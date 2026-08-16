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
    for (const m of ['select', 'eq', 'gte', 'order', 'range', 'insert', 'update', 'upsert', 'delete', 'maybeSingle']) p[m] = record(m)
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
  syncProfileTimezone,
  syncProfileLang,
  loadProfileBasics, saveProfileBasics,
  getSupplementLogsSince,
} from './settings'

beforeEach(() => {
  state.calls.length = 0
  state.response = { data: null, error: null }
})

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

  it('syncProfileTimezone upserts the device IANA timezone into the profile', async () => {
    await syncProfileTimezone('u1')
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(tz).toBeTruthy() // sanity: node resolves a real zone in tests
    expect(state.calls[0].table).toBe('profiles')
    expect(state.calls[0].steps).toContainEqual(['upsert', [{ id: 'u1', timezone: tz }]])
  })

  it('syncProfileLang mirrors the UI language into the profile', async () => {
    await syncProfileLang('u1', 'uk')
    expect(state.calls[0].table).toBe('profiles')
    expect(state.calls[0].steps).toContainEqual(['upsert', [{ id: 'u1', lang: 'uk' }]])
  })

  it('updateLocationLabel updates only the label', async () => {
    await updateLocationLabel('u1', 'Kyiv')
    expect(state.calls[0].table).toBe('profiles')
    expect(state.calls[0].steps).toContainEqual(['update', [{ location_label: 'Kyiv' }]])
    expect(state.calls[0].steps).toContainEqual(['eq', ['id', 'u1']])
  })

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
})

describe('supplement logs', () => {
  it('getSupplementLogsSince filters by user and date, returns [] on null', async () => {
    state.response = { data: [{ supplement_id: 's1', date: '2026-01-01', taken: true }], error: null }
    const logs = await getSupplementLogsSince('u1', '2026-01-01')
    expect(logs).toHaveLength(1)
    expect(state.calls[0].table).toBe('supplement_logs')
    expect(state.calls[0].steps).toContainEqual(['eq', ['user_id', 'u1']])
    expect(state.calls[0].steps).toContainEqual(['gte', ['date', '2026-01-01']])
    expect(state.calls[0].steps).toContainEqual(['range', [0, 999]])
    state.response = { data: null, error: null }
    expect(await getSupplementLogsSince('u1', '2026-01-01')).toEqual([])
  })
})
