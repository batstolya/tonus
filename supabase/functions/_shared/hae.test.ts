import { describe, expect, it } from 'vitest'
import { num, parseHAE, parseHeartEvents, parseHRSamples } from './hae.ts'

// Характеризационные тесты: фиксируют поведение, которое уже крутится в проде.
// Если тест разошёлся с реализацией — прав тест только тогда, когда реализация
// действительно сломана; в остальных случаях прод и есть спецификация.
const USER = '00000000-0000-0000-0000-000000000001'
const DAY = '2026-07-20 00:00:00 +0000'

describe('num', () => {
  it('rejects every shape of absence, because Number() turns them into zero', () => {
    // Number(null) === 0, Number('') === 0, Number(false) === 0, Number([]) === 0.
    // Each used to be stored as a measurement of nothing.
    for (const v of [null, undefined, '', false, true, [], {}, 'abc', NaN]) {
      expect(num(v), `num(${JSON.stringify(v) ?? String(v)})`).toBeNull()
    }
  })

  it('keeps a real zero, which is the whole reason absence is checked first', () => {
    expect(num(0)).toBe(0)
    expect(num('0')).toBe(0)
    expect(num(-1)).toBe(-1)
    expect(num('7.5')).toBe(7.5)
  })
})

describe('parseHAE', () => {
  it('stores a phase the source reported as null as absent, not as zero hours', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          units: 'hr',
          data: [{ date: DAY, totalSleep: 7.5, deep: null, rem: 1.4, core: 3.9 }],
        }],
      },
    })
    expect(sleep[0].duration_hours).toBe(7.5)
    expect(sleep[0].deep_hours).toBeNull()
    expect(sleep[0].rem_hours).toBe(1.4)
  })

  it('falls back to the average when the source reports a null minimum', () => {
    // `const mn = num(p.Min ?? p.min) ?? avg` — with num() returning 0 for an
    // explicit null, `??` never fired and the day stored a minimum of zero.
    const { metrics } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'resting_heart_rate',
          units: 'count/min',
          data: [{ date: DAY, Avg: 58, Min: null, Max: null }],
        }],
      },
    })
    const row = metrics.find(m => m.metric === 'restingHeartRate')!
    expect(row.avg_val).toBe(58)
    expect(row.min_val).toBe(58)
    expect(row.max_val).toBe(58)
  })

  it('sums a metric within a source and takes the max across sources', () => {
    const { metrics } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'step_count',
          units: 'count',
          data: [
            { date: DAY, source: 'iPhone', qty: 4000 },
            { date: DAY, source: 'iPhone', qty: 1000 },
            { date: DAY, source: 'Watch', qty: 4800 },
          ],
        }],
      },
    })
    // iPhone 4000+1000 = 5000, Watch 4800 → максимум 5000, а не сумма 9800.
    // Это то, что делает параллельный прогон с HAE безопасным для сумм.
    expect(metrics.find(m => m.metric === 'steps')?.sum_val).toBe(5000)
  })

  it('averages a metric across all points of a day and keeps min/max', () => {
    const { metrics } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'heart_rate_variability',
          units: 'ms',
          data: [
            { date: '2026-07-20 03:00:00 +0000', Avg: 40, Min: 30, Max: 50 },
            { date: '2026-07-20 04:00:00 +0000', Avg: 60, Min: 55, Max: 70 },
          ],
        }],
      },
    })
    const hrv = metrics.find(m => m.metric === 'hrv')
    expect(hrv?.avg_val).toBe(50)
    expect(hrv?.min_val).toBe(30)
    expect(hrv?.max_val).toBe(70)
  })

  it('normalises saturation given as a percentage into a fraction', () => {
    const { metrics } = parseHAE(USER, {
      data: { metrics: [{ name: 'blood_oxygen_saturation', units: '%', data: [{ date: DAY, Avg: 97 }] }] },
    })
    expect(metrics.find(m => m.metric === 'oxygenSaturation')?.avg_val).toBeCloseTo(0.97)
  })

  it('treats a large distance as metres and converts to km', () => {
    const { metrics } = parseHAE(USER, {
      data: { metrics: [{ name: 'distance_walking_running', units: 'm', data: [{ date: DAY, qty: 5400 }] }] },
    })
    expect(metrics.find(m => m.metric === 'distance')?.sum_val).toBeCloseTo(5.4)
  })

  it('converts active energy from kJ when the units say so', () => {
    const { metrics } = parseHAE(USER, {
      data: { metrics: [{ name: 'active_energy', units: 'kJ', data: [{ date: DAY, qty: 4184 }] }] },
    })
    expect(metrics.find(m => m.metric === 'activeEnergy')?.sum_val).toBeCloseTo(1000)
  })

  it('reads sleep phases into one row per day', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          data: [{
            date: DAY,
            totalSleep: 7.5, deep: 1.2, rem: 1.8, core: 4.5,
            sleepStart: '2026-07-19 23:10:00 +0000',
            sleepEnd: '2026-07-20 06:40:00 +0000',
          }],
        }],
      },
    })
    expect(sleep).toHaveLength(1)
    expect(sleep[0].date).toBe('2026-07-20')
    expect(sleep[0].duration_hours).toBeCloseTo(7.5)
    expect(sleep[0].deep_hours).toBeCloseTo(1.2)
    expect(sleep[0].bedtime).toBe('2026-07-19 23:10:00 +0000')
  })

  it('reads night-time awake hours', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          data: [{
            date: '2026-08-13 00:00:00 +0200',
            totalSleep: 8.35, deep: 0.52, rem: 2.11, core: 5.71, awake: 0.1498,
          }],
        }],
      },
    })
    expect(sleep[0].awake_hours).toBeCloseTo(0.1498)
  })

  it('converts a minutes-shaped awake value to hours', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          data: [{ date: '2026-08-13 00:00:00 +0200', totalSleep: 8.35, awake: 45 }],
        }],
      },
    })
    expect(sleep[0].awake_hours).toBeCloseTo(0.75)
  })

  it('reports a missing awake field as null, never zero', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          data: [{ date: '2026-08-13 00:00:00 +0200', totalSleep: 8.35 }],
        }],
      },
    })
    expect(sleep[0].awake_hours).toBeNull()
  })

  it('keeps a measured zero as zero', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          data: [{ date: '2026-08-13 00:00:00 +0200', totalSleep: 8.35, awake: 0 }],
        }],
      },
    })
    expect(sleep[0].awake_hours).toBe(0)
  })

  it('nulls an implausible awake value but keeps the night', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          data: [{ date: '2026-08-13 00:00:00 +0200', totalSleep: 8.35, awake: 9 }],
        }],
      },
    })
    expect(sleep).toHaveLength(1)
    expect(sleep[0].duration_hours).toBeCloseTo(8.35)
    expect(sleep[0].awake_hours).toBeNull()
  })

  it('ignores metrics the server does not map', () => {
    const { metrics } = parseHAE(USER, {
      data: { metrics: [{ name: 'number_of_times_fallen', data: [{ date: DAY, qty: 3 }] }] },
    })
    expect(metrics).toEqual([])
  })

  it('accepts the flat payload shape as well as the nested one', () => {
    const flat = parseHAE(USER, { metrics: [{ name: 'step_count', data: [{ date: DAY, qty: 100 }] }] })
    expect(flat.metrics.find(m => m.metric === 'steps')?.sum_val).toBe(100)
  })

  it('survives a payload with no metrics at all', () => {
    expect(parseHAE(USER, {})).toEqual({ metrics: [], sleep: [] })
  })
})

