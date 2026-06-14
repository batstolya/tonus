import { useState, useCallback } from 'react'
import type { DailyMetrics, HeartRateSample, CalendarEvent, ParseProgress } from '../types'

export type AppView = 'upload' | 'dashboard' | 'heart-rate' | 'metrics' | 'stress-map' | 'sleep' | 'insights'

export interface AppState {
  view: AppView
  daily: DailyMetrics[]
  heartRateSamples: HeartRateSample[]
  events: CalendarEvent[]
  parseProgress: ParseProgress | null
  error: string | null
}

const initial: AppState = {
  view: 'upload',
  daily: [],
  heartRateSamples: [],
  events: [],
  parseProgress: null,
  error: null,
}

export function useAppStore() {
  const [state, setState] = useState<AppState>(initial)

  const setView = useCallback((view: AppView) => setState(s => ({ ...s, view })), [])
  const setDaily = useCallback((daily: DailyMetrics[], heartRateSamples: HeartRateSample[]) =>
    setState(s => ({ ...s, daily, heartRateSamples, view: 'dashboard', parseProgress: null, error: null })), [])
  const setEvents = useCallback((events: CalendarEvent[]) => setState(s => ({ ...s, events })), [])
  const setProgress = useCallback((p: ParseProgress) => setState(s => ({ ...s, parseProgress: p })), [])
  const setError = useCallback((error: string) => setState(s => ({ ...s, error, parseProgress: null })), [])
  const reset = useCallback(() => setState(initial), [])

  return { state, setView, setDaily, setEvents, setProgress, setError, reset }
}
