import { useMemo, useState } from 'react'
import type { HeartRateSample, CalendarEvent } from '../../types'
import { useT } from '../../lib/i18n'
import { Icon } from '../../lib/icons'
import { buildStressMap } from '../../lib/stressMap'
import { StressCharts } from './StressCharts'

interface Props {
  heartRateSamples: HeartRateSample[]
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

export function StressMapScreen({ heartRateSamples, events, onGoogleCalendar, googleConnected = false, showGoogle = true, onToggleGoogle }: Props) {
  const { t, locale } = useT()
  const [mode, setMode] = useState<Mode>('stress')
  const rawEntries = useMemo(() => buildStressMap(events, heartRateSamples), [events, heartRateSamples])
  const entries = useMemo(() => {
    if (mode === 'date') return [...rawEntries].sort((a, b) => b.event.start.getTime() - a.event.start.getTime())
    return rawEntries
  }, [rawEntries, mode])

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
            <button className={`stress-sort-btn${mode === 'stress' ? ' active' : ''}`} onClick={() => setMode('stress')}>
              {t('По стрессу')}
            </button>
            <button className={`stress-sort-btn${mode === 'date' ? ' active' : ''}`} onClick={() => setMode('date')}>
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
        {entries.map(entry => (
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
      </div>
      )}
    </div>
  )
}
