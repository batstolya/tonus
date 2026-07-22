import { describe, it, expect } from 'vitest'
import { CorrelationsBlock } from './CorrelationsBlock'
import { translations } from '../../lib/translations'

// Env node — рендера нет; экспорт + покрытие переводов (паттерн TelegramDemo).
const KEYS = [
  'Связи в твоих данных',
  'Нужно ещё {n} дней данных, чтобы искать связи.',
  'на следующий день',
  'в тот же день',
  'сильная связь',
  'заметная связь',
  'дн.',
  'Кофе',
  'Алкоголь',
  'Тренировки',
  'Шаги',
  'Поздний отбой',
  'Давление',
  'Перепад давления',
  'Температура за окном',
  'Световой день',
  'Сон',
  'HRV',
  'Пульс покоя',
  'Готовность',
  'Корреляция — не причинность: связь стоит проверить экспериментом.',
]

describe('CorrelationsBlock', () => {
  it('exports a component', () => {
    expect(typeof CorrelationsBlock).toBe('function')
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
