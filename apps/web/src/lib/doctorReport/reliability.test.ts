import { describe, it, expect } from 'vitest'
import { bandOf, reliabilityOf, supportsClaims } from './reliability'

describe('bandOf', () => {
  it('draws the boundaries at 80, 60 and 40 percent', () => {
    expect(bandOf(80)).toBe('high')
    expect(bandOf(79)).toBe('medium')
    expect(bandOf(60)).toBe('medium')
    expect(bandOf(59)).toBe('low')
    expect(bandOf(40)).toBe('low')
    expect(bandOf(39)).toBe('insufficient')
  })

  it('lets derived claims through only at medium or better', () => {
    expect(supportsClaims('high')).toBe(true)
    expect(supportsClaims('medium')).toBe(true)
    expect(supportsClaims('low')).toBe(false)
    expect(supportsClaims('insufficient')).toBe(false)
  })
})

describe('reliabilityOf', () => {
  it('counts coverage against calendar days and finds the longest gap', () => {
    const have = new Set(['2026-07-01', '2026-07-02', '2026-07-06', '2026-07-10'])
    const r = reliabilityOf(have, '2026-07-01', '2026-07-10')
    expect(r.daysInPeriod).toBe(10)
    expect(r.daysWithData).toBe(4)
    expect(r.coveragePct).toBe(40)
    expect(r.band).toBe('low')
    expect(r.maxGap).toBe(3) // 07-03, 07-04, 07-05
  })

  it('reports a fully empty window as one long gap', () => {
    const r = reliabilityOf(new Set(), '2026-07-01', '2026-07-05')
    expect(r.coveragePct).toBe(0)
    expect(r.band).toBe('insufficient')
    expect(r.maxGap).toBe(5)
  })
})
