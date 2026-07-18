import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { CalendarEvent, DailyMetrics, HeartRateSample } from '../types'
import { syncMetricsToSupabase, syncHRSamples } from '../lib/sync'
import { persistDailyScores } from '../lib/scores'
import { saveCalendarEvents, loadCalendarEvents } from '../lib/calendarSync'
import { connectGoogleCalendar, silentGoogleCalendarSync, isGoogleCalendarAvailable } from '../lib/googleCalendar'
import { shouldAutoSync } from '../lib/syncSchedule'
import type { useT } from '../lib/i18n'

type Args = {
  user: User | null
  dbLoading: boolean
  t: ReturnType<typeof useT>['t']
  locale: ReturnType<typeof useT>['locale']
  setDaily: (daily: DailyMetrics[], samples: HeartRateSample[], keepView?: boolean) => void
  setEvents: (events: CalendarEvent[], source?: string) => void
}

// Импорт данных (файл/ICS/Google) и авто-синк календаря. Вынесено из App.tsx
// (2026-07-18 monolith-decomposition spec) без изменения поведения.
export function useImportHandlers({ user, dbLoading, t, locale, setDaily, setEvents }: Args) {
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showGoogleEvents, setShowGoogleEvents] = useState(true)
  const [calSyncTimes, setCalSyncTimes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('cal_sync_times') ?? '{}') } catch { return {} }
  })

  async function handleDone(daily: DailyMetrics[], samples: HeartRateSample[], filename = 'export') {
    setDaily(daily, samples)
    if (!user) return
    loadCalendarEvents(user.id).then(calEvents => { if (calEvents.length > 0) setEvents(calEvents) })
    setSyncMsg(t('Синхронизируем…'))
    try {
      const [result, hrOk] = await Promise.all([
        syncMetricsToSupabase(user.id, daily, filename),
        syncHRSamples(user.id, samples),
      ])
      if (!hrOk) {
        setSyncMsg(t('⚠️ Не удалось сохранить пульс — подробности в консоли (F12)'))
        setTimeout(() => setSyncMsg(null), 10000)
        return
      }
      if (result.daysAdded > 0) {
        setSyncMsg(t('Добавлено {n} новых дней', { n: result.daysAdded }))
      } else {
        setSyncMsg(t('Данные актуальны'))
      }
      persistDailyScores(user.id, daily).catch(() => {})
    } catch (e) {
      setSyncMsg(t('Ошибка синхронизации: {msg}', { msg: (e as Error)?.message ?? 'unknown' }))
    }
    setTimeout(() => setSyncMsg(null), 4000)
  }

  async function handleEvents(events: CalendarEvent[], source = 'ics') {
    const tagged = events.map(e => ({ ...e, source }))
    setEvents(tagged, source)
    const now = new Date().toLocaleDateString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    const updated = { ...calSyncTimes, [source]: now }
    setCalSyncTimes(updated)
    localStorage.setItem('cal_sync_times', JSON.stringify(updated))
    // ISO-метка для гейта авто-синка (локализованную строку выше распарсить нельзя)
    if (source === 'google') localStorage.setItem('google_last_sync_iso', new Date().toISOString())
    if (!user) return
    const ok = await saveCalendarEvents(user.id, tagged, source)
    if (!ok) {
      setSyncMsg(t('⚠️ Таблица calendar_events не создана — запусти SQL в Supabase'))
      setTimeout(() => setSyncMsg(null), 8000)
    } else {
      setSyncMsg(t('Сохранено {n} событий календаря', { n: events.length }))
      setTimeout(() => setSyncMsg(null), 3000)
    }
  }

  async function handleGoogleCalendar() {
    setGoogleLoading(true)
    try {
      const events = await connectGoogleCalendar()
      await handleEvents(events, 'google')
      setSyncMsg(t('Загружено {n} событий из Google', { n: events.length }))
      setTimeout(() => setSyncMsg(null), 4000)
    } catch {
      setSyncMsg(t('Ошибка Google Calendar'))
      setTimeout(() => setSyncMsg(null), 3000)
    }
    setGoogleLoading(false)
  }

  // Авто-синхронизация Google Calendar «хотя бы раз в день»: при открытии приложения,
  // если в этом браузере уже был грант Google и прошло >24ч — тихо обновляем без попапа.
  // Серверный cron невозможен (браузерный OAuth-токен без refresh-token).
  const googleAutoSyncedRef = useRef(false)
  useEffect(() => {
    if (!user || dbLoading || googleAutoSyncedRef.current) return
    if (!isGoogleCalendarAvailable()) return
    const lastIso = localStorage.getItem('google_last_sync_iso')
    if (!lastIso || !shouldAutoSync(lastIso)) return // ещё не подключали тут / синк свежий
    googleAutoSyncedRef.current = true
    silentGoogleCalendarSync()
      .then(events => { if (events && events.length) handleEvents(events, 'google') })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dbLoading])

  return {
    syncMsg, googleLoading, showGoogleEvents, setShowGoogleEvents,
    calSyncTimes, handleDone, handleEvents, handleGoogleCalendar,
  }
}
