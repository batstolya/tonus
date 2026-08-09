import { describe, expect, it } from 'vitest'
import fixture from '../supabase/functions/_shared/fixtures/vitalport-xiaomi.json'
import { simulateVitalPortIngest } from './simulate-vitalport-ingest.ts'

const USER = '00000000-0000-0000-0000-000000000001'

describe('VitalPort ingest simulation', () => {
  it('emits the production rows for the first observed Berlin day', () => {
    const { metrics, sleep } = simulateVitalPortIngest(fixture, USER, 'Europe/Berlin')
    const metricsForFirstDay = metrics.filter(row => row.date === '2026-08-06')
    const sleepForFirstDay = sleep.find(row => row.date === '2026-08-06')

    expect(metricsForFirstDay).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: 'steps', sum_val: 7124 }),
      expect.objectContaining({ metric: 'distance', sum_val: 4.8652 }),
      expect.objectContaining({ metric: 'activeEnergy', sum_val: 200 }),
    ]))
    expect(sleepForFirstDay).toEqual(expect.objectContaining({
      date: '2026-08-06',
      duration_hours: 23020.45742201805 / 3600,
      deep_hours: null,
      rem_hours: null,
      core_hours: null,
    }))
    expect(metrics).not.toContainEqual(expect.objectContaining({ metric: 'restingEnergyKcal' }))
    expect(metrics.filter(row => ['restingHeartRate', 'hrv', 'oxygenSaturation', 'respiratoryRate', 'vo2max'].includes(row.metric))).toEqual([])
  })
})
