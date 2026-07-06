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
  // Task 4 — ветка Apple
  'Установи Health Auto Export',
  'Это приложение само отправляет данные Apple Health в Tonus. Есть бесплатный пробный период — хватит, чтобы всё проверить.',
  'Открыть в App Store',
  'Создай автоматизацию',
  'В Health Auto Export открой вкладку Automations и нажми «+».',
  'Automations → «+»',
  'Тип: REST API',
  'Метод POST · Формат JSON',
  'Вставь адрес Tonus',
  'Скопируй персональную ссылку и вставь её в поле URL автоматизации.',
  'Выбери данные и расписание',
  'Включи все метрики здоровья и сон',
  'Интервал — каждые 1-3 часа',
  'Не забудь включить автоматизацию (Enable)',
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
