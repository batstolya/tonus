import { describe, expect, it } from 'vitest'
import fixture from '../_shared/fixtures/vitalport-xiaomi.json'
import { parseHRSamples } from '../_shared/hae.ts'
import { normalizeHealthPayload, storeNormalizeAndParseHealthPayload } from './normalize.ts'

const USER = '00000000-0000-0000-0000-000000000001'

describe('health payload normalization', () => {
  it('returns an HAE payload by object identity', () => {
    const hae = { data: { metrics: [] } }

    expect(normalizeHealthPayload(hae, 'Europe/Berlin')).toBe(hae)
  })

  it('adapts a VitalPort payload with the supplied timezone', () => {
    const normalized = normalizeHealthPayload(fixture, 'Europe/Berlin')
    const steps = normalized.data?.metrics?.find(metric => metric.name === 'step_count')

    expect(steps?.data?.[0].date).toBe('2026-08-06')
  })

  it('returns an unrelated JSON object by identity', () => {
    const unrelated = { event: 'health.sync', items: [] }

    expect(normalizeHealthPayload(unrelated, 'Europe/Berlin')).toBe(unrelated)
  })
})

describe('stored health payload normalization', () => {
  it('stores VitalPort input first and then loads its timezone before normalization', async () => {
    const calls: string[] = []
    let stored: unknown

    const parsed = await storeNormalizeAndParseHealthPayload(USER, fixture, {
      storeRaw: async value => { calls.push('store'); stored = value },
      loadTimezone: async () => { calls.push('timezone'); return ' Europe/Berlin ' },
    })

    expect(calls).toEqual(['store', 'timezone'])
    expect(stored).toBe(fixture)
    expect(parsed.metrics.find(metric => metric.metric === 'steps')?.date).toBe('2026-08-06')
  })

  it('stores legacy HAE input without loading a profile timezone', async () => {
    const hae = { data: { metrics: [] } }
    let timezoneLoads = 0

    const parsed = await storeNormalizeAndParseHealthPayload(USER, hae, {
      storeRaw: async value => { expect(value).toBe(hae) },
      loadTimezone: async () => { timezoneLoads += 1; return 'Europe/Berlin' },
    })

    expect(parsed.metrics).toEqual([])
    expect(parsed.sleep).toEqual([])
    expect(parsed.normalizedPayload).toBe(hae)
    expect(timezoneLoads).toBe(0)
  })

  it.each([undefined, '', '   '])('uses UTC when the profile timezone is %j', async timezone => {
    const parsed = await storeNormalizeAndParseHealthPayload(USER, fixture, {
      storeRaw: async () => {},
      loadTimezone: async () => timezone,
    })

    expect(parsed.metrics.find(metric => metric.metric === 'steps')?.date).toBe('2026-08-05')
  })

  it('returns normalized input for heart-rate parsing at the caller\'s original write position', async () => {
    const hae = { data: { metrics: [{ name: 'heart_rate', data: [{ date: '2026-08-05T12:00:00Z', qty: 72 }] }] } }
    const deps = { storeRaw: async () => {}, loadTimezone: async () => 'UTC' }
    const prepared = await storeNormalizeAndParseHealthPayload(USER, hae, deps)

    expect(parseHRSamples(USER, prepared.normalizedPayload)).toEqual([
      { user_id: USER, ts: '2026-08-05T12:00:00.000Z', bpm: 72, source: 'Apple' },
    ])
  })

  it('does not parse malformed heart-rate timestamps before metric writes', async () => {
    const hae = { data: { metrics: [
      { name: 'step_count', data: [{ date: '2026-08-05', qty: 10 }] },
      { name: 'heart_rate', data: [{ date: 'not-a-date', qty: 72 }] },
    ] } }

    const prepared = await storeNormalizeAndParseHealthPayload(USER, hae, {
      storeRaw: async () => {},
      loadTimezone: async () => 'UTC',
    })

    expect(prepared.metrics.find(metric => metric.metric === 'steps')?.sum_val).toBe(10)
    expect(() => parseHRSamples(USER, prepared.normalizedPayload)).toThrow('Invalid time value')
  })
})
