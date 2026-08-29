import { describe, it, expect, vi, beforeEach } from 'vitest'

// Recording mock for the supabase query builder (same pattern as supplements.test.ts).
const state = vi.hoisted(() => ({
  calls: [] as { table: string; steps: [string, unknown[]][] }[],
  response: { data: null as unknown, error: null as unknown },
  rpcCalls: [] as { fn: string; args: unknown }[],
  rpcResponse: { data: null as unknown, error: null as unknown },
}))

vi.mock('../supabase', () => {
  function chain(table: string) {
    const call = { table, steps: [] as [string, unknown[]][] }
    state.calls.push(call)
    const p: Record<string, unknown> = {}
    const record = (m: string) => (...args: unknown[]) => { call.steps.push([m, args]); return p }
    for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'insert', 'update', 'delete', 'single']) p[m] = record(m)
    ;(p as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(state.response).then(res)
    return p
  }
  return {
    supabase: {
      from: (t: string) => chain(t),
      rpc: (fn: string, args: unknown) => {
        state.rpcCalls.push({ fn, args })
        return Promise.resolve(state.rpcResponse)
      },
    },
  }
})

vi.mock('../demo', () => ({ isDemoActive: () => false }))

import { loadHabits, loadHabitBreaks, createHabit, setHabitBreak, archiveHabit, deleteHabit } from './habits'

beforeEach(() => {
  state.calls.length = 0
  state.response = { data: null, error: null }
  state.rpcCalls.length = 0
  state.rpcResponse = { data: true, error: null }
})

describe('loadHabits', () => {
  it('requests only the caller rows, ordered for the page', async () => {
    state.response = { data: [], error: null }
    await loadHabits('u1')
    expect(state.calls[0].table).toBe('habits')
    expect(state.calls[0].steps).toContainEqual(['eq', ['user_id', 'u1']])
    expect(state.calls[0].steps).toContainEqual(['order', ['sort_order', { ascending: true }]])
  })

  it('defaults to [] when the query returns nothing', async () => {
    state.response = { data: null, error: null }
    expect(await loadHabits('u1')).toEqual([])
  })
})

describe('loadHabitBreaks', () => {
  it('filters by user and the since date', async () => {
    state.response = { data: [], error: null }
    await loadHabitBreaks('u1', '2026-06-01')
    expect(state.calls[0].table).toBe('habit_breaks')
    expect(state.calls[0].steps).toContainEqual(['eq', ['user_id', 'u1']])
    expect(state.calls[0].steps).toContainEqual(['gte', ['date', '2026-06-01']])
  })
})

describe('createHabit', () => {
  it('inserts a row scoped to the user and returns it', async () => {
    const row = { id: 'h1', user_id: 'u1', name: 'No sugar', note: null, start_date: '2026-08-01', active: true, sort_order: 0, created_at: 'x' }
    state.response = { data: row, error: null }
    const created = await createHabit('u1', { name: 'No sugar', note: null, start_date: '2026-08-01' })
    expect(created).toEqual(row)
    expect(state.calls[0].steps).toContainEqual(['insert', [{ user_id: 'u1', name: 'No sugar', note: null, start_date: '2026-08-01' }]])
    expect(state.calls[0].steps.map(([m]) => m)).toContain('single')
  })
})

describe('setHabitBreak', () => {
  it('calls the RPC with the user, habit, date and intent', async () => {
    state.rpcResponse = { data: true, error: null }
    await setHabitBreak('u1', 'h1', '2026-08-28', true)
    expect(state.rpcCalls).toContainEqual({
      fn: 'set_habit_break',
      args: { p_user_id: 'u1', p_habit_id: 'h1', p_date: '2026-08-28', p_broken: true },
    })
  })

  it('surfaces an RPC failure instead of reporting success', async () => {
    state.rpcResponse = { data: null, error: { message: 'forbidden' } }
    await expect(setHabitBreak('u1', 'h1', '2026-08-28', true)).rejects.toThrow('forbidden')
  })
})

describe('archiveHabit', () => {
  it('updates the active flag by id', async () => {
    state.response = { data: null, error: null }
    await archiveHabit('h1', false)
    expect(state.calls[0].table).toBe('habits')
    expect(state.calls[0].steps).toContainEqual(['update', [{ active: false }]])
    expect(state.calls[0].steps).toContainEqual(['eq', ['id', 'h1']])
  })
})

describe('deleteHabit', () => {
  it('deletes by id', async () => {
    state.response = { data: null, error: null }
    await deleteHabit('h1')
    expect(state.calls[0].table).toBe('habits')
    expect(state.calls[0].steps.map(([m]) => m)).toContain('delete')
    expect(state.calls[0].steps).toContainEqual(['eq', ['id', 'h1']])
  })
})
