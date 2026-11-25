import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { MetricsScreen } from './MetricsScreen'
import type { DailyMetrics } from '../../types'

beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); localStorage.clear() })

describe('MetricsScreen metric order', () => {
  const daily: DailyMetrics[] = [{
    date: '2026-11-24',
    heartRate: { avg: 70, min: 50, max: 110 },
    physicalEffort: 3.9,
    basalEnergy: 1818,
  }]

  it('still opens on heart rate when catalog metrics are present', () => {
    const { container } = renderWithProviders(<MetricsScreen daily={daily} />)
    const primary = container.querySelector('select') as HTMLSelectElement
    expect(primary.value).toBe('heartRate')
  })

  it('lists existing metrics before catalog metrics', () => {
    const { container } = renderWithProviders(<MetricsScreen daily={daily} />)
    const options = [...(container.querySelector('select') as HTMLSelectElement).options].map(o => o.value)
    expect(options.indexOf('heartRate')).toBeLessThan(options.indexOf('physicalEffort'))
  })
})
