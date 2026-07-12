import { describe, it, expect } from 'vitest'
import { stormTier, stormNotificationClause } from './geoStorm.ts'

describe('stormTier', () => {
  it('спокойно при Kp < 5 или нет данных', () => {
    expect(stormTier(null)).toBeNull()
    expect(stormTier(undefined)).toBeNull()
    expect(stormTier(2.33)).toBeNull()
    expect(stormTier(4.9)).toBeNull()
  })
  it('minor 5–6', () => {
    expect(stormTier(5)).toBe('minor')
    expect(stormTier(6.9)).toBe('minor')
  })
  it('strong 7–8', () => {
    expect(stormTier(7)).toBe('strong')
    expect(stormTier(8.9)).toBe('strong')
  })
  it('extreme 9', () => {
    expect(stormTier(9)).toBe('extreme')
  })
})

describe('stormNotificationClause', () => {
  it('пусто без бури', () => {
    expect(stormNotificationClause(3)).toBe('')
    expect(stormNotificationClause(null)).toBe('')
  })
  it('minor — «может проседать», целый Kp без дробей', () => {
    expect(stormNotificationClause(6)).toContain('Kp 6')
    expect(stormNotificationClause(6)).toContain('проседать')
  })
  it('дробный Kp округляется до 1 знака', () => {
    expect(stormNotificationClause(6.5)).toContain('Kp 6.5')
  })
  it('strong — «полегче»', () => {
    expect(stormNotificationClause(7)).toContain('полегче')
  })
  it('extreme — «отдохнуть»', () => {
    expect(stormNotificationClause(9)).toContain('отдохнуть')
  })
})
