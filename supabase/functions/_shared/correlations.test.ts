import { describe, it, expect } from 'vitest'
import { computeLagCorrelations, type CorrDailyRow, type CorrelationsResult } from './correlations'

const dayStr = (i: number) => new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10)

function found(res: CorrelationsResult) {
  if ('needMoreDays' in res) throw new Error('ожидались корреляции, получен эмпти-стейт')
  return res.correlations
}

describe('computeLagCorrelations (ported to _shared)', () => {
  it('returns an honest empty state when there is not enough paired data', () => {
    const daily: CorrDailyRow[] = Array.from({ length: 5 }, (_, i) => ({ date: dayStr(i), sleepHours: 7, steps: 9000 }))
    const res = computeLagCorrelations({ daily, scores: [], intake: [] })
    expect('needMoreDays' in res && res.needMoreDays).toBeGreaterThan(0)
  })

  it('finds a strong next-day correlation: coffee → HRV drops tomorrow', () => {
    const n = 30
    const coffee = (i: number) => (i % 2 === 0 ? 4 : 0)
    const daily: CorrDailyRow[] = Array.from({ length: n }, (_, i) => ({
      date: dayStr(i),
      hrv: i > 0 && coffee(i - 1) > 2 ? 35 + (i % 3) : 55 + (i % 3),
      sleepHours: 7.5,
    }))
    const intake = daily.flatMap((d, i) => coffee(i) > 0 ? [{ ts: `${d.date}T08:00:00Z`, type: 'coffee' }] : [])
    const res = computeLagCorrelations({ daily, scores: [], intake })
    const corrs = found(res)
    const coffeeHrv = corrs.find(c => c.factor === 'coffee' && c.outcome === 'hrv' && c.lag === 1)
    expect(coffeeHrv).toBeTruthy()
    expect(coffeeHrv!.direction).toBe('down')
  })

  it('finds a same-day correlation: later bedtime → shorter sleep', () => {
    const n = 30
    const daily: CorrDailyRow[] = Array.from({ length: n }, (_, i) => {
      const late = i % 2 === 0
      return {
        date: dayStr(i),
        sleepBedtime: late ? `${dayStr(i)}T23:40:00Z` : `${dayStr(i)}T21:30:00Z`,
        sleepHours: late ? 6.2 + (i % 3) * 0.1 : 7.8 + (i % 3) * 0.1,
      }
    })
    const res = computeLagCorrelations({ daily, scores: [], intake: [] })
    const corrs = found(res)
    const bedtimeSleep = corrs.find(c => c.factor === 'bedtime' && c.outcome === 'sleepHours' && c.lag === 0)
    expect(bedtimeSleep).toBeTruthy()
    expect(bedtimeSleep!.direction).toBe('down') // позже лечь → меньше спать
  })
})
