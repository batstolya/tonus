import { describe, it, expect } from 'vitest'
import { computeLevers, confidenceBadge, buildExperimentPrefill } from './levers'
import type { Finding } from './research'

const coffee: Finding = {
  kind: 'event', a: 'Кофе (кол-во)', b: 'Самочувствие', n: 28,
  withMean: 2, withoutMean: 4, delta: -2, deltaPct: -50, lag: 0,
  direction: 'neg', strength: 1.0, factorKey: 'ev_coffee', outcomeKey: 'wellbeing',
}
const illness: Finding = {
  kind: 'event', a: 'Болезнь (день)', b: 'HRV', n: 10,
  delta: -5, direction: 'neg', strength: 0.9, factorKey: 'ev_illness', outcomeKey: 'hrv',
}
const env: Finding = {
  kind: 'corr', a: 'Погода: давление', b: 'HRV', n: 10, r: -0.5,
  direction: 'neg', strength: 0.5, modifiable: false,
}
const coffeeSteps: Finding = {
  kind: 'event', a: 'Кофе (кол-во)', b: 'Шаги', n: 14,
  delta: 500, direction: 'pos', strength: 0.6, factorKey: 'ev_coffee', outcomeKey: 'steps',
}

describe('computeLevers', () => {
  it('включает управляемый рычаг на отслеживаемый исход', () => {
    const { levers } = computeLevers([coffee])
    expect(levers).toHaveLength(1)
    expect(levers[0].factorLabel).toBe('Кофе (кол-во)')
    expect(levers[0].outcomeLabel).toBe('Самочувствие')
    expect(levers[0].impactText).toBe('-50%')
  })

  it('исключает неуправляемые факторы (болезнь) и относит среду в context', () => {
    const { levers, context } = computeLevers([coffee, illness, env])
    expect(levers.some(l => l.factorLabel === 'Болезнь (день)')).toBe(false)
    expect(levers.some(l => l.factorLabel === 'Погода: давление')).toBe(false)
    expect(context).toContain(env)
  })

  it('исключает исходы вне набора (Шаги)', () => {
    const { levers } = computeLevers([coffeeSteps])
    expect(levers).toHaveLength(0)
  })

  it('сортирует по убыванию score и обрезает до 5', () => {
    const many = Array.from({ length: 8 }, (_, i): Finding => ({
      ...coffee, a: `F${i}`, strength: 0.5 + i * 0.1,
    }))
    const { levers } = computeLevers(many)
    expect(levers).toHaveLength(5)
    for (let i = 1; i < levers.length; i++) expect(levers[i - 1].score).toBeGreaterThanOrEqual(levers[i].score)
  })

  it('бейдж: сильный+много данных = high, у порога = low', () => {
    expect(confidenceBadge({ ...coffee, n: 28, strength: 1.0 })).toBe('high')
    expect(confidenceBadge({ ...coffee, n: 7, strength: 0.5 })).toBe('low')
  })
})

describe('buildExperimentPrefill', () => {
  it('маппит исход в валидную метрику эксперимента, иначе hrv', () => {
    const [lever] = computeLevers([{ ...coffee, outcomeKey: 'sleepHours', b: 'Длительность сна' }]).levers
    expect(buildExperimentPrefill(lever).target_metric).toBe('sleepHours')
    const [wb] = computeLevers([coffee]).levers
    expect(buildExperimentPrefill(wb).target_metric).toBe('hrv') // wellbeing не измеряется экспериментом → дефолт
  })
})
