import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isDemoActive } from '../lib/demo'
import { loadMetricsFromSupabase, loadHRSamples } from '../lib/sync'
import { persistDailyScores } from '../lib/scores'
import { loadCalendarEvents } from '../lib/calendarSync'
import { startEffect } from '../lib/startEffect'
import { syncProfileTimezone } from '../lib/api/settings'
import type { IntakeEvent } from '../lib/api/intake'
import type { DailyMetrics, HeartRateSample, CalendarEvent } from '../types'

type Args = {
  user: User | null
  setDaily: (daily: DailyMetrics[], samples: HeartRateSample[], keepView?: boolean) => void
  setEvents: (events: CalendarEvent[], source?: string) => void
}

// Data load on sign-in + profiles.timezone sync. Extracted from App.tsx
// (2026-07-18 monolith-decomposition spec) with no behavior change.
export function useAppBootstrap({ user, setDaily, setEvents }: Args) {
  const [dbLoading, setDbLoading] = useState(true)
  const [intakeEvents, setIntakeEvents] = useState<IntakeEvent[]>([])

  // Держим profiles.timezone в такт устройству: серверные локальные времена
  // (отчёт, чат, бот) читают эту колонку через _shared/userTimezone.ts.
  const tzSyncUserId = !isDemoActive() && user ? user.id : null
  useEffect(() => {
    if (!tzSyncUserId) return
    startEffect(() => syncProfileTimezone(tzSyncUserId).catch(() => {}))
  }, [tzSyncUserId])

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (!user) { setDbLoading(false); return }
      setDbLoading(true)
      // Демо-режим: фикстурные данные вместо Supabase (метрики + события лога).
      if (isDemoActive()) {
        const [{ makeDemoDaily, makeDemoHRSamples, makeDemoEvents }, { demoList }] = await Promise.all([
          import('../lib/demoFixture'),
          import('../lib/demoDb'),
        ])
        if (cancelled) return
        setDaily(makeDemoDaily(), makeDemoHRSamples(), true)
        setEvents(makeDemoEvents())
        setIntakeEvents(demoList('intake_events') as IntakeEvent[])
        setDbLoading(false)
        return
      }
      const [stored, intakeRes, calEvents] = await Promise.all([
        loadMetricsFromSupabase(user!.id),
        supabase.from('intake_events').select('*').eq('user_id', user!.id)
          .order('ts', { ascending: false }).limit(400),
        loadCalendarEvents(user!.id),
      ])

      if (cancelled) return

      const hrSamples = await loadHRSamples(user!.id)
      if (cancelled) return

      if (stored.length > 0) {
        setDaily(stored, hrSamples, true)
        persistDailyScores(user!.id, stored).catch(() => {})
      }
      if (intakeRes.data) setIntakeEvents(intakeRes.data as IntakeEvent[])
      if (calEvents.length > 0) setEvents(calEvents)
      setDbLoading(false)
    }

    startEffect(init)
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return { dbLoading, intakeEvents, setIntakeEvents }
}
