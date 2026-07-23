import { describe, it, expect } from 'vitest'
import { NAV_GROUPS, getActiveGroup, getActiveSubView, filterNavGroups } from './navigation'
import type { AvailableMetrics } from '../lib/availableMetrics'

describe('getActiveGroup', () => {
  it('maps every configured view to its group', () => {
    for (const g of NAV_GROUPS) {
      for (const v of g.views) expect(getActiveGroup(v.view)).toBe(g.id)
    }
  })
  it('maps hair (not in any group) to journal', () => {
    expect(getActiveGroup('hair')).toBe('journal')
  })
  it('returns null for views outside groups', () => {
    expect(getActiveGroup('dashboard')).toBeNull()
    expect(getActiveGroup('settings')).toBeNull()
  })
})

describe('getActiveSubView', () => {
  it('highlights concerns when on hair', () => {
    expect(getActiveSubView('hair')).toBe('concerns')
  })
  it('is identity otherwise', () => {
    expect(getActiveSubView('sleep')).toBe('sleep')
  })
})

describe('filterNavGroups', () => {
  it('hides metric-gated views when the metric is absent', () => {
    const none: AvailableMetrics = {
      hasHeartRate: false,
      hasSleep: false,
      hasActivity: false,
      hasStress: false,
      hasHRV: false,
      hasSpO2: false,
      hasRespiratoryRate: false,
      hasWristTemp: false,
    }
    const body = filterNavGroups(none).find(g => g.id === 'body')!
    expect(body.views.map(v => v.view)).toEqual(['metrics'])
  })
  it('keeps everything when all metrics available', () => {
    const all: AvailableMetrics = {
      hasHeartRate: true,
      hasSleep: true,
      hasActivity: true,
      hasStress: true,
      hasHRV: true,
      hasSpO2: true,
      hasRespiratoryRate: true,
      hasWristTemp: true,
    }
    const body = filterNavGroups(all).find(g => g.id === 'body')!
    expect(body.views).toHaveLength(5)
  })
})
