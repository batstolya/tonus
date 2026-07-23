import { describe, it, expect } from 'vitest'
import {
  localDate, addDays, computeBaselineStart, daysBetween,
  MIN_N, METRIC_OPTIONS, isValidMetric, metricLabel, computeResult,
  effectLabel, effectSegments, expStatusInfo, firstMetricDate,
  type ExperimentRow,
} from './experiments'
import type { DailyMetrics } from '../types'

describe('date helpers', () => {
  it('localDate formats in local timezone', () => {
    // 00:30 местного 15 марта — toISOString() дал бы 14-е при UTC+3
    expect(localDate(new Date(2026, 2, 15, 0, 30))).toBe('2026-03-15')
    expect(localDate(new Date(2026, 0, 1))).toBe('2026-01-01')
  })

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-06-13', 14)).toBe('2026-06-27')
  })

  it('computeBaselineStart = start − baselineDays', () => {
    expect(computeBaselineStart('2026-06-13', 14)).toBe('2026-05-30')
    expect(computeBaselineStart('2026-06-08', 7)).toBe('2026-06-01')
  })

  it('daysBetween', () => {
    expect(daysBetween('2026-06-13', '2026-06-27')).toBe(14)
  })
})

function mkExp(over: Partial<ExperimentRow> = {}): ExperimentRow {
  return {
    id: 'x', hypothesis: 'h', change_rule: 'c', target_metric: 'sleepDeep',
    baseline_days: 14, baseline_start: '2026-05-30', start_date: '2026-06-13',
    end_date: '2026-06-27', status: 'completed', result: null,
    ai_explanation: null, created_at: '2026-06-27T00:00:00Z', ...over,
  }
}
function nights(from: string, count: number, val: (i: number) => number): DailyMetrics[] {
  return Array.from({ length: count }, (_, i) => ({ date: addDays(from, i), sleepDeep: val(i) }))
}

describe('computeResult', () => {
  it('computes means, delta and cohen d when both windows have ≥ MIN_N points', () => {
    const daily = [
      ...nights('2026-05-30', 14, i => 0.8 + (i % 3) * 0.1),   // baseline [05-30, 06-13)
      ...nights('2026-06-13', 15, i => 1.0 + (i % 3) * 0.1),   // exp [06-13, 06-27]
    ]
    const r = computeResult(daily, mkExp())
    expect(r.insufficient).toBeNull()
    expect(r.baselineN).toBe(14)
    expect(r.expN).toBe(15)
    expect(r.baselineMean).toBeCloseTo(0.9, 1)
    expect(r.expMean).toBeCloseTo(1.1, 1)
    expect(r.delta).toBeCloseTo(0.2, 1)
    expect(r.deltaPct).not.toBeNull()
    expect(r.cohenD).not.toBeNull()
  })

  it('window boundaries: baseline is [baseline_start, start), exp is [start, end]', () => {
    const daily: DailyMetrics[] = [
      { date: '2026-05-29', sleepDeep: 9 },  // до baseline — мимо
      { date: '2026-05-30', sleepDeep: 1 },  // baseline
      { date: '2026-06-12', sleepDeep: 1 },  // baseline (последний день)
      { date: '2026-06-13', sleepDeep: 2 },  // exp (start включён)
      { date: '2026-06-27', sleepDeep: 2 },  // exp (end включён)
      { date: '2026-06-28', sleepDeep: 9 },  // после end — мимо
    ]
    const r = computeResult(daily, mkExp())
    expect(r.baselineN).toBe(2)
    expect(r.expN).toBe(2)
  })

  it('reports insufficient baseline (real prod case: sleep data starts inside exp window)', () => {
    const daily = nights('2026-06-11', 17, () => 1) // 06-11..06-27: 2 ночи в базе, 15 в exp
    const r = computeResult(daily, mkExp())
    expect(r.insufficient).toEqual({ window: 'baseline', n: 2, minN: MIN_N })
    expect(r.delta).toBeNull()
    expect(r.deltaPct).toBeNull()
    expect(r.cohenD).toBeNull()
  })

  it('reports insufficient exp window', () => {
    const daily = [...nights('2026-05-30', 14, () => 1), ...nights('2026-06-13', 3, () => 1)]
    const r = computeResult(daily, mkExp())
    expect(r.insufficient).toEqual({ window: 'exp', n: 3, minN: MIN_N })
  })

  it('falls back to start_date − baseline_days when baseline_start is null (not "today")', () => {
    const daily = [...nights('2026-05-30', 14, () => 1), ...nights('2026-06-13', 15, () => 1)]
    const r = computeResult(daily, mkExp({ baseline_start: null }))
    expect(r.baselineN).toBe(14) // окно от старта; старый код считал от Date.now()
  })

  it('unwraps heartRate {avg} objects and scales oxygenSaturation to %', () => {
    const hr: DailyMetrics[] = Array.from({ length: 12 }, (_, i) => ({
      date: addDays('2026-06-08', i), heartRate: { avg: 60 + i, min: 50, max: 90 },
    }))
    const r = computeResult(hr, mkExp({ target_metric: 'heartRate', baseline_start: '2026-06-08', start_date: '2026-06-14', end_date: '2026-06-19' }))
    expect(r.baselineN).toBe(6)
    const ox: DailyMetrics[] = Array.from({ length: 12 }, (_, i) => ({
      date: addDays('2026-06-08', i), oxygenSaturation: 0.97,
    }))
    const r2 = computeResult(ox, mkExp({ target_metric: 'oxygenSaturation', baseline_start: '2026-06-08', start_date: '2026-06-14', end_date: '2026-06-19' }))
    expect(r2.baselineMean).toBe(97)
  })
})

