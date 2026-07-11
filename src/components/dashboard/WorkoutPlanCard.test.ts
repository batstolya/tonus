import { describe, it, expect } from 'vitest'
import { WorkoutPlanCard } from './WorkoutPlanCard'
import { makeDemoWorkoutSchedule } from '../../lib/demoFixture'
import { translations } from '../../lib/translations'

// Строки виджета должны оставаться переведёнными (uk/en), иначе в интерфейсе
// протекает русский исходник.
const CARD_KEYS = [
  'Следующая тренировка',
  'Месяц: по плану',
  'Сегодня в {time}',
  'завтра',
  'через {n} дн.',
]

describe('WorkoutPlanCard', () => {
  it('exports a component', () => {
    expect(typeof WorkoutPlanCard).toBe('function')
  })

  it('demo fixture: Пн/Ср/Пт 19:00, включено', () => {
    const ws = makeDemoWorkoutSchedule()
    expect(ws.weekdays).toEqual([1, 3, 5])
    expect(ws.time).toBe('19:00')
    expect(ws.enabled).toBe(true)
  })

  it('все строки карточки переведены на uk и en', () => {
    for (const key of CARD_KEYS) {
      expect(translations[key], `missing translation: ${key}`).toBeDefined()
      expect(translations[key].uk).toBeTruthy()
      expect(translations[key].en).toBeTruthy()
    }
  })
})
