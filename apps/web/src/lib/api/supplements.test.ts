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
    for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'insert', 'delete', 'single']) p[m] = record(m)
    ;(p as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(state.response).then(res)
    return p
  }
  return { supabase: { from: (t: string) => chain(t) } }
})

import {
  getAdherenceLogs, getTreatments, getSupplementOptions,
  getMetricDailyRows, createTreatment, deleteTreatment,
} from './supplements'

beforeEach(() => {
  state.calls.length = 0
  state.response = { data: null, error: null }
})

describe('getAdherenceLogs', () => {
  it('selects logs since the date (RLS scopes the user) and defaults to []', async () => {
    const rows = [{ supplement_id: 's1', date: '2026-07-01', taken: true }]
    state.response = { data: rows, error: null }
    expect(await getAdherenceLogs('2026-06-17')).toEqual(rows)
    expect(state.calls[0].table).toBe('supplement_logs')
    expect(state.calls[0].steps).toContainEqual(['gte', ['date', '2026-06-17']])
    state.response = { data: null, error: null }
    expect(await getAdherenceLogs('2026-06-17')).toEqual([])
  })
})

describe('treatments', () => {
  it('getTreatments orders by started_at desc for the user', async () => {
    await getTreatments('u1')
    expect(state.calls[0].table).toBe('treatments')
    expect(state.calls[0].steps).toContainEqual(['eq', ['user_id', 'u1']])
    expect(state.calls[0].steps).toContainEqual(['order', ['started_at', { ascending: false }]])
  })

  it('createTreatment inserts and returns the created row, null on error', async () => {
    const row = { id: 't1', user_id: 'u1', name: 'Mg', supplement_id: null, started_at: '2026-07-01', outcome_metrics: [], notes: null, created_at: 'x' }
    state.response = { data: row, error: null }
    const created = await createTreatment('u1', { supplement_id: null, name: 'Mg', started_at: '2026-07-01' })
    expect(created).toEqual(row)
    expect(state.calls[0].steps).toContainEqual(['insert', [{ user_id: 'u1', supplement_id: null, name: 'Mg', started_at: '2026-07-01' }]])
    expect(state.calls[0].steps.map(([m]) => m)).toContain('single')

    state.response = { data: null, error: { message: 'boom' } }
    expect(await createTreatment('u1', { supplement_id: null, name: 'Mg', started_at: '2026-07-01' })).toBeNull()
  })

  it('deleteTreatment deletes by id', async () => {
    await deleteTreatment('t1')
    expect(state.calls[0].table).toBe('treatments')
    expect(state.calls[0].steps.map(([m]) => m)).toContain('delete')
    expect(state.calls[0].steps).toContainEqual(['eq', ['id', 't1']])
  })
})

describe('getSupplementOptions', () => {
  it('selects id,name ordered by name', async () => {
    await getSupplementOptions('u1')
    expect(state.calls[0].table).toBe('supplements')
    expect(state.calls[0].steps).toContainEqual(['select', ['id, name']])
    expect(state.calls[0].steps).toContainEqual(['eq', ['user_id', 'u1']])
    expect(state.calls[0].steps).toContainEqual(['order', ['name']])
  })
})

describe('getMetricDailyRows', () => {
  it('reads the metric window and defaults to []', async () => {
    await getMetricDailyRows('u1', ['hrv', 'sleepHours'], '2026-06-01', '2026-07-01')
    expect(state.calls[0].table).toBe('metrics_daily')
    expect(state.calls[0].steps).toContainEqual(['in', ['metric', ['hrv', 'sleepHours']]])
    expect(state.calls[0].steps).toContainEqual(['gte', ['date', '2026-06-01']])
    expect(state.calls[0].steps).toContainEqual(['lte', ['date', '2026-07-01']])
    expect(await getMetricDailyRows('u1', ['hrv'], 'a', 'b')).toEqual([])
  })
})
