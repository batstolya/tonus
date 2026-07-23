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
    for (const m of ['select', 'gte', 'order']) p[m] = record(m)
    ;(p as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(state.response).then(res)
    return p
  }
  return { supabase: { from: (t: string) => chain(t) } }
})

import { getEnvironmentDays } from './insights'

beforeEach(() => {
  state.calls.length = 0
  state.response = { data: null, error: null }
})

describe('getEnvironmentDays', () => {
  it('reads environment days since the date, ascending', async () => {
    const rows = [{ date: '2026-07-01', temp_c: 21, pressure_hpa: 1013, daylight_minutes: 900, precipitation_mm: 0, kp_index: 3 }]
    state.response = { data: rows, error: null }
    expect(await getEnvironmentDays('2026-06-01')).toEqual(rows)
    expect(state.calls[0].table).toBe('environment_daily')
    const steps = state.calls[0].steps
    expect(steps).toContainEqual(['select', ['date, temp_c, pressure_hpa, daylight_minutes, precipitation_mm, kp_index']])
    expect(steps).toContainEqual(['gte', ['date', '2026-06-01']])
    expect(steps).toContainEqual(['order', ['date']])
  })

  it('returns [] when there is no data', async () => {
    expect(await getEnvironmentDays('2026-06-01')).toEqual([])
  })
})
