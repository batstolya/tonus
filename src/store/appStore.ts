import { useState, useCallback, useEffect } from 'react'
import type { DailyMetrics, HeartRateSample, CalendarEvent, ParseProgress } from '../types'

export type AppView = 'upload' | 'dashboard' | 'heart-rate' | 'metrics' | 'stress-map' | 'sleep' | 'activity' | 'insights' | 'supplements' | 'labs' | 'settings' | 'goals' | 'concerns' | 'hair' | 'research'

export type DeviceType = 'apple_watch' | 'xiaomi'

const VIEWS: AppView[] = ['dashboard', 'heart-rate', 'metrics', 'stress-map', 'sleep', 'activity', 'insights', 'research', 'supplements', 'labs', 'settings', 'goals', 'concerns', 'hair']

function hashToView(): AppView {
  const hash = window.location.hash.slice(1) as AppView
  return VIEWS.includes(hash) ? hash : 'dashboard'
}

export interface AppState {
  view: AppView
  daily: DailyMetrics[]
  heartRateSamples: HeartRateSample[]
  events: CalendarEvent[]
  parseProgress: ParseProgress | null
  error: string | null
  deviceType: DeviceType | null
}

function loadDeviceType(): DeviceType | null {
  const v = localStorage.getItem('deviceType')
  return v === 'apple_watch' || v === 'xiaomi' ? v : null
}

const initial: AppState = {
  view: hashToView(),
  daily: [],
  heartRateSamples: [],
  events: [],
  parseProgress: null,
  error: null,
  deviceType: loadDeviceType(),
}

export function useAppStore() {
  const [state, setState] = useState<AppState>(initial)

  const setView = useCallback((view: AppView) => {
    window.location.hash = view
    setState(s => ({ ...s, view }))
  }, [])

  // Sync browser back/forward
  useEffect(() => {
    const handler = () => {
      const view = hashToView()
      setState(s => ({ ...s, view }))
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  const setDeviceType = useCallback((deviceType: DeviceType) => {
    localStorage.setItem('deviceType', deviceType)
    setState(s => ({ ...s, deviceType }))
  }, [])

  const setDaily = useCallback((daily: DailyMetrics[], heartRateSamples: HeartRateSample[], keepView = false) =>
    setState(s => ({ ...s, daily, heartRateSamples, view: keepView ? s.view : 'dashboard', parseProgress: null, error: null })), [])
  const setEvents = useCallback((events: CalendarEvent[], source?: string) =>
    setState(s => {
      if (!source) return { ...s, events }
      const kept = s.events.filter(e => e.source !== source)
      return { ...s, events: [...kept, ...events] }
    }), [])
  const setProgress = useCallback((p: ParseProgress) => setState(s => ({ ...s, parseProgress: p })), [])
  const setError = useCallback((error: string) => setState(s => ({ ...s, error, parseProgress: null })), [])
  const reset = useCallback(() => {
    window.location.hash = ''
    setState(initial)
  }, [])

  return { state, setView, setDaily, setEvents, setProgress, setError, reset, setDeviceType }
}
