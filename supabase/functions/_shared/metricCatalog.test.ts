import { describe, expect, it } from 'vitest'
import { METRIC_CATALOG, CATALOG_BY_HAE, CATALOG_BY_HK, aggregateDay, haeValue } from './metricCatalog.ts'

const entry = (key: string) => METRIC_CATALOG.find(e => e.key === key)!

describe('METRIC_CATALOG', () => {
  it('has 15 entries with unique keys, HAE names and HealthKit types', () => {
    expect(METRIC_CATALOG).toHaveLength(15)
    expect(new Set(METRIC_CATALOG.map(e => e.key)).size).toBe(15)
    expect(CATALOG_BY_HAE.size).toBe(15)
    expect(CATALOG_BY_HK.size).toBe(15)
  })
})

describe('haeValue', () => {
  it('converts basal energy from kJ to kcal and leaves kcal alone', () => {
    expect(haeValue(entry('basalEnergy'), 41.84, 'kJ')).toBeCloseTo(10)
    expect(haeValue(entry('basalEnergy'), 10, 'kcal')).toBe(10)
  })

  it('leaves metrics without a unit rule unchanged', () => {
    expect(haeValue(entry('walkingAsymmetry'), 28.9, '%')).toBe(28.9)
  })
})

describe('aggregateDay', () => {
  it('sums within a source and takes the max across sources', () => {
    const r = aggregateDay(entry('basalEnergy'), [
      { v: 10, src: 'Watch' }, { v: 5, src: 'Watch' }, { v: 12, src: 'Watch|Watch' },
    ])
    expect(r).toEqual({ sum_val: 15 })
  })

  it('counts events per source and takes the max', () => {
    const r = aggregateDay(entry('handwashing'), [
      { v: 7, src: 'Watch' }, { v: 22, src: 'Watch' }, { v: 9, src: 'Watch' },
    ])
    expect(r).toEqual({ sum_val: 3 })
  })

  it('averages plain metrics and keeps min and max', () => {
    expect(aggregateDay(entry('walkingSpeed'), [
      { v: 3, src: 'iPhone' }, { v: 5, src: 'iPhone' },
    ])).toEqual({ avg_val: 4, min_val: 3, max_val: 5 })
  })

  it('averages decibels as energy, so loud periods are not understated', () => {
    const r = aggregateDay(entry('environmentalAudio'), [{ v: 50, src: 'W' }, { v: 80, src: 'W' }])
    expect(r && 'avg_val' in r ? r.avg_val : NaN).toBeCloseTo(77.0, 1)
    expect(r && 'max_val' in r ? r.max_val : NaN).toBe(80)
  })

  it('returns null for a day without points', () => {
    expect(aggregateDay(entry('walkingSpeed'), [])).toBeNull()
  })
})
