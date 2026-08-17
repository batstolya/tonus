import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderWithProviders, screen, fireEvent, cleanup } from '../../test/utils'
import { Sidebar } from './Sidebar'
import { filterNavGroups } from '../../app/navigation'
import type { AvailableMetrics } from '../../lib/availableMetrics'

const allMetrics = {
  hasHeartRate: true, hasSleep: true, hasActivity: true, hasStress: true,
} as AvailableMetrics

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); localStorage.clear() })

function renderSidebar(over: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const onNavigate = vi.fn()
  const onToggleCollapsed = vi.fn()
  const { container } = renderWithProviders(
    <Sidebar
      groups={filterNavGroups(allMetrics)}
      view="sleep"
      activeGroup="body"
      activeSubView="sleep"
      collapsed={false}
      onToggleCollapsed={onToggleCollapsed}
      onNavigate={onNavigate}
      {...over}
    />,
  )
  return { container, onNavigate, onToggleCollapsed }
}

describe('Sidebar', () => {
  it('lists dashboard, every group caption, every sub-view and settings', () => {
    renderSidebar()
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByText('Body')).toBeTruthy()
    expect(screen.getByText('Journal')).toBeTruthy()
    expect(screen.getByText('Coach')).toBeTruthy()
    for (const label of ['Overview', 'Heart rate', 'Sleep', 'Activity', 'Stress', 'Supplements', 'Nutrition', 'Lab results', 'Concerns', 'Insights', 'Research', 'Experiments', 'Goals']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
  })

  it('omits sub-views whose metric is missing', () => {
    renderSidebar({ groups: filterNavGroups({ ...allMetrics, hasSleep: false }) })
    expect(screen.queryByRole('button', { name: 'Sleep' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy()
  })

  it('marks the current sub-view active', () => {
    renderSidebar()
    expect(screen.getByRole('button', { name: 'Sleep' }).className).toContain('active')
    expect(screen.getByRole('button', { name: 'Overview' }).className).not.toContain('active')
  })

  it('marks concerns active while on the hair screen', () => {
    renderSidebar({ view: 'hair', activeGroup: 'journal', activeSubView: 'concerns' })
    expect(screen.getByRole('button', { name: 'Concerns' }).className).toContain('active')
  })

  it('marks settings active on the settings screen', () => {
    renderSidebar({ view: 'settings', activeGroup: null, activeSubView: 'settings' })
    expect(screen.getByRole('button', { name: 'Settings' }).className).toContain('active')
  })

  it('navigates when a sub-view is clicked', () => {
    const { onNavigate } = renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))
    expect(onNavigate).toHaveBeenCalledWith('activity')
  })

  it('collapses and expands through the toggle', () => {
    const { onToggleCollapsed } = renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse menu' }))
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
  })

  it('collapsed: shows group icon buttons that open the group default view', () => {
    const { container, onNavigate } = renderSidebar({ collapsed: true })
    expect(container.querySelector('.sidebar')!.className).toContain('sidebar--collapsed')
    expect(screen.getByRole('button', { name: 'Expand menu' })).toBeTruthy()
    // The label span is display:none while collapsed, so the accessible
    // name must come from aria-label, not text content.
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Body' }))
    expect(onNavigate).toHaveBeenCalledWith('metrics')
  })

  it('collapsed: keeps sub-views reachable through the flyout markup', () => {
    const { container, onNavigate } = renderSidebar({ collapsed: true })
    expect(container.querySelectorAll('.sidebar-flyout').length).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: 'Goals' }))
    expect(onNavigate).toHaveBeenCalledWith('goals')
  })
})
