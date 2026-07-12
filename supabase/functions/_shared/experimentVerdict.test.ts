import { describe, it, expect } from 'vitest'
import { verdictMessage } from './experimentVerdict.ts'
import type { ExperimentResult } from './experiments.ts'

const okResult: ExperimentResult = {
  baselineMean: 6.8, expMean: 7.4, delta: 0.6, deltaPct: 8.8, cohenD: 0.62,
  baselineN: 14, expN: 12, betterHigh: true, insufficient: null,
}

const thinResult: ExperimentResult = {
  baselineMean: null, expMean: null, delta: null, deltaPct: null, cohenD: null,
  baselineN: 2, expN: 0, betterHigh: true,
  insufficient: { window: 'baseline', n: 2, minN: 5 },
}

describe('verdictMessage', () => {
  it('с эффектом: гипотеза, метрика, до/во время, d, дни', () => {
    const msg = verdictMessage('Кофе только до обеда', 'sleepHours', okResult)
    expect(msg).toContain('🧪')
    expect(msg).toContain('Кофе только до обеда')
    expect(msg).toContain('Длительность сна')
    expect(msg).toContain('6.8')
    expect(msg).toContain('7.4')
    expect(msg).toContain('+0.6')
    expect(msg).toContain('d = 0.62')
    expect(msg).toContain('12 дней')
    expect(msg).toContain('средний')
  })

  it('мало данных: честное «данных мало», без чисел эффекта', () => {
    const msg = verdictMessage('Магний перед сном', 'hrv', thinResult)
    expect(msg).toContain('Магний перед сном')
    expect(msg).toContain('данных мало')
    expect(msg).not.toContain('d =')
  })

  it('отрицательная дельта без плюса', () => {
    const msg = verdictMessage('х', 'restingHeartRate', { ...okResult, delta: -2.1, baselineMean: 62, expMean: 59.9 })
    expect(msg).toContain('(-2.1)')
  })
})
