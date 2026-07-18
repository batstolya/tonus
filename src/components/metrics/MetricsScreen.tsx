import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { DailyMetrics, MetricKey } from '../../types'
import type { IntakeEvent } from '../../lib/chat'
import type { GroupedEventMarker } from '../../lib/chartEvents'
import { eventMarkers, groupMarkersByDate, markersByDate, CHART_EVENT_TYPES, MAX_MARKER_DOTS } from '../../lib/chartEvents'
import { useT } from '../../lib/i18n'

// Полоса маркеров над графиком: на каждую дату с событиями — столбик мелких
// точек, цвет = тип события (те же цвета, что в чипах легенды). Раньше здесь
// были эмодзи-лейблы, но при десятке с лишним дат recharts клал их друг на
// друга, поэтому их просто отключали и оставались голые линии.
function EventMarkerDots({ events, viewBox }: {
  events: GroupedEventMarker['events']
  viewBox?: { x?: number; y?: number }
}) {
  if (viewBox?.x == null || viewBox.y == null) return null
  return (
    <g>
      {events.slice(0, MAX_MARKER_DOTS).map((e, i) => (
        <circle key={e.type} cx={viewBox.x} cy={viewBox.y! - 6 - i * 7} r={2.6} fill={e.color} />
      ))}
    </g>
  )
}

interface TooltipEntry { name?: string; value?: number | string | null; color?: string }

// Значения метрик плюс расшифровка событий дня — точки в полосе показывают
// «что-то было», а название события читается здесь.
function ChartTooltip({ active, payload, label, markers, t }: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
  markers: Map<string, GroupedEventMarker>
  t: (key: string) => string
}) {
  if (!active || !payload?.length) return null
  const day = label ? markers.get(label) : undefined
  return (
    <div className="chart-tip">
      <div className="chart-tip-date">{label}</div>
      {payload.map(p => (
        <div key={p.name} className="chart-tip-row">
          <span className="chart-tip-swatch" style={{ background: p.color }} />
          {p.name}: <strong>{p.value ?? '—'}</strong>
        </div>
      ))}
      {day && (
        <div className="chart-tip-events">
          {day.events.map(e => (
            <span key={e.type} className="chart-tip-event">
              <span className="chart-tip-swatch" style={{ background: e.color }} />
              {e.emoji} {t(e.label)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const METRIC_LABELS: Record<MetricKey, string> = {
  heartRate: 'Пульс (средний)',
  restingHeartRate: 'Пульс покоя',
  hrv: 'HRV',
  walkingHeartRate: 'Пульс при ходьбе',
  oxygenSaturation: 'SpO₂ (%)',
  respiratoryRate: 'Частота дыхания',
  wristTemperature: 'Температура запястья',
  vo2max: 'VO₂max',
  sleepHours: 'Сон (ч)',
  sleepBedtime: 'Засыпание',
  sleepWakeTime: 'Пробуждение',
  sleepDeep: 'Глубокий сон (ч)',
  sleepREM: 'REM сон (ч)',
  sleepCore: 'Основной сон (ч)',
  steps: 'Шаги',
  distance: 'Дистанция (км)',
  activeEnergy: 'Активная энергия (ккал)',
  exerciseMinutes: 'Минуты тренировки',
  flightsClimbed: 'Этажи',
}

function getValue(d: DailyMetrics, key: MetricKey): number | null {
  const v = d[key]
  if (v === undefined || v === null) return null
  if (typeof v === 'object' && 'avg' in v) return Math.round(v.avg)
  if (typeof v !== 'number') return null
  if (key === 'oxygenSaturation') return Math.round(v * 1000) / 10 // доля → проценты (96.3)
  return Math.round(v * 10) / 10
}

interface Props {
  daily: DailyMetrics[]
  intakeEvents?: IntakeEvent[]
}

export function MetricsScreen({ daily, intakeEvents = [] }: Props) {
  const { t } = useT()
  const [showEvents, setShowEvents] = useState(true)
  const available = (Object.keys(METRIC_LABELS) as MetricKey[]).filter(
    k => daily.some(d => getValue(d, k) !== null)
  )

  const [primary, setPrimary] = useState<MetricKey>(available[0] ?? 'heartRate')
  const [secondary, setSecondary] = useState<MetricKey | ''>('')

  // Chart: only days where primary metric has data
  const chartData = daily
    .filter(d => getValue(d, primary) !== null)
    .slice(-90)
    .map(d => ({
      date: d.date.slice(5),
      primary: getValue(d, primary),
      ...(secondary ? { secondary: getValue(d, secondary as MetricKey) } : {}),
    }))

  const markers = useMemo(() => {
    if (!showEvents) return []
    const shown = new Set(chartData.map(d => d.date))
    return groupMarkersByDate(eventMarkers(intakeEvents, shown, iso => iso.slice(5)))
  }, [intakeEvents, chartData, showEvents])
  const markerIndex = useMemo(() => markersByDate(markers), [markers])

  return (
    <div className="screen">
      <h2>{t('Все показатели')}</h2>

      <div className="metric-selectors">
        <label>
          {t('Показатель 1')}
          <select value={primary} onChange={e => setPrimary(e.target.value as MetricKey)}>
            {available.map(k => <option key={k} value={k}>{t(METRIC_LABELS[k])}</option>)}
          </select>
        </label>
        <label>
          {t('Показатель 2 (наложить)')}
          <select value={secondary} onChange={e => setSecondary(e.target.value as MetricKey | '')}>
            <option value="">—</option>
            {available.filter(k => k !== primary).map(k => <option key={k} value={k}>{t(METRIC_LABELS[k])}</option>)}
          </select>
        </label>
      </div>

      {intakeEvents.some(e => CHART_EVENT_TYPES.some(c => c.type === e.type)) && (
        <div className="chart-events-legend">
          <label className="chart-events-toggle">
            <input type="checkbox" checked={showEvents} onChange={e => setShowEvents(e.target.checked)} />
            {t('События')}
          </label>
          {showEvents && CHART_EVENT_TYPES.map(c => (
            <span key={c.type} className="chart-event-chip">
              <span className="chart-tip-swatch" style={{ background: c.color }} />
              {c.emoji} {t(c.label)}
            </span>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: markers.length ? 30 : 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis yAxisId="left" domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
          {secondary && <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 11 }} />}
          <Tooltip content={<ChartTooltip markers={markerIndex} t={t} />} />
          {markers.map(m => (
            <ReferenceLine key={m.x} yAxisId="left" x={m.x} stroke={m.color} strokeOpacity={0.35} strokeDasharray="3 3"
              label={<EventMarkerDots events={m.events} />} />
          ))}
          {/* isAnimationActive={false} обязателен: recharts v3 + React 19 иначе
              не дорисовывает серию и график остаётся пустым. */}
          <Line yAxisId="left" type="monotone" dataKey="primary" name={t(METRIC_LABELS[primary])} stroke="#6c8fff" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          {secondary && (
            <Line yAxisId="right" type="monotone" dataKey="secondary" name={t(METRIC_LABELS[secondary as MetricKey])} stroke="#5bc896" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>

      <div className="metrics-table-wrap">
        <table className="metrics-table">
          <thead>
            <tr>
              <th>{t('Дата')}</th>
              {available.map(k => <th key={k}>{t(METRIC_LABELS[k])}</th>)}
            </tr>
          </thead>
          <tbody>
            {daily.slice(-30).reverse().map(d => (
              <tr key={d.date}>
                <td>{d.date}</td>
                {available.map(k => <td key={k}>{getValue(d, k) ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
