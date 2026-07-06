import { describe, it, expect } from 'vitest'
import { ConnectGuide } from './ConnectGuide'
import { translations } from '../../lib/translations'

// Ключи всех шагов гайда: пополняется в задачах 4-6.
// Должны иметь uk/en, чтобы в гайд не протекал русский.
export const GUIDE_KEYS = [
  'Пропустить',
  'Далее',
  'Данные будут приходить сами',
  'Часы → телефон → Tonus. Один раз настроим — дальше всё автоматически, каждый день.',
]

describe('ConnectGuide', () => {
  it('exports a component', () => {
    expect(typeof ConnectGuide).toBe('function')
  })

  it('has uk + en translations for every guide string', () => {
    for (const key of GUIDE_KEYS) {
      const entry = translations[key]
      expect(entry, `missing translation for "${key}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })
})
