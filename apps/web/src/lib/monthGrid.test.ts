import { describe, it, expect } from 'vitest'
import { monthGrid, shiftMonth } from './monthGrid'

describe('monthGrid', () => {
  it('lists every day of the month', () => {
    const g = monthGrid(2026, 7) // August 2026
    expect(g.days).toHaveLength(31)
    expect(g.days[0]).toBe('2026-08-01')
    expect(g.days[30]).toBe('2026-08-31')
  })

  it('pads the first row so the week starts on Monday', () => {
    // 2026-08-01 is a Saturday, so five blanks precede it.
    expect(monthGrid(2026, 7).leadingBlanks).toBe(5)
    // 2026-06-01 is a Monday: no padding.
    expect(monthGrid(2026, 5).leadingBlanks).toBe(0)
  })

  it('handles February in a non-leap year', () => {
    expect(monthGrid(2026, 1).days).toHaveLength(28)
  })
})

describe('shiftMonth', () => {
  it('rolls over the year boundary in both directions', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 })
  })
})
