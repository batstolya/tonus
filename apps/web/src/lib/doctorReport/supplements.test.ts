import { describe, it, expect } from 'vitest'
import { buildSupplements } from './supplements'
import type { Supplement } from '../supplements'
import type { SupplementAdherenceLog } from '../api/settings'

const sup = (id: string, name: string, active = true): Supplement =>
  ({ id, name, default_dose: '400', unit: 'мг', active, sort_order: 0 } as Supplement)

const log = (supplement_id: string, date: string, taken = true): SupplementAdherenceLog =>
  ({ supplement_id, date, taken } as SupplementAdherenceLog)

describe('buildSupplements', () => {
  it('measures adherence from the first logged intake, not from the period length', () => {
    // 90-day period, but this supplement only started 10 days ago
    const logs = Array.from({ length: 9 }, (_, i) => log('a', `2026-07-${22 + i}`))
    const out = buildSupplements([sup('a', 'Магний')], logs, '2026-05-03', '2026-07-31')
    expect(out[0].firstIntake).toBe('2026-07-22')
    expect(out[0].windowDays).toBe(10)
    expect(out[0].taken).toBe(9)
    expect(out[0].pct).toBe(90)
  })

  it('keeps discontinued supplements with their status', () => {
    const out = buildSupplements([sup('b', 'Железо', false)], [log('b', '2026-07-30')], '2026-05-03', '2026-07-31')
    expect(out[0].active).toBe(false)
    expect(out[0].name).toBe('Железо')
  })

  it('reports null adherence when nothing was logged in the period', () => {
    const out = buildSupplements([sup('c', 'Омега-3')], [], '2026-05-03', '2026-07-31')
    expect(out[0].firstIntake).toBeNull()
    expect(out[0].pct).toBeNull()
  })

  it('ignores logs outside the period and untaken days', () => {
    const logs = [log('a', '2026-01-01'), log('a', '2026-07-30', false), log('a', '2026-07-31')]
    const out = buildSupplements([sup('a', 'Магний')], logs, '2026-07-29', '2026-07-31')
    expect(out[0].firstIntake).toBe('2026-07-31')
    expect(out[0].taken).toBe(1)
  })
})
