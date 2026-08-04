import { useEffect, useMemo, useState } from 'react'
import type { HeartRateSample, CalendarEvent } from '../../types'
import { useT } from '../../lib/i18n'
import { Icon } from '../../lib/icons'
import { buildStressMap } from '../../lib/stressMap'
import { loadHRSamples } from '../../lib/sync'
import { StressCharts } from './StressCharts'

interface Props {
  /** Seeded by a file import; empty on a normal page load. */
  heartRateSamples: HeartRateSample[]
  userId?: string
  events: CalendarEvent[]
  onGoogleCalendar?: () => void
  googleConnected?: boolean
  showGoogle?: boolean
  onToggleGoogle?: (v: boolean) => void
}

function fmtDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

type Mode = 'stress' | 'date' | 'charts'

// The list is sorted by how much an event moved the pulse, so the answer is
// almost always in the first few rows. Rendering all of them (about 400 here)
// costs a lot of DOM for lines nobody scrolls to.
const PAGE = 20

// The samples this screen needs are tens of thousands of rows, so they are
// fetched when it opens rather than during app start-up, where every other
// screen used to wait behind them. A fresh import seeds them through the prop,
// and then there is nothing to fetch.
export function StressMapScreen({ heartRateSamples, userId, events, onGoogleCalendar, googleConnected = false, showGoogle = true, onToggleGoogle }: Props) {
  const { t, locale } = useT()
  const [mode, setMode] = useState<Mode>('stress')
  const [shown, setShown] = useState(PAGE)
  // Derived, not mirrored: a fresh import hands the samples in through the
  // prop, and only when it does not do we go and fetch them.
  const [fetched, setFetched] = useState<HeartRateSample[] | null>(null)
  const samples = useMemo(
    () => (heartRateSamples.length ? heartRateSamples : (fetched ?? [])),
    [heartRateSamples, fetched],
  )
  const loading = !heartRateSamples.length && fetched === null && !!userId

  useEffect(() => {
    if (heartRateSamples.length || !userId) return
    let live = true
    loadHRSamples(userId)
      .then(rows => { if (live) setFetched(rows) })
      .catch(() => { if (live) setFetched([]) })
    return () => { live = false }
  }, [userId, heartRateSamples.length])
  const rawEntries = useMemo(() => buildStressMap(events, samples), [events, samples])
  const entries = useMemo(() => {
    if (mode === 'date') return [...rawEntries].sort((a, b) => b.event.start.getTime() - a.event.start.getTime())
    return rawEntries
  }, [rawEntries, mode])

  // Without this the map would render for a moment from zero samples — every
  // event shown as having no heart-rate data, which is a wrong answer rather
  // than a slow one.
  if (loading && !samples.length) {
    return (
      <div className="screen">
        <h2>{t('Карта стресса')}</h2>
        <p className="empty-hint">{t('Загружаю данные пульса…')}</p>
      </div>
    )
  }

  if (!events.length) {
    return (
      <div className="screen">
        <h2>{t('Карта стресса')}</h2>
        <p className="empty-hint" style={{ marginBottom: 16 }}>
          {t('Нужны данные календаря, чтобы построить карту стресса.')}
        </p>
        {onGoogleCalendar && (
          <button className="btn-primary" style={{ maxWidth: 240, marginBottom: 12 }} onClick={onGoogleCalendar}>
            <Icon name="schedule" size={16} /> Google Calendar
          </button>
        )}
        <p className="screen-hint">{t('Другие способы подключить календарь — в Настройках')}</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="stress-header">
        <div>
          <h2>{t('Карта стресса — пульс')} <Icon name="swap" size={18} /> {t('события')}</h2>
          <p className="screen-hint">
            {t('События отсортированы по нагрузке на сердце (превышение над базовым уровнем). Физическая активность помечена отдельно.')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div className="stress-sort-tabs">
            <button className={`stress-sort-btn${mode === 'stress' ? ' active' : ''}`} onClick={() => { setMode('stress'); setShown(PAGE) }}>
              {t('По стрессу')}
            </button>
            <button className={`stress-sort-btn${mode === 'date' ? ' active' : ''}`} onClick={() => { setMode('date'); setShown(PAGE) }}>
              {t('По дате')}
            </button>
            <button className={`stress-sort-btn${mode === 'charts' ? ' active' : ''}`} onClick={() => setMode('charts')}>
              <Icon name="chart" size={16} />{t('Графики')}
            </button>
          </div>
          {googleConnected && onToggleGoogle && (
            <label className="source-toggle">
              <span className="source-toggle-label">{t('Google Календарь')}</span>
              <div className={`toggle-switch${showGoogle ? ' on' : ''}`} onClick={() => onToggleGoogle(!showGoogle)}>
                <div className="toggle-thumb" />
              </div>
            </label>
          )}
        </div>
      </div>

      {mode === 'charts' ? (
        <StressCharts entries={rawEntries} />
      ) : (
      <div className="stress-list">
        {entries.slice(0, shown).map(entry => (
          <div
            key={entry.event.uid}
            className={`stress-item${entry.isPhysicalActivity ? ' physical' : ''}`}
          >
            <div className="stress-event-header">
              <span className="stress-title">{entry.event.title}</span>
              {entry.isPhysicalActivity && <span className="badge"><Icon name="exercise" size={12} /> {t('активность')}</span>}
              <span className="stress-date">{fmtDate(entry.event.start, locale)}</span>
            </div>
            <div className="stress-stats">
              {entry.sampleCount === 0 ? (
                <span className="no-data">{t('Нет данных о пульсе за это время')}</span>
              ) : (
                <>
                  <span>{t('Пульс')}: <strong>{entry.avgHeartRate}</strong> {t('уд/мин (ср)')}, {entry.peakHeartRate} ({t('пик')})</span>
                  {entry.heartRateDelta !== null && (
                    <span className={entry.heartRateDelta > 10 ? 'delta-high' : 'delta-normal'}>
                      {entry.heartRateDelta > 0 ? '+' : ''}{entry.heartRateDelta} {t('к базовому')}
                    </span>
                  )}
                  <span className="sample-count">{entry.sampleCount} {t('замеров')}</span>
                </>
              )}
            </div>
            {entry.sampleCount > 0 && entry.sampleCount < 4 && (
              <p className="stress-caveat">{t('Мало замеров — интерпретируйте осторожно')}</p>
            )}
          </div>
        ))}
        {entries.length > shown && (
          <button className="btn-secondary stress-more" onClick={() => setShown(n => n + PAGE)}>
            {t('Показать ещё')} ({entries.length - shown})
          </button>
        )}
      </div>
      )}
    </div>
  )
}
