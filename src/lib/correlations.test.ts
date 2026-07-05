import { describe, it, expect } from 'vitest'
import { computeLagCorrelations, type CorrelationsResult } from './correlations'
import type { DailyMetrics } from '../types'

// Лаг-корреляции (F3 smart-tonus): Пирсон между фактором дня X и исходом
// дня X+lag (0|1). Минимум 14 пар, топ-5 по |r|, честный эмпти-стейт.

const dayStr = (i: number) => new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10)

function makeDaily(n: number, fn: (i: number) => Partial<DailyMetrics>): DailyMetrics[] {
  return Array.from({ length: n }, (_, i) => ({ date: dayStr(i), ...fn(i) }))
}

const coffeeEvents = (dates: string[], perDay: (i: number) => number) =>
  dates.flatMap((d, i) => Array.from({ length: perDay(i) }, (_, k) => ({
    ts: `${d}T0${8 + k}:00:00Z`, type: 'coffee',
  })))

function found(res: CorrelationsResult) {
  if ('needMoreDays' in res) throw new Error('ожидались корреляции, получен эмпти-стейт')
  return res.correlations
}

describe('computeLagCorrelations', () => {
  it('honest empty state when data is short', () => {
    const daily = makeDaily(5, () => ({ sleepHours: 7, steps: 9000 }))
    const res = computeLagCorrelations({ daily, scores: [], intake: [] })
    expect('needMoreDays' in res && res.needMoreDays).toBeGreaterThan(0)
  })

  it('finds a strong next-day correlation: coffee → HRV drops tomorrow', () => {
    // чёт/нечёт: кофе много → hrv назавтра низкий; шум лёгкий, связь явная
    const n = 30
    const coffee = (i: number) => (i % 2 === 0 ? 4 : 0)
    const daily = makeDaily(n, i => ({
      // hrv дня i определяется кофе дня i-1
      hrv: i > 0 && coffee(i - 1) > 2 ? 35 + (i % 3) : 55 + (i % 3),
      sleepHours: 7.5,
    }))
    const intake = coffeeEvents(daily.map(d => d.date), coffee)
    const res = found(computeLagCorrelations({ daily, scores: [], intake }))
    const hit = res.find(c => c.factor === 'coffee' && c.outcome === 'hrv' && c.lag === 1)
    expect(hit, 'кофе → hrv (lag 1) не найдена').toBeDefined()
    expect(hit!.r).toBeLessThan(-0.5)
    expect(hit!.strength).toBe('strong')
    expect(hit!.direction).toBe('down')
  })

  it('same-day correlation: more steps → better sleep tonight (lag 0)', () => {
    const n = 30
    const daily = makeDaily(n, i => ({
      steps: i % 2 === 0 ? 12000 + i * 10 : 3000 + i * 10,
      sleepHours: i % 2 === 0 ? 8 + (i % 3) * 0.1 : 6 + (i % 3) * 0.1,
    }))
    const res = found(computeLagCorrelations({ daily, scores: [], intake: [] }))
    const hit = res.find(c => c.factor === 'steps' && c.outcome === 'sleepHours' && c.lag === 0)
    expect(hit).toBeDefined()
    expect(hit!.r).toBeGreaterThan(0.5)
    expect(hit!.direction).toBe('up')
  })

  it('weak noise (|r| < 0.3) is not reported', () => {
    // псевдослучайный шум без связи
    const rnd = (s: number) => { const x = Math.sin(s * 12.9898) * 43758.5453; return x - Math.floor(x) }
    const daily = makeDaily(40, i => ({
      steps: 5000 + Math.round(rnd(i) * 8000),
      hrv: 40 + rnd(i + 100) * 25,
      sleepHours: 6 + rnd(i + 200) * 2.5,
    }))
    const res = found(computeLagCorrelations({ daily, scores: [], intake: [] }))
    for (const c of res) expect(Math.abs(c.r)).toBeGreaterThanOrEqual(0.3)
  })

  it('readiness outcome uses scores; strong needs n>=21', () => {
    const n = 18 // 17 пар для lag 1 — сильная связь, но n<21 → strength 'notable'
    const coffee = (i: number) => (i % 2 === 0 ? 3 : 0)
    const daily = makeDaily(n, () => ({ sleepHours: 7.5 }))
    const scores = daily.map((d, i) => ({
      date: d.date,
      readiness: i > 0 && coffee(i - 1) > 1 ? 55 + (i % 3) : 85 + (i % 3),
    }))
    const intake = coffeeEvents(daily.map(d => d.date), coffee)
    const res = found(computeLagCorrelations({ daily, scores, intake }))
    const hit = res.find(c => c.factor === 'coffee' && c.outcome === 'readiness' && c.lag === 1)
    expect(hit).toBeDefined()
    expect(hit!.strength).toBe('notable') // |r|≥0.5, но n<21
  })

  it('returns at most top-5 by |r|', () => {
    const n = 40
    const daily = makeDaily(n, i => ({
      steps: i % 2 === 0 ? 12000 : 3000,
      exerciseMinutes: i % 2 === 0 ? 60 : 5,
      sleepHours: i % 2 === 0 ? 8.5 : 6,
      hrv: i % 2 === 0 ? 60 : 40,
      restingHeartRate: i % 2 === 0 ? 52 : 60,
    }))
    const res = found(computeLagCorrelations({ daily, scores: [], intake: [] }))
    expect(res.length).toBeLessThanOrEqual(5)
    // отсортировано по |r| убыванию
    for (let i = 1; i < res.length; i++) {
      expect(Math.abs(res[i - 1].r)).toBeGreaterThanOrEqual(Math.abs(res[i].r))
    }
  })

  it('constant series does not produce NaN correlations', () => {
    const daily = makeDaily(30, () => ({ steps: 9000, sleepHours: 7.5, hrv: 50 }))
    const res = computeLagCorrelations({ daily, scores: [], intake: [] })
    if (!('needMoreDays' in res)) {
      for (const c of res.correlations) expect(Number.isNaN(c.r)).toBe(false)
    }
  })

  it('environment factor: pressure drop → worse HRV next day (lag 1)', () => {
    const n = 30
    // дни с падением давления (дельта < 0) → hrv назавтра ниже
    const env = Array.from({ length: n }, (_, i) => ({
      date: dayStr(i),
      temp_c: 20,
      pressure_hpa: i % 2 === 0 ? 1005 : 1020, // пила: чёт — упало, нечет — выросло
      daylight_minutes: 900,
      precipitation_mm: 0,
    }))
    const daily = makeDaily(n, i => ({
      // hrv дня i зависит от дельты давления дня i-1 (чёт → упало → hrv ниже)
      hrv: i > 0 && (i - 1) % 2 === 0 ? 38 + (i % 3) : 55 + (i % 3),
      sleepHours: 7.5,
    }))
    const res = found(computeLagCorrelations({ daily, scores: [], intake: [], environment: env }))
    const hit = res.find(c => c.factor === 'pressureDelta' && c.outcome === 'hrv' && c.lag === 1)
    expect(hit, 'pressureDelta → hrv (lag 1) не найдена').toBeDefined()
    expect(hit!.r).toBeGreaterThan(0.5) // дельта выше (рост давления) → hrv выше
  })

  it('environment factor: hot day → less sleep same night (lag 0)', () => {
    const n = 30
    const env = Array.from({ length: n }, (_, i) => ({
      date: dayStr(i),
      temp_c: i % 2 === 0 ? 31 : 18,
      pressure_hpa: 1013,
      daylight_minutes: 900,
      precipitation_mm: 0,
    }))
    const daily = makeDaily(n, i => ({
      sleepHours: i % 2 === 0 ? 6 + (i % 3) * 0.1 : 8 + (i % 3) * 0.1,
    }))
    const res = found(computeLagCorrelations({ daily, scores: [], intake: [], environment: env }))
    const hit = res.find(c => c.factor === 'temp' && c.outcome === 'sleepHours' && c.lag === 0)
    expect(hit).toBeDefined()
    expect(hit!.r).toBeLessThan(-0.5)
  })

  it('works without environment data (backwards compatible)', () => {
    const daily = makeDaily(30, i => ({
      steps: i % 2 === 0 ? 12000 : 3000,
      sleepHours: i % 2 === 0 ? 8 : 6,
    }))
    const res = found(computeLagCorrelations({ daily, scores: [], intake: [] }))
    expect(res.length).toBeGreaterThan(0)
  })

  it('bedtime factor: later bedtime → less sleep (lag 0)', () => {
    const daily = makeDaily(30, i => {
      const late = i % 2 === 0
      const bed = new Date(Date.UTC(2026, 4, i, late ? 25 - 24 : 22, 30)) // 01:30 vs 22:30
      if (late) bed.setUTCDate(bed.getUTCDate()) // 01:30 уже след. день — ок для парсинга
      return {
        sleepBedtime: bed.toISOString(),
        sleepHours: late ? 5.8 + (i % 3) * 0.1 : 8 + (i % 3) * 0.1,
      }
    })
    const res = found(computeLagCorrelations({ daily, scores: [], intake: [] }))
    const hit = res.find(c => c.factor === 'bedtime' && c.outcome === 'sleepHours' && c.lag === 0)
    expect(hit).toBeDefined()
    expect(hit!.r).toBeLessThan(-0.5)
  })
})
