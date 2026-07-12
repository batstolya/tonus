import { describe, it, expect } from 'vitest'
import { translations } from '../../lib/translations'

// Ключи карточки «Прогноз на завтра» (Dashboard.tsx → ForecastCard).
// Должны быть 1-в-1 со строками в t(...) компонента.
const KEYS = [
  'Прогноз на завтра',
  'Ожидается обычный день',
  'Из чего складывается прогноз',
  'Недосып несколько ночей',
  'Алкоголь сегодня',
  'Кофе после 18:00',
  'Большая нагрузка сегодня',
  'Магнитная буря',
  'Восходящий тренд',
  'Ляг сегодня пораньше',
  'Больше воды и ранний отбой',
  'Последний кофе — до обеда',
  'Завтра лучше лёгкая нагрузка',
  'Не планируй завтра рекордов',
]

describe('ForecastCard translations', () => {
  it('has uk + en translations for every string', () => {
    for (const key of KEYS) {
      const entry = translations[key as keyof typeof translations]
      expect(entry, `missing translation for "${key}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })
})

describe('ForecastCard export', () => {
  it('Dashboard module exports Dashboard (карточка внутри)', async () => {
    const mod = await import('./Dashboard')
    expect(mod.Dashboard).toBeDefined()
  })
})
