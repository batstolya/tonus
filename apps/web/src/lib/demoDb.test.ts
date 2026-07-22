import { describe, it, expect, beforeEach } from 'vitest'
import { demoList, demoInsert, demoUpdate, demoRemove, demoReset, demoId } from './demoDb'

// Стор демо-режима: читают его все экраны, а пишут в него быстрый лог, БАДы,
// цели и проблемы. Ломается он тихо (экран просто пустеет), поэтому — тесты.
describe('demoDb', () => {
  beforeEach(() => demoReset())

  it('seeds tables lazily on first read', () => {
    expect(demoList('supplements').length).toBeGreaterThan(0)
    expect(demoList('intake_events').length).toBeGreaterThan(0)
    expect(demoList('lab_results').length).toBeGreaterThan(0)
  })

  it('hands out copies, so a caller mutating rows cannot corrupt the store', () => {
    const rows = demoList('supplements')
    rows.pop()
    rows[0].name = 'сломано'
    expect(demoList('supplements').length).toBe(rows.length + 1)
    expect(demoList('supplements')[0].name).not.toBe('сломано')
  })

  it('inserts a row and reads it back', () => {
    const before = demoList('goals').length
    const id = demoId('demo-goal')
    demoInsert('goals', {
      id, user_id: 'demo-user', metric: 'hrv', title: 'Test', baseline_value: 40,
      target_value: 50, direction: 'up', start_date: '2026-07-01', end_date: '2026-07-15',
      status: 'active', recommendation_id: null, step_size: null, created_at: '2026-07-01T09:00:00Z',
    })
    const goals = demoList('goals')
    expect(goals).toHaveLength(before + 1)
    expect(goals.find(g => g.id === id)?.title).toBe('Test')
  })

  it('updates a row in place', () => {
    const first = demoList('health_alerts')[0]
    demoUpdate('health_alerts', first.id, { acknowledged_at: '2026-07-14T10:00:00Z' })
    expect(demoList('health_alerts').find(a => a.id === first.id)?.acknowledged_at)
      .toBe('2026-07-14T10:00:00Z')
  })

  it('removes a row', () => {
    const first = demoList('goals')[0]
    demoRemove('goals', first.id)
    expect(demoList('goals').find(g => g.id === first.id)).toBeUndefined()
  })

  it('resets every write back to the fixtures', () => {
    const before = demoList('intake_events').length
    demoRemove('intake_events', demoList('intake_events')[0].id)
    expect(demoList('intake_events')).toHaveLength(before - 1)
    demoReset()
    expect(demoList('intake_events')).toHaveLength(before)
  })
})
