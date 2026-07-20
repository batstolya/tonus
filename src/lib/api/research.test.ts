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
    for (const m of ['select', 'eq', 'order', 'insert', 'update', 'delete', 'single']) p[m] = record(m)
    ;(p as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(state.response).then(res)
    return p
  }
  return { supabase: { from: (t: string) => chain(t) } }
})

import { getExperiments, createExperiment, saveExperimentResult, deleteExperiment } from './research'
import type { ExperimentResult } from '../experiments'

beforeEach(() => {
  state.calls.length = 0
  state.response = { data: null, error: null }
})

const draft = {
  hypothesis: 'Без кофе после 16:00 улучшится сон',
  change_rule: 'Перестал пить кофе после 16:00',
  target_metric: 'sleepHours',
  baseline_days: 14,
  baseline_start: '2026-06-19',
  start_date: '2026-07-03',
  end_date: '2026-07-17',
  status: 'active' as const,
}

describe('getExperiments', () => {
  it('reads the user experiments newest first', async () => {
    const rows = [{ id: 'e1' }]
    state.response = { data: rows, error: null }
    expect(await getExperiments('u1')).toEqual(rows)
    expect(state.calls[0].table).toBe('experiments')
    const steps = state.calls[0].steps
    expect(steps).toContainEqual(['select', ['*']])
    expect(steps).toContainEqual(['eq', ['user_id', 'u1']])
    expect(steps).toContainEqual(['order', ['created_at', { ascending: false }]])
  })

  it('returns [] on null data and null on error (load-error signal)', async () => {
    expect(await getExperiments('u1')).toEqual([])
    state.response = { data: null, error: { message: 'boom' } }
    expect(await getExperiments('u1')).toBeNull()
  })
})

describe('createExperiment', () => {
  it('inserts and returns the created row, null on error', async () => {
    const row = { id: 'e1', ...draft }
    state.response = { data: row, error: null }
    expect(await createExperiment('u1', draft)).toEqual(row)
    expect(state.calls[0].table).toBe('experiments')
    const steps = state.calls[0].steps
    expect(steps).toContainEqual(['insert', [{ user_id: 'u1', ...draft }]])
    expect(steps.map(([m]) => m)).toContain('single')

    state.response = { data: null, error: { message: 'boom' } }
    expect(await createExperiment('u1', draft)).toBeNull()
  })
})

describe('saveExperimentResult', () => {
  it('updates result and ai_explanation by id', async () => {
    const result = { baselineMean: 7, expMean: 8 } as unknown as ExperimentResult
    await saveExperimentResult('e1', result, 'разбор')
    expect(state.calls[0].table).toBe('experiments')
    const steps = state.calls[0].steps
    expect(steps).toContainEqual(['update', [{ result, ai_explanation: 'разбор' }]])
    expect(steps).toContainEqual(['eq', ['id', 'e1']])
  })
})

describe('deleteExperiment', () => {
  it('deletes by id', async () => {
    await deleteExperiment('e1')
    expect(state.calls[0].table).toBe('experiments')
    expect(state.calls[0].steps.map(([m]) => m)).toContain('delete')
    expect(state.calls[0].steps).toContainEqual(['eq', ['id', 'e1']])
  })
})