describe('effect + status + misc', () => {
  it('effectLabel thresholds', () => {
    expect(effectLabel(null)).toBe('—')
    expect(effectLabel(0.1)).toBe('нет эффекта')
    expect(effectLabel(-0.3)).toBe('слабый')
    expect(effectLabel(0.6)).toBe('средний')
    expect(effectLabel(0.9)).toBe('сильный')
  })

  it('effectSegments', () => {
    expect(effectSegments(null)).toBe(0)
    expect(effectSegments(0.1)).toBe(1)
    expect(effectSegments(0.9)).toBe(4)
  })

  it('expStatusInfo uses local today', () => {
    const past = mkExp({ status: 'active', end_date: '2020-01-01' })
    expect(expStatusInfo(past).kind).toBe('done')
    const future = mkExp({ status: 'active', start_date: addDays(localDate(), 3), end_date: addDays(localDate(), 10) })
    expect(expStatusInfo(future).kind).toBe('planned')
    expect(expStatusInfo(mkExp({ status: 'cancelled' })).kind).toBe('cancelled')
  })

  it('metric registry', () => {
    expect(isValidMetric('sleepDeep')).toBe(true)
    expect(isValidMetric('nope')).toBe(false)
    expect(metricLabel('sleepDeep')).toBe('Глубокий сон')
    expect(METRIC_OPTIONS.find(m => m.key === 'restingHeartRate')!.betterHigh).toBe(false)
  })

  it('firstMetricDate finds first day with a value for the metric', () => {
    const daily: DailyMetrics[] = [
      { date: '2026-06-01', steps: 100 },
      { date: '2026-06-11', sleepDeep: 1 },
    ]
    expect(firstMetricDate(daily, 'sleepDeep')).toBe('2026-06-11')
    expect(firstMetricDate(daily, 'hrv')).toBeNull()
  })
})

// ── Parity клиент ↔ сервер (_shared/experiments.ts — зеркало) ────────────────
import {
  computeResult as computeResultServer,
  effectLabel as effectLabelServer,
  addDays as addDaysServer,
  computeBaselineStart as cbsServer,
} from '../../../../supabase/functions/_shared/experiments'

describe('parity клиент ↔ сервер', () => {
  it('computeResult идентичен на разных наборах', () => {
    const fixtures: DailyMetrics[][] = [
      [
        ...nights('2026-05-30', 14, i => 0.8 + (i % 3) * 0.1),
        ...nights('2026-06-13', 15, i => 1.0 + (i % 3) * 0.1),
      ],
      // недостаточно данных в exp-окне
      [...nights('2026-05-30', 14, () => 1), ...nights('2026-06-13', 3, () => 2)],
      // пусто
      [],
      // метрика-объект (heartRate.avg)
      [
        ...Array.from({ length: 14 }, (_, i) => ({ date: addDays('2026-05-30', i), heartRate: { avg: 60 + (i % 4), min: 50, max: 120 } })),
        ...Array.from({ length: 15 }, (_, i) => ({ date: addDays('2026-06-13', i), heartRate: { avg: 57 + (i % 4), min: 50, max: 120 } })),
      ],
    ]
    const exps = [mkExp(), mkExp({ target_metric: 'heartRate' }), mkExp({ baseline_start: null })]
    for (const daily of fixtures)
      for (const exp of exps)
        expect(computeResultServer(daily, exp)).toEqual(computeResult(daily, exp))
  })

  it('effectLabel и датовые хелперы идентичны', () => {
    for (const d of [null, -1.2, -0.6, -0.3, 0, 0.19, 0.2, 0.5, 0.79, 0.8, 2])
      expect(effectLabelServer(d)).toBe(effectLabel(d))
    expect(addDaysServer('2026-03-01', -1)).toBe(addDays('2026-03-01', -1))
    expect(cbsServer('2026-06-13', 14)).toBe(computeBaselineStart('2026-06-13', 14))
  })
})