describe('parseHAE: breathing disturbances and time in daylight', () => {
  const WATCH = 'Apple Watch'
  const metricsOf = (name: string, data: { date: string; qty: number; source?: string }[]) =>
    parseHAE(USER, { data: { metrics: [{ name, units: 'x', data }] } }).metrics

  it('maps breathing_disturbances to a per-night avg row on the wake-up date', () => {
    const rows = metricsOf('breathing_disturbances', [{ date: '2026-11-20 02:36:00 +0100', qty: 2.285, source: WATCH }])
    expect(rows).toEqual([{
      user_id: USER, date: '2026-11-20', metric: 'breathingDisturbances',
      avg_val: 2.285, min_val: 2.285, max_val: 2.285,
    }])
  })

  it('keeps a measured zero breathing value instead of dropping it', () => {
    const rows = metricsOf('breathing_disturbances', [{ date: '2026-11-17 02:19:00 +0100', qty: 0, source: WATCH }])
    expect(rows.map(r => r.avg_val)).toEqual([0])
  })

  it('sums time_in_daylight per day and rounds to whole minutes', () => {
    const rows = metricsOf('time_in_daylight', [
      { date: '2026-11-17 09:06:00 +0100', qty: 0.6, source: WATCH },
      { date: '2026-11-17 09:07:00 +0100', qty: 1, source: WATCH },
      { date: '2026-11-17 09:08:00 +0100', qty: 1, source: WATCH },
      { date: '2026-11-17 09:09:00 +0100', qty: 0.9999, source: WATCH },
      { date: '2026-11-24 14:40:00 +0100', qty: 1, source: WATCH },
    ])
    expect(rows).toEqual([
      { user_id: USER, date: '2026-11-17', metric: 'daylightMinutes', sum_val: 4 },
      { user_id: USER, date: '2026-11-24', metric: 'daylightMinutes', sum_val: 1 },
    ])
  })

  it('takes the max across sources for daylight, not their sum', () => {
    const pts = (n: number, source: string) =>
      Array.from({ length: n }, (_, i) => ({ date: `2026-11-17 09:${String(i).padStart(2, '0')}:00 +0100`, qty: 1, source }))
    const rows = metricsOf('time_in_daylight', [...pts(10, 'A'), ...pts(6, 'B')])
    expect(rows.map(r => r.sum_val)).toEqual([10])
  })
})

