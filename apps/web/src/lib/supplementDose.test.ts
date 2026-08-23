import { describe, it, expect } from 'vitest'
import { nextDoseCount, doseFraction, clampDosesPerDay } from './supplementDose'

describe('nextDoseCount', () => {
  it('behaves like the old boolean when there is one dose a day', () => {
    expect(nextDoseCount(0, 1)).toBe(1)
    expect(nextDoseCount(1, 1)).toBe(0)
  })

  it('walks every dose before resetting', () => {
    expect(nextDoseCount(0, 3)).toBe(1)
    expect(nextDoseCount(1, 3)).toBe(2)
    expect(nextDoseCount(2, 3)).toBe(3)
    expect(nextDoseCount(3, 3)).toBe(0)
  })

  it('resets a count that overshoots the daily dose', () => {
    expect(nextDoseCount(9, 3)).toBe(0)
  })

  it('treats a negative count as none taken', () => {
    expect(nextDoseCount(-2, 3)).toBe(1)
  })
})

describe('doseFraction', () => {
  it('is partial while doses remain', () => {
    expect(doseFraction(2, 3)).toBeCloseTo(2 / 3)
  })

  it('is one for a full day and never more', () => {
    expect(doseFraction(3, 3)).toBe(1)
    expect(doseFraction(5, 3)).toBe(1)
  })

  it('is zero for an untouched day', () => {
    expect(doseFraction(0, 3)).toBe(0)
  })
})

describe('clampDosesPerDay', () => {
  it('keeps the value inside the allowed range', () => {
    expect(clampDosesPerDay(0)).toBe(1)
    expect(clampDosesPerDay(11)).toBe(10)
    expect(clampDosesPerDay(3)).toBe(3)
    expect(clampDosesPerDay(NaN)).toBe(1)
  })
})
