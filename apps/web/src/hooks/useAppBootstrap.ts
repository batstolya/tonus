import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isDemoActive } from '../lib/demo'
import { translateStandalone } from '../lib/translate'
import { useT } from '../lib/i18n'
import { loadMetricsFromSupabase } from '../lib/sync'
import { mergeDaily } from '../lib/mergeDaily'
import { persistDailyScores } from '../lib/scores'
import { loadCalendarEvents } from '../lib/calendarSync'
import { startEffect } from '../lib/startEffect'
import { syncProfileTimezone, syncProfileLang } from '../lib/api/settings'
import type { IntakeEvent } from '../lib/api/intake'
import type { DailyMetrics, HeartRateSample, CalendarEvent } from '../types'

// Sized by the hungriest reader, not by the dashboard: the doctor report offers
// a 365-day period and looks back another 28 for its baselines. Anything
// shorter would let a report generated in the first second of a page load come
// out quietly truncated — a wrong medical document, which is a worse failure
// than a slow one. Everything older than this arrives afterwards and is only
// read by the all-time chart preset.
const RECENT_WINDOW_DAYS = 400

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

  // То же для языка: cron-разборы (коуч, Telegram) не видят запроса из браузера
  // и берут язык ответа из profiles.lang.
  const { lang } = useT()
  useEffect(() => {
    if (!tzSyncUserId) return
    startEffect(() => syncProfileLang(tzSyncUserId, lang).catch(() => {}))
  }, [tzSyncUserId, lang])

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
        // Demo event titles are stored in Russian (the i18n key); translate them
        // to the active locale so a uk/en demo guest doesn't read Russian cards.
        setEvents(makeDemoEvents().map(e => ({ ...e, title: translateStandalone(e.title) })))
        setIntakeEvents(demoList('intake_events') as IntakeEvent[])
        setDbLoading(false)
        return
      }
      // Two phases. The screens read the tail of this array, so a window is
      // enough to paint — three pages instead of five against a seven-year
      // history. Everything older is folded in afterwards; only the all-time
      // chart preset reaches that far back.
      const windowStart = new Date()
      windowStart.setDate(windowStart.getDate() - RECENT_WINDOW_DAYS)
      const since = windowStart.toISOString().slice(0, 10)

      const [stored, intakeRes, calEvents] = await Promise.all([
        loadMetricsFromSupabase(user!.id, { since }),
        supabase.from('intake_events').select('*').eq('user_id', user!.id)
          .order('ts', { ascending: false }).limit(400),
        loadCalendarEvents(user!.id),
      ])

      if (cancelled) return

      // Heart-rate samples are not loaded here any more. There are tens of
      // thousands of them in the 90-day window (38k on the author's account),
      // fetched a thousand at a time in a sequential loop — 39 round trips that
      // every screen waited behind, for data only the stress map reads. It
      // loads them itself when it opens.
      if (stored.length > 0) setDaily(stored, [], true)
      if (intakeRes.data) setIntakeEvents(intakeRes.data as IntakeEvent[])
      if (calEvents.length > 0) setEvents(calEvents)
      setDbLoading(false)

      // Everything before the window, once the screen is up. Failure here is
      // silent on purpose: the recent data is already on screen and is what
      // almost every view uses.
      const older = await loadMetricsFromSupabase(user!.id, { before: since }).catch(() => [])
      if (cancelled) return
      const full = older.length ? mergeDaily(stored, older) : stored
      if (older.length) setDaily(full, [], true)

      // Deliberately after the full history, not after the window: scores lean
      // on 30-day rolling baselines, so computing them from a truncated array
      // would write worse numbers over good ones for the oldest days in it.
      if (full.length > 0) persistDailyScores(user!.id, full).catch(() => {})
    }

    startEffect(init)
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return { dbLoading, intakeEvents, setIntakeEvents }
}
