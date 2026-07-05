import { describe, it, expect } from 'vitest'
import { AdherenceBlock } from './AdherenceBlock'
import { translations } from '../../lib/translations'

// Env node — рендера нет; экспорт + покрытие переводов (паттерн TelegramDemo).
const KEYS = ['Соблюдение', 'В среднем', 'дн.']

describe('AdherenceBlock', () => {
  it('exports a component', () => {
    expect(typeof AdherenceBlock).toBe('function')
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
