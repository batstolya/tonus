import { describe, it, expect } from 'vitest'
import { NotificationBell } from './NotificationBell'
import { translations } from '../../lib/translations'

const KEYS = [
  'Уведомления',
  'Высокий сигнал',
  'Наблюдение',
  'Все спокойно — сигналов нет',
  'Стрик {n} дн. под угрозой',
  'Иначе сгорит заморозка (осталось {n})',
  'Заморозок нет — стрик обнулится в полночь',
  'Нет данных {n} дн.',
  'Проверь авто-синхронизацию на iPhone',
  'Понятно',
  'Закрыть',
]

describe('NotificationBell', () => {
  it('exports a topbar popover component', () => {
    expect(typeof NotificationBell).toBe('function')
  })

  it('all user-facing keys are translated (uk + en)', () => {
    for (const k of KEYS) {
      expect(translations[k], `missing translation: ${k}`).toBeTruthy()
      expect(translations[k].uk).toBeTruthy()
      expect(translations[k].en).toBeTruthy()
    }
  })
})
