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
    for (const m of ['select', 'eq', 'gte', 'order', 'insert', 'delete', 'single']) p[m] = record(m)
    ;(p as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(state.response).then(res)
    return p
  }
  return { supabase: { from: (t: string) => chain(t) } }
})

import { createIntakeEvent, deleteIntakeEvent, getMeals, createMealEvent } from './intake'

beforeEach(() => {
  state.calls.length = 0
  state.response = { data: null, error: null }
})

describe('createIntakeEvent', () => {
  it('inserts and returns the created row, null on error', async () => {
    const row = { id: 'e1', ts: '2026-07-17T10:00:00Z', type: 'coffee', amount: 200, unit: 'мл', note: null }
    state.response = { data: row, error: null }
    const created = await createIntakeEvent('u1', { ts: row.ts, type: 'coffee', amount: 200, unit: 'мл', note: null })
    expect(created).toEqual(row)
    expect(state.calls[0].table).toBe('intake_events')
    expect(state.calls[0].steps).toContainEqual(['insert', [{
      user_id: 'u1', ts: row.ts, type: 'coffee', amount: 200, unit: 'мл', note: null,
    }]])
    expect(state.calls[0].steps.map(([m]) => m)).toContain('single')

    state.response = { data: null, error: { message: 'boom' } }
    expect(await createIntakeEvent('u1', { ts: row.ts, type: 'coffee', amount: null, unit: null, note: null })).toBeNull()
  })
})

describe('deleteIntakeEvent', () => {
  it('deletes by id', async () => {
    await deleteIntakeEvent('e1')
    expect(state.calls[0].table).toBe('intake_events')
    expect(state.calls[0].steps.map(([m]) => m)).toContain('delete')
    expect(state.calls[0].steps).toContainEqual(['eq', ['id', 'e1']])
  })
})

describe('getMeals', () => {
  it('reads meal rows for the window, newest first', async () => {
    const rows = [{ ts: '2026-07-17T10:00:00Z', note: 'x', calories: 500, protein_g: 20, carbs_g: 50, fat_g: 15 }]
    state.response = { data: rows, error: null }
    expect(await getMeals('u1', '2026-06-17T00:00:00Z')).toEqual(rows)
    const steps = state.calls[0].steps
    expect(state.calls[0].table).toBe('intake_events')
    expect(steps).toContainEqual(['eq', ['user_id', 'u1']])
    expect(steps).toContainEqual(['eq', ['type', 'meal']])
    expect(steps).toContainEqual(['gte', ['ts', '2026-06-17T00:00:00Z']])
    expect(steps).toContainEqual(['order', ['ts', { ascending: false }]])
  })

  it('returns [] on null data and null on error (load-error signal)', async () => {
    expect(await getMeals('u1', 'x')).toEqual([])
    state.response = { data: null, error: { message: 'boom' } }
    expect(await getMeals('u1', 'x')).toBeNull()
  })
})

describe('createMealEvent', () => {
  it('inserts a meal-typed event stamped with the current time', async () => {
    const before = Date.now()
    await createMealEvent('u1', { note: 'Салат', calories: 300, protein_g: 10, carbs_g: 20, fat_g: 15 })
    expect(state.calls[0].table).toBe('intake_events')
    const [, [row]] = state.calls[0].steps.find(([m]) => m === 'insert')!
    const r = row as Record<string, unknown>
    expect(r.user_id).toBe('u1')
    expect(r.type).toBe('meal')
    expect(r.note).toBe('Салат')
    expect(r.calories).toBe(300)
    expect(Math.abs(new Date(r.ts as string).getTime() - before)).toBeLessThan(5000)
  })
})
