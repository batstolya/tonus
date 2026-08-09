import { describe, expect, it } from 'vitest'
import { adaptVitalPortPayload, isVitalPortPayload } from './vitalport.ts'
import fixture from './fixtures/vitalport-xiaomi.json'
import { parseHAE } from './hae.ts'

const SOURCE = 'VitalPort · Apple Health'
const USER = '00000000-0000-0000-0000-000000000001'

function snapshot(overrides: Record<string, unknown> = {}) {
  return { id: 'snapshot-id', date: '2026-08-05T22:00:00Z', stepCount: 10, ...overrides }
}

function adaptSnapshots(snapshots: Record<string, unknown>[], timezone = 'Europe/Berlin') {
  return adaptVitalPortPayload({ snapshots }, timezone)!
}

describe('VitalPort payload recognition', () => {
  it('recognizes captured snapshots only when identity, date, and a measurement are present', () => {
    expect(isVitalPortPayload(fixture)).toBe(true)
    expect(isVitalPortPayload({ data: { metrics: [] } })).toBe(false)
    expect(isVitalPortPayload({ snapshots: [{ stepCount: 10 }] })).toBe(false)
  })

  it('supports the documented dailySnapshots and days envelope names', () => {
    const snapshot = { id: 'abc', date: '2026-08-05T22:00:00Z', stepCount: 10 }
    expect(isVitalPortPayload({ dailySnapshots: [snapshot] })).toBe(true)
    expect(isVitalPortPayload({ days: [snapshot] })).toBe(true)
  })

  it('recognizes unsupported observed measurements without emitting a substitute metric', () => {
    const restingEnergyOnly = { snapshots: [{ id: 'resting-energy', date: '2026-08-05T22:00:00Z', restingEnergyKcal: 1464 }] }
    expect(isVitalPortPayload(restingEnergyOnly)).toBe(true)
    expect(adaptVitalPortPayload(restingEnergyOnly, 'Europe/Berlin')).toEqual({ data: { metrics: [] } })
  })

  it('rejects non-VitalPort shapes and malformed snapshots', () => {
    expect(isVitalPortPayload({})).toBe(false)
    expect(isVitalPortPayload({ metrics: [{ name: 'step_count', data: [] }] })).toBe(false)
    expect(isVitalPortPayload([{ id: 'abc', date: '2026-08-05T22:00:00Z', stepCount: 10 }])).toBe(false)
    expect(isVitalPortPayload({ snapshots: [null] })).toBe(false)
    expect(isVitalPortPayload({ snapshots: [{ id: 'abc', date: 'not-a-date', stepCount: 10 }] })).toBe(false)
    expect(isVitalPortPayload({ snapshots: [{ id: 'abc', date: '2026-08-05T22:00:00Z' }] })).toBe(false)
  })

  it('returns null rather than guessing an unrelated payload', () => {
    expect(adaptVitalPortPayload({ data: { metrics: [] } }, 'Europe/Berlin')).toBeNull()
  })

  it('recognizes an envelope with malformed entries and adapts its valid snapshots independently', () => {
    const payload = adaptVitalPortPayload({
      snapshots: [
        { id: 'bad-date', date: 'not-a-date', stepCount: 99 },
        { id: 'valid-day', date: '2026-08-05T22:00:00Z', stepCount: 10 },
      ],
    }, 'Europe/Berlin')
    expect(payload).not.toBeNull()
    expect(payload!.data!.metrics!.find(metric => metric.name === 'step_count')!.data).toEqual([
      { date: '2026-08-06', source: SOURCE, qty: 10 },
    ])
  })
})

