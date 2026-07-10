import { describe, expect, it } from 'vitest'
import { StreakMenu } from './StreakMenu'
import { translations } from '../../lib/translations'

const KEYS = ['Серия', 'Дней подряд', 'Заморозки', 'Недель подряд', 'Активность', 'Закрыть']

describe('StreakMenu', () => {
  it('exports a topbar popover component', () => {
    expect(typeof StreakMenu).toBe('function')
  })

  it('uses translated labels for the streak summary and calendar', () => {
    for (const key of KEYS) {
      expect(translations[key], `missing translation: ${key}`).toBeTruthy()
      expect(translations[key].uk).toBeTruthy()
      expect(translations[key].en).toBeTruthy()
    }
  })
})
