import { describe, it, expect } from 'vitest'
import { computeDailyScores } from './scores'
import { computeDailyScores as computeDailyScoresServer } from '../../supabase/functions/_shared/scores'
import type { DailyMetrics } from '../types'

// Формулы живут в одном месте (_shared/scores.ts), клиент их re-export'ит.
// Golden-тесты пиновят значения формул от случайной правки; identity-тест
// фиксирует, что фасад отдаёт ту же функцию (единый источник, зеркала нет).
const day = (date: string, hrv: number, rhr: number, sleep: number, steps: number): DailyMetrics =>
  ({ date, hrv, restingHeartRate: rhr, sleepHours: sleep, steps })

describe('computeDailyScores (client)', () => {
  it('skips days with fewer than 5 prior days of history', () => {
    const input = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']
      .map(d => day(d, 50, 60, 8, 10000))
    expect(computeDailyScores(input)).toEqual([])
  })

  it('scores a steady baseline day as perfect (readiness/recovery/sleep=100, stress=0)', () => {
    const dates = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']
    const out = computeDailyScores(dates.map(d => day(d, 50, 60, 8, 10000)))
    expect(out).toHaveLength(2) // только i=5 и i=6 имеют ≥5 prior-дней
    expect(out[out.length - 1]).toMatchObject({
      date: '2026-06-07', readiness: 100, recovery_score: 100, sleep_score: 100, stress_score: 0,
      hrv_baseline: 50, rhr_baseline: 60, sleep_baseline: 8, steps_baseline: 10000,
    })
  })

  it('drops readiness when HRV falls below personal baseline', () => {
    const base = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'].map(d => day(d, 80, 55, 8, 9000))
    const out = computeDailyScores([...base, day('2026-06-06', 40, 55, 8, 9000)])
    const r = out.find(s => s.date === '2026-06-06')!
    // hrvS=clamp(40*40/80)=20, rhrS=30, slS=30 → 80/100; recovery: 50*0.6+100*0.4=70
    expect(r.readiness).toBe(80)
    expect(r.recovery_score).toBe(70)
    expect(r.stress_score).toBe(30)
  })
})

describe('client/server single source', () => {
  it('client facade re-exports the very same function as the server module', () => {
    // Раньше здесь был mirror-тест двух копий; копий больше нет — источник один.
    expect(computeDailyScores).toBe(computeDailyScoresServer)
  })

  it('undefined-поля клиента и null-поля сервера дают идентичный результат', () => {
    // детерминированный псевдорандом — серия с пропусками отдельных метрик
    const rnd = (seed: number) => {
      const x = Math.sin(seed * 12.9898) * 43758.5453
      return x - Math.floor(x)
    }
    const clientInput: DailyMetrics[] = []
    const serverInput: { date: string; hrv: number | null; restingHeartRate: number | null; sleepHours: number | null; steps: number | null }[] = []
    for (let i = 0; i < 40; i++) {
      const d = new Date(Date.UTC(2026, 4, 1 + i)) // 2026-05-01 + i дней
      const date = d.toISOString().slice(0, 10)
      const hrv = rnd(i * 4 + 1) < 0.15 ? null : 30 + rnd(i * 4 + 2) * 50
      const rhr = rnd(i * 4 + 3) < 0.15 ? null : 50 + rnd(i * 4 + 4) * 15
      const sleep = rnd(i * 4 + 5) < 0.15 ? null : 5 + rnd(i * 4 + 6) * 4
      const steps = rnd(i * 4 + 7) < 0.15 ? null : Math.floor(3000 + rnd(i * 4 + 8) * 10000)
      clientInput.push({
        date,
        hrv: hrv ?? undefined,
        restingHeartRate: rhr ?? undefined,
        sleepHours: sleep ?? undefined,
        steps: steps ?? undefined,
      })
      serverInput.push({ date, hrv, restingHeartRate: rhr, sleepHours: sleep, steps })
    }
    const client = computeDailyScores(clientInput)
    const server = computeDailyScoresServer(serverInput)
    expect(client.length).toBeGreaterThan(0)
    expect(client).toEqual(server)
  })
})
