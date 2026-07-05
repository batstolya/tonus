import { describe, it, expect } from 'vitest'
import HealthAlertBanner from './HealthAlertBanner'
import { translations } from '../../lib/translations'

// Env node — рендера нет; проверяем экспорт и покрытие переводов
// (паттерн TelegramDemo.test.ts).
const KEYS = ['Понятно']

describe('HealthAlertBanner', () => {
  it('exports a component', () => {
    expect(typeof HealthAlertBanner).toBe('function')
  })

  it('has uk + en translations for every string', () => {
    for (const key of KEYS) {
      const entry = translations[key]
      expect(entry, `missing translation for "${key}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })
})
