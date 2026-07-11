import { describe, it, expect } from 'vitest'
import { forecastBlock } from './forecastMessage.ts'

describe('forecastBlock', () => {
  it('собирает блок: балл, сравнение, факторы, совет', () => {
    const text = forecastBlock({
      score: 62,
      factors: [{ id: 'sleep_debt', delta: -10 }, { id: 'late_coffee', delta: -5 }],
      adviceId: 'sleep_debt',
    }, 75)
    expect(text).toContain('🔮 Завтра: восстановление ~62')
    expect(text).toContain('ниже обычного')
    expect(text).toContain('недосып')
    expect(text).toContain('(−10)')
    expect(text).toContain('Совет:')
  })

  it('без факторов — без списка и совета, «на уровне»', () => {
    const text = forecastBlock({ score: 74, factors: [], adviceId: null }, 75)
    expect(text).toContain('на уровне обычного')
    expect(text).not.toContain('Совет:')
    expect(text).not.toContain('•')
  })

  it('выше обычного и позитивный фактор с плюсом', () => {
    const text = forecastBlock({
      score: 82,
      factors: [{ id: 'uptrend', delta: 5 }],
      adviceId: null,
    }, 70)
    expect(text).toContain('выше обычного')
    expect(text).toContain('(+5)')
  })

  it('без refScore — без сравнения', () => {
    const text = forecastBlock({ score: 60, factors: [], adviceId: null }, null)
    expect(text).toBe('🔮 Завтра: восстановление ~60')
  })
})
