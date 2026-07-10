import { describe, it, expect } from 'vitest'
import { ActivityCalendar } from './ActivityCalendar'
import { translations } from '../../lib/translations'

const KEYS = ['данные есть', 'пропуск', 'заморожено', 'Предыдущий месяц', 'Следующий месяц']

describe('ActivityCalendar', () => {
  it('exports a component', () => {
    expect(typeof ActivityCalendar).toBe('function')
  })
  it('all user-facing keys are translated (uk + en)', () => {
    for (const k of KEYS) {
      expect(translations[k], `missing translation: ${k}`).toBeTruthy()
      expect(translations[k].uk).toBeTruthy()
      expect(translations[k].en).toBeTruthy()
    }
  })
})
