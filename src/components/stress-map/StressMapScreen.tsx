import { useMemo } from 'react'
import type { HeartRateSample, CalendarEvent } from '../../types'
import { buildStressMap } from '../../utils/stressMap'

interface Props {
  heartRateSamples: HeartRateSample[]
  events: CalendarEvent[]
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function StressMapScreen({ heartRateSamples, events }: Props) {
  const entries = useMemo(() => buildStressMap(events, heartRateSamples), [events, heartRateSamples])

  if (!events.length) {
    return (
      <div className="screen">
        <h2>Карта стресса</h2>
        <p className="empty-hint">Загрузите файл календаря (.ics) на экране загрузки, чтобы увидеть карту стресса.</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <h2>Карта стресса — пульс ↔ события</h2>
      <p className="screen-hint">
        События отсортированы по нагрузке на сердце (превышение над базовым уровнем).
        Физическая активность помечена отдельно.
      </p>

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
