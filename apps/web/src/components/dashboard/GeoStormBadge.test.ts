import { describe, it, expect } from 'vitest'
import { GeoStormBadge } from './GeoStormBadge'
import { stormHintKey } from '../../lib/geoStorm'
import { translations } from '../../lib/translations'

// Все строки индикатора бури должны быть переведены (uk/en).
const KEYS = [
  'Магнитная буря сегодня',
  stormHintKey('minor'),
  stormHintKey('strong'),
  stormHintKey('extreme'),
]

describe('GeoStorm indicator', () => {
  it('exports the badge', () => {
    expect(typeof GeoStormBadge).toBe('function')
  })

  it('все строки переведены на uk и en', () => {
    for (const key of KEYS) {
      expect(translations[key], `missing translation: ${key}`).toBeDefined()
      expect(translations[key].uk).toBeTruthy()
      expect(translations[key].en).toBeTruthy()
    }
  })
})
