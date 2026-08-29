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

  // A measured zero is a real measurement, not "unknown" — it must display
  // (not '—') and must count toward efficiency (100%, not excluded). A
  // truthiness check (`d.sleepAwake` instead of `d.sleepAwake != null`)
  // would treat 0 as falsy/missing and fail both assertions below.
  it('shows a measured zero awake time as displayed, not missing', () => {
    renderWithProviders(<SleepScreen daily={[night('2026-08-12', { sleepAwake: 0 })]} />)
    expect(screen.getByText('0h 0m')).toBeTruthy()
    expect(screen.getByText(/100%/)).toBeTruthy()
  })
})

describe('SleepScreen average clock stats', () => {
  // Local-time strings on purpose: the stat reads local hours, so a Z-suffixed
  // fixture would make this test depend on the runner's timezone.
  const nightAt = (date: string, bed: string, wake: string): DailyMetrics => ({
    date, sleepHours: 7.5, sleepBedtime: `${date}T${bed}:00`,
    sleepWakeTime: `${date}T${wake}:00`,
  } as DailyMetrics)

  it('keeps the average wake-up near the typical morning despite a midday outlier', () => {
    const days = Array.from({ length: 27 }, (_, i) =>
      nightAt(`2026-08-${String(i + 1).padStart(2, '0')}`, '01:50', '09:50'))
    days.push(nightAt('2026-08-28', '04:10', '12:10'))

    const { container } = renderWithProviders(<SleepScreen daily={days} />)
    const stats = [...container.querySelectorAll('.stat')]
      .map(el => el.textContent ?? '')
    const wakeStat = stats.find(s => /wake/i.test(s)) ?? ''

    // Linear averaging on the "hours from noon" scale used to report ~07:00.
    expect(wakeStat).toMatch(/^09:5\d/)
  })
})