describe('parseHRSamples', () => {
  it('dedups heart-rate samples by timestamp', () => {
    const samples = parseHRSamples(USER, {
      data: {
        metrics: [{
          name: 'heart_rate',
          data: [
            { date: '2026-07-20T10:00:00.000Z', Avg: 61, source: 'Watch' },
            { date: '2026-07-20T10:00:00.000Z', Avg: 62, source: 'Watch' },
            { date: '2026-07-20T10:00:01.000Z', Avg: 64, source: 'Watch' },
          ],
        }],
      },
    })
    expect(samples).toHaveLength(2)
    // Последний выигрывает при совпадении секунды.
    expect(samples[0].bpm).toBe(62)
  })

  it('returns nothing when the payload carries no heart rate', () => {
    expect(parseHRSamples(USER, { data: { metrics: [{ name: 'step_count', data: [] }] } })).toEqual([])
  })
})

describe('parseHAE: catalog metrics', () => {
  const W = 'Apple Watch'
  const one = (name: string, units: string, data: { date: string; qty: number; source?: string }[]) =>
    parseHAE(USER, { data: { metrics: [{ name, units, data }] } }).metrics

  it('stores basal energy sent in kJ as kcal', () => {
    const rows = one('basal_energy_burned', 'kJ', [
      { date: '2026-11-24 00:03:00 +0100', qty: 41.84, source: W },
      { date: '2026-11-24 00:04:00 +0100', qty: 41.84, source: W },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ date: '2026-11-24', metric: 'basalEnergy' })
    expect(rows[0].sum_val).toBeCloseTo(20)
  })

  it('keeps walking asymmetry percent as sent', () => {
    const rows = one('walking_asymmetry_percentage', '%', [{ date: '2026-11-24 14:49:00 +0100', qty: 28.9, source: 'iPhone' }])
    expect(rows[0]).toMatchObject({ metric: 'walkingAsymmetry', avg_val: 28.9, min_val: 28.9, max_val: 28.9 })
  })

  it('counts handwashing events instead of summing their seconds', () => {
    const rows = one('handwashing', 's', [7, 22, 9].map((qty, i) => ({ date: `2026-11-24 0${i + 1}:00:00 +0100`, qty, source: W })))
    expect(rows[0]).toMatchObject({ metric: 'handwashing', sum_val: 3 })
  })

  it('averages audio exposure as sound energy and keeps the peak', () => {
    const rows = one('environmental_audio_exposure', 'dBASPL', [
      { date: '2026-11-24 10:00:00 +0100', qty: 50, source: W },
      { date: '2026-11-24 11:00:00 +0100', qty: 80, source: W },
    ])
    expect(rows[0].avg_val).toBeCloseTo(77.0, 1)
    expect(rows[0].max_val).toBe(80)
  })

  it('drops points without a numeric value instead of storing zero', () => {
    const rows = parseHAE(USER, { data: { metrics: [{ name: 'walking_speed', units: 'km/hr', data: [{ date: '2026-11-24 10:00:00 +0100', qty: null }] }] } }).metrics
    expect(rows).toEqual([])
  })
})

