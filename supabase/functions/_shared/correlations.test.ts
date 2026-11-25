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

describe('computeLagCorrelations (_shared): personal time in daylight', () => {
  it('finds sunlight → longer sleep the next night', () => {
    const light = (i: number) => (i % 2 === 0 ? 90 : 15)
    const daily = Array.from({ length: 30 }, (_, i): CorrDailyRow => ({
      date: dayStr(i),
      daylightMinutes: light(i),
      sleepHours: i > 0 && light(i - 1) > 50 ? 7.8 + (i % 3) * 0.1 : 6.4 + (i % 3) * 0.1,
    }))
    const res = found(computeLagCorrelations({ daily, scores: [], intake: [] }))
    const hit = res.find(c => c.factor === 'sunlight' && c.outcome === 'sleepHours' && c.lag === 1)
    expect(hit, 'sunlight → sleep (lag 1) not found').toBeDefined()
    expect(hit!.direction).toBe('up')
  })

  it('skips sunlight without zero-filling when only a few days have it', () => {
    const daily = Array.from({ length: 30 }, (_, i): CorrDailyRow => ({
      date: dayStr(i),
      daylightMinutes: i < 5 ? 60 : undefined,
      sleepHours: 6 + (i % 4) * 0.5,
      steps: 5000 + (i % 4) * 2000,
    }))
    const res = computeLagCorrelations({ daily, scores: [], intake: [] })
    const list = 'correlations' in res ? res.correlations : []
    expect(list.some(c => c.factor === 'sunlight')).toBe(false)
  })
})
