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

  it('demo fixture: Пн волейбол / Ср футбол / Пт волейбол, включено', () => {
    const ws = makeDemoWorkoutSchedule()
    expect(Object.keys(ws.day_times).sort()).toEqual(['1', '3', '5'])
    expect(ws.day_times['1']).toEqual({ time: '18:45', label: 'волейбол' })
    expect(ws.day_times['3'].label).toBe('футбол')
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
