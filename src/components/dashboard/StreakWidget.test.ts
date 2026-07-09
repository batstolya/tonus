import { describe, it, expect } from 'vitest'
import { StreakWidget } from './StreakWidget'
import { translations } from '../../lib/translations'

const KEYS = [
  'Серия',
  'Дней подряд',
  'Заморозки',
  'Недель подряд',
  'Синхронизация ожидается',
]

describe('StreakWidget', () => {
  it('exports a component', () => {
    expect(typeof StreakWidget).toBe('function')
  })
  it('all user-facing keys are translated (uk + en)', () => {
    for (const k of KEYS) {
      expect(translations[k], `missing translation: ${k}`).toBeTruthy()
      expect(translations[k].uk).toBeTruthy()
      expect(translations[k].en).toBeTruthy()
    }
  })
})
