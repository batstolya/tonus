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