describe('parseHeartEvents', () => {
  it('maps heart-rate notifications by type and summarizes their heart-rate samples', () => {
    const rows = parseHeartEvents(USER, { data: { heartRateNotifications: [
      { heartNotification: 'low_heart_rate_notification', start: '2026-01-29 03:10:00 +0100', end: '2026-01-29 03:20:00 +0100', threshold: 40,
        source: { name: 'Apple Watch', identifier: 'x' },
        heartRateData: [{ qty: 38, units: 'count/min', start: 1, end: 2 }, { qty: 36, units: 'count/min', start: 3, end: 4 }] },
      { heartNotification: 'high_heart_rate_notification', start: '2026-02-01 12:00:00 +0100', end: '2026-02-01 12:05:00 +0100', threshold: 120, heartRateData: [] },
      { heartNotification: 'irregular_rhythm_notification', start: '2026-02-02 01:00:00 +0100', end: '2026-02-02 02:00:00 +0100' },
    ] } })
    expect(rows).toEqual([
      { user_id: USER, kind: 'low_hr', start_ts: '2026-01-29T02:10:00.000Z', end_ts: '2026-01-29T02:20:00.000Z', threshold: 40, hr_min: 36, hr_max: 38, hr_avg: 37, classification: null, source: 'Apple Watch' },
      { user_id: USER, kind: 'high_hr', start_ts: '2026-02-01T11:00:00.000Z', end_ts: '2026-02-01T11:05:00.000Z', threshold: 120, hr_min: null, hr_max: null, hr_avg: null, classification: null, source: null },
      { user_id: USER, kind: 'irregular_rhythm', start_ts: '2026-02-02T00:00:00.000Z', end_ts: '2026-02-02T01:00:00.000Z', threshold: null, hr_min: null, hr_max: null, hr_avg: null, classification: null, source: null },
    ])
  })

  it('keeps ECG classification and average heart rate, never the voltage samples', () => {
    const rows = parseHeartEvents(USER, { data: { ecg: [
      { start: '2026-03-10 09:00:00 +0100', end: '2026-03-10 09:00:30 +0100', classification: 'Sinus Rhythm', averageHeartRate: 72,
        numberOfVoltageMeasurements: 15360, voltageMeasurements: [{ date: 1, voltage: 123, units: 'mcV' }], samplingFrequency: 512, source: 'Apple Watch' },
    ] } })
    expect(rows).toEqual([
      { user_id: USER, kind: 'ecg', start_ts: '2026-03-10T08:00:00.000Z', end_ts: '2026-03-10T08:00:30.000Z', threshold: null, hr_min: null, hr_max: null, hr_avg: 72, classification: 'Sinus Rhythm', source: 'Apple Watch' },
    ])
  })

  it('skips entries without a parsable start and payloads without these arrays', () => {
    expect(parseHeartEvents(USER, { data: { heartRateNotifications: [{ heartNotification: 'low_heart_rate_notification', start: 'nonsense' }] } })).toEqual([])
    expect(parseHeartEvents(USER, { data: { metrics: [] } })).toEqual([])
  })
})