describe('VitalPort HAE adaptation', () => {
  it('uses the supplied timezone for the local calendar date and UTC for invalid zones', () => {
    const berlin = adaptVitalPortPayload(fixture, 'Europe/Berlin')!
    const steps = berlin.data!.metrics!.find(metric => metric.name === 'step_count')!
    expect(steps.data![0].date).toBe('2026-08-06')

    const utcFallback = adaptVitalPortPayload(fixture, 'not/a-timezone')!
    expect(utcFallback.data!.metrics!.find(metric => metric.name === 'step_count')!.data![0].date).toBe('2026-08-05')
  })

  it('maps only supported metrics with exact names, units, source, and rounding', () => {
    const payload = adaptSnapshots([snapshot({
      stepCount: 10.6,
      walkingRunningDistanceMeters: 4865.2,
      activeEnergyKcal: 200,
      exerciseMinutes: 20.6,
      restingHeartRate: 58,
      hrv: 42,
      bloodOxygenSaturationPercent: 97,
      respiratoryRate: 16,
      vo2Max: 42.5,
      restingEnergyKcal: 1464,
      weightKg: 70,
      workouts: [{ type: 'running' }],
    })])

    expect(payload.data!.metrics!.map(metric => [metric.name, metric.units])).toEqual([
      ['step_count', 'count'],
      ['distance_walking_running', 'm'],
      ['active_energy', 'kcal'],
      ['apple_exercise_time', 'min'],
      ['resting_heart_rate', 'count/min'],
      ['heart_rate_variability', 'ms'],
      ['blood_oxygen_saturation', '%'],
      ['respiratory_rate', 'count/min'],
      ['vo2_max', 'mL/kg/min'],
    ])
    expect(payload.data!.metrics!.flatMap(metric => metric.data!).every(point => point.source === SOURCE)).toBe(true)
    expect(payload.data!.metrics!.find(metric => metric.name === 'step_count')!.data![0].qty).toBe(11)
    expect(payload.data!.metrics!.find(metric => metric.name === 'apple_exercise_time')!.data![0].qty).toBe(21)
    expect(payload.data!.metrics!.find(metric => metric.name === 'distance_walking_running')!.data![0].qty).toBe(4865.2)
  })

  it('keeps valid zero cumulative metrics but omits null, strings, booleans, invalid numbers, and range failures', () => {
    const payload = adaptSnapshots([
      snapshot({ stepCount: 0, walkingRunningDistanceMeters: 0, activeEnergyKcal: 0, exerciseMinutes: 0 }),
      snapshot({ id: 'invalid-values', date: '2026-08-06T22:00:00Z', stepCount: '10', walkingRunningDistanceMeters: true, activeEnergyKcal: -1, exerciseMinutes: Infinity, restingHeartRate: 19, hrv: 1001, bloodOxygenSaturationPercent: 101, respiratoryRate: 0, vo2Max: null }),
      snapshot({ id: 'negative-steps', date: '2026-08-07T22:00:00Z', stepCount: -1 }),
      snapshot({ id: 'above-limit', date: '2026-08-08T22:00:00Z', stepCount: 200001 }),
    ])

    expect(payload.data!.metrics!.map(metric => metric.name)).toEqual([
      'step_count',
      'distance_walking_running',
      'active_energy',
      'apple_exercise_time',
    ])
    expect(payload.data!.metrics!.every(metric => metric.data!.length === 1 && metric.data![0].qty === 0)).toBe(true)
  })

  it('remains compatible with the HAE parser conversions for distance and oxygen', () => {
    const parsed = parseHAE(USER, adaptSnapshots([snapshot({ walkingRunningDistanceMeters: 4865.2, bloodOxygenSaturationPercent: 97 })]))
    expect(parsed.metrics.find(metric => metric.metric === 'distance')?.sum_val).toBeCloseTo(4.8652)
    expect(parsed.metrics.find(metric => metric.metric === 'oxygenSaturation')?.avg_val).toBeCloseTo(0.97)
  })

  it('uses asleep seconds before sleep hours and the Xiaomi in-bed fallback', () => {
    const payload = adaptSnapshots([
      snapshot({ sleepBreakdown: { asleepSeconds: 25200, inBedSeconds: 28800 }, sleepHours: 6 }),
      snapshot({ id: 'sleep-hours', date: '2026-08-06T22:00:00Z', sleepBreakdown: { asleepSeconds: 0, inBedSeconds: 28800 }, sleepHours: 6 }),
      snapshot({ id: 'in-bed', date: '2026-08-07T22:00:00Z', sleepBreakdown: { asleepSeconds: 0, inBedSeconds: 23020.45742201805 }, sleepHours: 0 }),
    ])
    const sleep = payload.data!.metrics!.find(metric => metric.name === 'sleep_analysis')!
    expect(sleep.data!.map(point => point.totalSleep)).toEqual([7, 6, 6.394571506116125])
    expect(sleep.data!.every(point => !('deep' in point) && !('rem' in point) && !('core' in point) && !('sleepStart' in point) && !('sleepEnd' in point))).toBe(true)
    expect(parseHAE(USER, payload).sleep.find(row => row.date === '2026-08-08')?.duration_hours).toBeCloseTo(6.39457)
  })

  it('omits zero, malformed, negative, and overlong sleep candidates', () => {
    const payload = adaptSnapshots([
      snapshot({ sleepBreakdown: { asleepSeconds: 0, inBedSeconds: 0 }, sleepHours: 0 }),
      snapshot({ id: 'negative', date: '2026-08-06T22:00:00Z', sleepBreakdown: { asleepSeconds: -1 }, sleepHours: -1 }),
      snapshot({ id: 'overlong', date: '2026-08-07T22:00:00Z', sleepBreakdown: { asleepSeconds: 57601 }, sleepHours: null }),
      snapshot({ id: 'malformed', date: '2026-08-08T22:00:00Z', sleepBreakdown: { asleepSeconds: '3600' }, sleepHours: '6' }),
    ])
    expect(payload.data!.metrics!.find(metric => metric.name === 'sleep_analysis')).toBeUndefined()
  })
})
