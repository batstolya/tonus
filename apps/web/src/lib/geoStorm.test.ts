import { describe, it, expect } from 'vitest'
import { stormTier, stormHintKey } from './geoStorm'

describe('stormTier (зеркало _shared)', () => {
  it('спокойно при Kp < 5 или нет данных', () => {
    expect(stormTier(null)).toBeNull()
    expect(stormTier(2.33)).toBeNull()
  })
  it('уровни', () => {
    expect(stormTier(5)).toBe('minor')
    expect(stormTier(7)).toBe('strong')
    expect(stormTier(9)).toBe('extreme')
  })
})

describe('stormHintKey', () => {
  it('свой ключ на уровень', () => {
    expect(stormHintKey('minor')).toContain('проседать')
    expect(stormHintKey('strong')).toContain('нагрузку')
    expect(stormHintKey('extreme')).toContain('отдохнуть')
  })
})
