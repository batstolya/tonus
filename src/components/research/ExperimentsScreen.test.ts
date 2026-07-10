import { describe, it, expect } from 'vitest'
import { ExperimentsScreen } from './ExperimentsScreen'
import { ExperimentCard } from './ExperimentCard'
import { translations } from '../../lib/translations'

// Строки экрана экспериментов: метки эффекта раньше не были переведены
// (в укр. интерфейсе торчало «слабый»), плюс новые строки редизайна.
const EXP_KEYS = [
  'сильный', 'средний', 'слабый', 'нет эффекта',
  'Идёт сейчас', 'Запланированные', 'Завершённые',
  'Мало данных: {n} из {m} дней в базовом периоде.',
  'Мало данных: {n} из {m} дней в периоде эксперимента.',
  'Данные по метрике начинаются {d}.',
  'Начнётся {d}',
  'Не удалось получить разбор. Попробуй ещё раз.',
]

describe('ExperimentsScreen', () => {
  it('exports components', () => {
    expect(typeof ExperimentsScreen).toBe('function')
    expect(typeof ExperimentCard).toBe('function')
  })

  it('has uk + en translations for all experiment strings', () => {
    for (const key of EXP_KEYS) {
      const entry = translations[key]
      expect(entry, `missing translation for "${key}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })
})
