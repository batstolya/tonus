import { describe, expect, it } from 'vitest'
import fixture from '../_shared/fixtures/vitalport-xiaomi.json'
import { normalizeHealthPayload } from './normalize.ts'

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
