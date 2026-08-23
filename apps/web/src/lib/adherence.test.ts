import { describe, it, expect } from 'vitest'
import { computeAdherence } from './adherence'

// Соблюдение препаратов (F6 smart-tonus): % дней с приёмом за окно,
// серия подряд, общий процент. Чистая логика поверх supplement_logs.

const TODAY = '2026-07-05'
const d = (offset: number) => {
  const dt = new Date(TODAY + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() - offset)
  return dt.toISOString().slice(0, 10)
}
const sup = (id: string, name: string) => ({ id, name })
const log = (supplement_id: string, offset: number, taken = true) =>
  ({ supplement_id, date: d(offset), taken })

describe('computeAdherence', () => {
  it('computes percent over the window', () => {
    const logs = [0, 1, 2, 3, 4, 5, 6].map(i => log('mg', i)) // 7 из 14
    const { items, overallPct } = computeAdherence([sup('mg', 'Магний')], logs, 14, TODAY)
    expect(items).toHaveLength(1)
    expect(items[0].taken).toBe(7)
    expect(items[0].days).toBe(14)
    expect(items[0].pct).toBe(50)
    expect(overallPct).toBe(50)
  })

  it('counts a streak ending today', () => {
    const logs = [0, 1, 2, 3].map(i => log('mg', i)) // 4 дня подряд включая сегодня
    const { items } = computeAdherence([sup('mg', 'Магний')], logs, 14, TODAY)
    expect(items[0].streak).toBe(4)
  })

  it('streak survives an unlogged today (counts from yesterday)', () => {
    const logs = [1, 2, 3].map(i => log('mg', i)) // вчера и раньше
    const { items } = computeAdherence([sup('mg', 'Магний')], logs, 14, TODAY)
    expect(items[0].streak).toBe(3)
  })

  it('broken streak resets', () => {
    const logs = [0, 2, 3].map(i => log('mg', i)) // пропуск вчера
    const { items } = computeAdherence([sup('mg', 'Магний')], logs, 14, TODAY)
    expect(items[0].streak).toBe(1)
  })

  it('ignores taken=false and logs outside the window', () => {
    const logs = [log('mg', 0, false), log('mg', 20), log('mg', 1)]
    const { items } = computeAdherence([sup('mg', 'Магний')], logs, 14, TODAY)
    expect(items[0].taken).toBe(1)
  })

  it('overall percent spans multiple supplements', () => {
    const logs = [
      ...Array.from({ length: 14 }, (_, i) => log('mg', i)),  // 100%
      ...Array.from({ length: 7 }, (_, i) => log('om', i)),   // 50%
    ]
    const { items, overallPct } = computeAdherence(
      [sup('mg', 'Магний'), sup('om', 'Омега-3')], logs, 14, TODAY)
    expect(items.find(i => i.id === 'mg')!.pct).toBe(100)
    expect(items.find(i => i.id === 'om')!.pct).toBe(50)
    expect(overallPct).toBe(75) // (14+7) из 28
  })

  it('no supplements → empty result', () => {
    const res = computeAdherence([], [], 14, TODAY)
    expect(res.items).toEqual([])
    expect(res.overallPct).toBeNull()
  })

  it('counts partial days by dose', () => {
    // 3 doses a day, two days logged: 3/3 and 1/3 → 1.33 of 14 days
    const logs = [
      { supplement_id: 'mg', date: d(0), taken: true, taken_count: 3 },
      { supplement_id: 'mg', date: d(1), taken: true, taken_count: 1 },
    ]
    const { items } = computeAdherence(
      [{ id: 'mg', name: 'Магний', doses_per_day: 3 }], logs, 14, TODAY)
    expect(items[0].taken).toBeCloseTo(1 + 1 / 3)
    expect(items[0].pct).toBe(10) // round(1.333 / 14 * 100)
  })

  it('counts a partial day toward the streak', () => {
    const logs = [0, 1].map(i => ({
      supplement_id: 'mg', date: d(i), taken: true, taken_count: 1,
    }))
    const { items } = computeAdherence(
      [{ id: 'mg', name: 'Магний', doses_per_day: 3 }], logs, 14, TODAY)
    expect(items[0].streak).toBe(2)
  })

  it('never lets extra doses push a day above 100%', () => {
    const logs = Array.from({ length: 14 }, (_, i) => ({
      supplement_id: 'mg', date: d(i), taken: true, taken_count: 9,
    }))
    const { items } = computeAdherence(
      [{ id: 'mg', name: 'Магний', doses_per_day: 3 }], logs, 14, TODAY)
    expect(items[0].pct).toBe(100)
  })

  it('falls back to one dose when the log predates dose counts', () => {
    const logs = [0, 1, 2, 3, 4, 5, 6].map(i => log('mg', i))
    const { items } = computeAdherence([sup('mg', 'Магний')], logs, 14, TODAY)
    expect(items[0].pct).toBe(50)
  })
})

