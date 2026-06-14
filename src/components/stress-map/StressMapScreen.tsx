import { useMemo, useRef } from 'react'
import type { HeartRateSample, CalendarEvent } from '../../types'
import { buildStressMap } from '../../utils/stressMap'
import { parseICS } from '../../parsers/icsParser'
import { parseCalBookings } from '../../parsers/calBookingsParser'

interface Props {
  heartRateSamples: HeartRateSample[]
  events: CalendarEvent[]
  onEvents: (e: CalendarEvent[]) => void
  onGoogleCalendar?: () => void
  showGoogle?: boolean
  onToggleGoogle?: (v: boolean) => void
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function StressMapScreen({ heartRateSamples, events, onEvents, onGoogleCalendar, showGoogle = true, onToggleGoogle }: Props) {
  const googleConnected = events.some(e => e.source === 'google')
  const entries = useMemo(() => buildStressMap(events, heartRateSamples), [events, heartRateSamples])
  const icsRef = useRef<HTMLInputElement>(null)
  const calRef = useRef<HTMLInputElement>(null)

  function handleICS(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then(text => { try { onEvents(parseICS(text)) } catch { /* ignore */ } })
    e.target.value = ''
  }

  function handleCal(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then(text => { try { onEvents(parseCalBookings(text)) } catch { /* ignore */ } })
    e.target.value = ''
  }

  if (!events.length) {
    return (
      <div className="screen">
        <h2>Карта стресса</h2>
        <p className="empty-hint" style={{ marginBottom: 24 }}>
          Нужны данные календаря. Загрузите один из форматов:
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <input ref={icsRef} type="file" accept=".ics" style={{ display: 'none' }} onChange={handleICS} />
          <button className="btn-primary" style={{ maxWidth: 200 }} onClick={() => icsRef.current?.click()}>
            📅 Загрузить .ics
          </button>
          <input ref={calRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleCal} />
          <button className="btn-secondary" onClick={() => calRef.current?.click()}>
            📋 cal_bookings.json
          </button>
          {onGoogleCalendar && (
            <button className="btn-secondary" onClick={onGoogleCalendar}>
              🗓 Google Calendar
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="stress-header">
        <div>
          <h2>Карта стресса — пульс ↔ события</h2>
          <p className="screen-hint">
            События отсортированы по нагрузке на сердце (превышение над базовым уровнем).
            Физическая активность помечена отдельно.
          </p>
        </div>
        {googleConnected && onToggleGoogle && (
          <label className="source-toggle">
            <span className="source-toggle-label">Google Календарь</span>
            <div className={`toggle-switch${showGoogle ? ' on' : ''}`} onClick={() => onToggleGoogle(!showGoogle)}>
              <div className="toggle-thumb" />
            </div>
          </label>
        )}
      </div>

      <div className="stress-list">
        {entries.map(entry => (
          <div
            key={entry.event.uid}
            className={`stress-item${entry.isPhysicalActivity ? ' physical' : ''}`}
          >
            <div className="stress-event-header">
              <span className="stress-title">{entry.event.title}</span>
              {entry.isPhysicalActivity && <span className="badge">🏃 активность</span>}
              <span className="stress-date">{fmtDate(entry.event.start)}</span>
            </div>
            <div className="stress-stats">
              {entry.sampleCount === 0 ? (
                <span className="no-data">Нет данных о пульсе за это время</span>
              ) : (
                <>
                  <span>Пульс: <strong>{entry.avgHeartRate}</strong> уд/мин (ср), {entry.peakHeartRate} (пик)</span>
                  {entry.heartRateDelta !== null && (
                    <span className={entry.heartRateDelta > 10 ? 'delta-high' : 'delta-normal'}>
                      {entry.heartRateDelta > 0 ? '+' : ''}{entry.heartRateDelta} к базовому
                    </span>
                  )}
                  <span className="sample-count">{entry.sampleCount} замеров</span>
                </>
              )}
            </div>
            {entry.sampleCount > 0 && entry.sampleCount < 4 && (
              <p className="stress-caveat">Мало замеров — интерпретируйте осторожно</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
