import { describe, it, expect } from 'vitest'
import { shouldAutoSync, DAY_MS } from './syncSchedule'

describe('shouldAutoSync', () => {
  const now = new Date('2026-06-22T18:00:00.000Z')

  it('syncs when never synced before (null)', () => {
    expect(shouldAutoSync(null, now)).toBe(true)
  })

  it('does not sync when last sync was under 24h ago', () => {
    const lastSync = new Date('2026-06-22T06:00:00.000Z').toISOString() // 12h ago
    expect(shouldAutoSync(lastSync, now)).toBe(false)
  })

  it('syncs when last sync was over 24h ago', () => {
    const lastSync = new Date('2026-06-21T06:00:00.000Z').toISOString() // 36h ago
    expect(shouldAutoSync(lastSync, now)).toBe(true)
  })

  it('syncs at exactly 24h (boundary)', () => {
    const lastSync = new Date(now.getTime() - DAY_MS).toISOString()
    expect(shouldAutoSync(lastSync, now)).toBe(true)
  })

  it('syncs when the stored value is unparseable', () => {
    expect(shouldAutoSync('not-a-date', now)).toBe(true)
  })
})
