import React from 'react'
import type { AppView } from '../store/appStore'
import type { AvailableMetrics } from '../lib/availableMetrics'

export type GroupId = 'body' | 'journal' | 'coach'

export type NavView = { view: AppView; label: string; requiresMetric?: keyof AvailableMetrics }

export type NavGroup = {
  id: GroupId
  label: string
  defaultView: AppView
  icon: React.ReactElement
  views: NavView[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'body',
    label: 'Тело',
    defaultView: 'metrics',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
    views: [
      { view: 'metrics', label: 'Обзор' },
      { view: 'heart-rate', label: 'Пульс', requiresMetric: 'hasHeartRate' },
      { view: 'sleep', label: 'Сон', requiresMetric: 'hasSleep' },
      { view: 'activity', label: 'Активность', requiresMetric: 'hasActivity' },
      { view: 'stress-map', label: 'Стресс', requiresMetric: 'hasStress' },
    ],
  },
  {
    id: 'journal',
    label: 'Дневник',
    defaultView: 'supplements',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
    views: [
      { view: 'supplements', label: 'Препараты' },
      { view: 'nutrition', label: 'Питание' },
      { view: 'labs', label: 'Анализы' },
      { view: 'concerns', label: 'Проблемы' },
    ],
  },
  {
    id: 'coach',
    label: 'Коуч',
    defaultView: 'insights',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>,
    views: [
      { view: 'insights', label: 'Инсайты' },
      { view: 'research', label: 'Исследования' },
      { view: 'experiments', label: 'Эксперименты' },
      { view: 'goals', label: 'Цели' },
    ],
  },
]

export function getActiveGroup(view: AppView): GroupId | null {
  if (view === 'hair') return 'journal'
  for (const g of NAV_GROUPS) {
    if (g.views.some(v => v.view === view)) return g.id
  }
  return null
}

export function getActiveSubView(view: AppView): AppView {
  if (view === 'hair') return 'concerns'
  return view
}

export function filterNavGroups(availableMetrics: AvailableMetrics) {
  return NAV_GROUPS.map(g => ({
    ...g,
    views: g.views.filter(v => !v.requiresMetric || availableMetrics[v.requiresMetric]),
  }))
}
