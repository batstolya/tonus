import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { SleepScreen } from './SleepScreen'
import type { DailyMetrics } from '../../types'

const night = (date: string, extra: Partial<DailyMetrics> = {}): DailyMetrics => ({
  date, sleepHours: 8, sleepBedtime: `${date}T23:00:00.000Z`,
  sleepWakeTime: `${date}T07:00:00.000Z`, ...extra,
} as DailyMetrics)

// Pin the UI language: detectLang falls back to navigator.language otherwise,
// and the app never actually renders the raw Russian dictionary keys (uk/en
// are the only selectable languages).
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); localStorage.clear() })

describe('SleepScreen awake time', () => {
  it('shows average efficiency when awake time is known', () => {
    renderWithProviders(<SleepScreen daily={[night('2026-08-12', { sleepAwake: 0.15 })]} />)
    expect(screen.getByText(/98%/)).toBeTruthy()
  })

  it('shows no efficiency stat when no night reports awake time', () => {
    renderWithProviders(<SleepScreen daily={[night('2026-08-12')]} />)
    expect(screen.queryByText(/efficiency/i)).toBeNull()
  })

  it('renders awake minutes per night in the table', () => {
    renderWithProviders(<SleepScreen daily={[night('2026-08-12', { sleepAwake: 0.15 })]} />)
    expect(screen.getByText('0h 9m')).toBeTruthy()
  })
})
