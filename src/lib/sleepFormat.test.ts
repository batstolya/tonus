import { describe, it, expect } from 'vitest'
import { hoursToHM } from './sleepFormat'

describe('hoursToHM', () => {
  it('обычные значения', () => {
    expect(hoursToHM(7.5)).toEqual({ hrs: 7, mins: 30 })
    expect(hoursToHM(1.67)).toEqual({ hrs: 1, mins: 40 })
    expect(hoursToHM(0)).toEqual({ hrs: 0, mins: 0 })
  })
  it('минуты, округляющиеся до 60, переносятся в час (баг «6год 60хв»)', () => {
    expect(hoursToHM(6.993)).toEqual({ hrs: 7, mins: 0 })
    expect(hoursToHM(7.992)).toEqual({ hrs: 8, mins: 0 })
    expect(hoursToHM(1.998)).toEqual({ hrs: 2, mins: 0 })
  })
  it('почти целое снизу не даёт лишнюю минуту', () => {
    expect(hoursToHM(2.001)).toEqual({ hrs: 2, mins: 0 })
  })
})
