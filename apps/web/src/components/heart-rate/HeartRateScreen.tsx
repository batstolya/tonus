import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
  ReferenceLine,
} from 'recharts'
import type { DailyMetrics } from '../../types'
import { useT } from '../../lib/i18n'
import { Icon, type IconName } from '../../lib/icons'
import { computePeriodStats } from './periodStats'

interface IntakeEvent {
  id: string
  ts: string
  type: string
  amount: number | null
  unit: string | null
  note: string | null
}

interface Props {
  daily: DailyMetrics[]
  intakeEvents?: IntakeEvent[]
}

type Preset = '7d' | '30d' | '90d' | 'all'

const OVERLAYS = [
  { key: 'coffee', icon: 'coffee' as IconName, label: 'Кофе', color: '#f59e0b' },
  { key: 'alcohol', icon: 'alcohol' as IconName, label: 'Алкоголь', color: '#f43f5e' },
] as const

// ReferenceLine's `label` used to be the overlay's own emoji, sliced off the
// front of its (now plain-text) label. With the emoji gone, render the
// registry icon at the line's top instead — recharts calls a function label
// with the line's own viewBox, so this places it centered above the line.
// The overlay-toggle checkbox above the chart names each event type too, so
// this marker's icon isn't its sole carrier of meaning — but the marker can
// land far from that legend on a wide chart, so it still gets its own title
// rather than leaning entirely on nearby text.
function OverlayMarker({ viewBox, icon, color, title }: {
  viewBox?: { x?: number; y?: number }
  icon: IconName
  color: string
  title: string
}) {
  if (viewBox?.x == null || viewBox?.y == null) return null
  return (
    <g transform={`translate(${viewBox.x - 8}, ${viewBox.y - 20})`} style={{ color }}>
      <Icon name={icon} size={16} title={title} />
    </g>
  )
}

function filterDays(daily: DailyMetrics[], preset: Preset): DailyMetrics[] {
  const withData = daily.filter(d => d.heartRate || d.restingHeartRate)
  if (preset === 'all') return withData
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  return withData.slice(-days)
}

export function HeartRateScreen({ daily, intakeEvents = [] }: Props) {
  const { t } = useT()
  const [preset, setPreset] = useState<Preset>('30d')
  const [shown, setShown] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => filterDays(daily, preset), [daily, preset])

  const data = useMemo(() => filtered.map(d => ({
    date: d.date.slice(5),
    fullDate: d.date,
    avg: d.heartRate?.avg ? Math.round(d.heartRate.avg) : null,
    max: d.heartRate?.max ?? null,
    resting: d.restingHeartRate ? Math.round(d.restingHeartRate) : null,
  })), [filtered])

  const dateSet = useMemo(() => new Set(filtered.map(d => d.date)), [filtered])

  // Map date → list of intake events of given type
  const coffeeByDate = useMemo(() => {
    const map = new Map<string, IntakeEvent[]>()
    for (const ev of intakeEvents) {
      if (!OVERLAYS.find(o => o.key === ev.type)) continue
      const date = ev.ts.slice(0, 10)
      if (!dateSet.has(date)) continue
      if (!map.has(date)) map.set(date, [])
      map.get(date)!.push(ev)
    }
    return map
  }, [intakeEvents, dateSet])

  // Шапка — по выбранному периоду, чтобы биться с графиком и таблицей.
  const { avg: avgAll, resting: avgRHR, max: maxEver } = computePeriodStats(filtered)
  // Норма покоя для флага «низкий» — по всей истории: порог не должен
  // плавать при переключении периода.
  const withRHRAll = daily.filter(d => d.restingHeartRate)
  const baselineRHR = withRHRAll.length
    ? Math.round(withRHRAll.reduce((a, d) => a + d.restingHeartRate!, 0) / withRHRAll.length)
    : null

  function toggleOverlay(key: string) {
    setShown(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Build reference lines for active overlays
  const referenceLines = useMemo(() => {
    const lines: { date: string; color: string; icon: IconName; label: string }[] = []
    for (const [date, events] of coffeeByDate.entries()) {
      for (const ev of events) {
        const overlay = OVERLAYS.find(o => o.key === ev.type)
        if (!overlay || !shown.has(ev.type)) continue
        const d = data.find(d => d.fullDate === date)
        if (!d) continue
        lines.push({ date: d.date, color: overlay.color, icon: overlay.icon, label: t(overlay.label) })
      }
    }
    return lines
  }, [coffeeByDate, shown, data, t])

  // «Неадекватно низкий» пульс: абсолютная брадикардия или заметно ниже
  // личной долгосрочной нормы — такие дни подсвечиваем в таблице.
  const isLowDay = (d: { resting: number | null; avg: number | null }) =>
    (d.resting !== null && (d.resting < 40 || (baselineRHR !== null && d.resting < baselineRHR * 0.85)))
    || (d.avg !== null && d.avg < 45)

  const dailyRows = [...data].reverse().slice(0, 30)

  return (
    <div className="screen">
      <h2>{t('Пульс за период')}</h2>

      <div className="hr-controls">
        <div className="presets">
          {(['7d', '30d', '90d', 'all'] as Preset[]).map(p => (
            <button key={p} className={preset === p ? 'preset active' : 'preset'} onClick={() => setPreset(p)}>
              {p === 'all' ? t('Всё время') : p.replace('d', ` ${t('дн')}`)}
            </button>
          ))}
        </div>

        <div className="overlay-toggles">
          {OVERLAYS.map(o => (
            <label key={o.key} className="overlay-toggle">
              <input
                type="checkbox"
                checked={shown.has(o.key)}
                onChange={() => toggleOverlay(o.key)}
              />
              <span style={{ color: shown.has(o.key) ? o.color : 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name={o.icon} size={14} /> {t(o.label)}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="stat-row">
        {avgAll && <div className="stat"><span>{avgAll}</span> {t('уд/мин средний')}</div>}
        {avgRHR && <div className="stat"><span>{avgRHR}</span> {t('уд/мин покой')}</div>}
        {maxEver && <div className="stat"><span>{maxEver}</span> {t('уд/мин макс')}</div>}
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={data} margin={{ top: 32, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="avg" name={t('Средний')} stroke="#6c8fff" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="resting" name={t('Покой')} stroke="#5bc896" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="max" name={t('Макс')} stroke="#ff6b6b" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="4 2" />
          {referenceLines.map((l, i) => (
            <ReferenceLine
              key={i}
              x={l.date}
              stroke={l.color}
              strokeWidth={2}
              strokeDasharray="4 3"
              label={(props: { viewBox?: { x?: number; y?: number } }) => (
                <OverlayMarker viewBox={props.viewBox} icon={l.icon} color={l.color} title={l.label} />
              )}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {dailyRows.length > 0 && (
        <div className="hr-daily">
          <h3>{t('По дням')}</h3>
          <div className="metrics-table-wrap">
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>{t('Дата')}</th>
                  <th>{t('Средний')}</th>
                  <th>{t('Покой')}</th>
                  <th>{t('Макс')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dailyRows.map(d => (
                  <tr key={d.fullDate} className={isLowDay(d) ? 'hr-daily-low' : undefined}>
                    <td>{d.fullDate}</td>
                    <td>{d.avg ?? '—'}</td>
                    <td>{d.resting ?? '—'}</td>
                    <td>{d.max !== null ? Math.round(d.max) : '—'}</td>
                    <td>{isLowDay(d) ? <span className="hr-low-badge">↓ {t('низкий')}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
