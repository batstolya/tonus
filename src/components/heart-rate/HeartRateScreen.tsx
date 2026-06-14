import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
  ReferenceLine,
} from 'recharts'
import type { DailyMetrics } from '../../types'

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
  { key: 'coffee', label: '☕ Кофе', color: '#f59e0b' },
  { key: 'alcohol', label: '🍷 Алкоголь', color: '#f43f5e' },
] as const

function filterDays(daily: DailyMetrics[], preset: Preset): DailyMetrics[] {
  const withData = daily.filter(d => d.heartRate || d.restingHeartRate)
  if (preset === 'all') return withData
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  return withData.slice(-days)
}

export function HeartRateScreen({ daily, intakeEvents = [] }: Props) {
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

  const withHR = daily.filter(d => d.heartRate)
  const avgAll = withHR.length ? Math.round(withHR.reduce((a, d) => a + d.heartRate!.avg, 0) / withHR.length) : null
  const withRHR = daily.filter(d => d.restingHeartRate)
  const avgRHR = withRHR.length ? Math.round(withRHR.reduce((a, d) => a + d.restingHeartRate!, 0) / withRHR.length) : null
  const maxEver = withHR.length ? Math.max(...withHR.map(d => d.heartRate!.max)) : null

  function toggleOverlay(key: string) {
    setShown(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Build reference lines for active overlays
  const referenceLines = useMemo(() => {
    const lines: { date: string; color: string; label: string }[] = []
    for (const [date, events] of coffeeByDate.entries()) {
      for (const ev of events) {
        const overlay = OVERLAYS.find(o => o.key === ev.type)
        if (!overlay || !shown.has(ev.type)) continue
        const d = data.find(d => d.fullDate === date)
        if (!d) continue
        lines.push({ date: d.date, color: overlay.color, label: overlay.label.split(' ')[0] })
      }
    }
    return lines
  }, [coffeeByDate, shown, data])

  return (
    <div className="screen">
      <h2>Пульс за период</h2>

      <div className="hr-controls">
        <div className="presets">
          {(['7d', '30d', '90d', 'all'] as Preset[]).map(p => (
            <button key={p} className={preset === p ? 'preset active' : 'preset'} onClick={() => setPreset(p)}>
              {p === 'all' ? 'Всё время' : p.replace('d', ' дн')}
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
              <span style={{ color: shown.has(o.key) ? o.color : 'var(--text-muted)' }}>{o.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="stat-row">
        {avgAll && <div className="stat"><span>{avgAll}</span> уд/мин средний</div>}
        {avgRHR && <div className="stat"><span>{avgRHR}</span> уд/мин покой</div>}
        {maxEver && <div className="stat"><span>{maxEver}</span> уд/мин макс</div>}
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="avg" name="Средний" stroke="#6c8fff" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="resting" name="Покой" stroke="#5bc896" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="max" name="Макс" stroke="#ff6b6b" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="4 2" />
          {referenceLines.map((l, i) => (
            <ReferenceLine
              key={i}
              x={l.date}
              stroke={l.color}
              strokeWidth={2}
              strokeDasharray="4 3"
              label={{ value: l.label, position: 'top', fontSize: 18, fill: l.color }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
