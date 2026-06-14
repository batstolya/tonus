import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts'
import type { DailyMetrics } from '../../types'

interface Props {
  daily: DailyMetrics[]
}

type Preset = '7d' | '30d' | '90d' | 'all'

function filterDays(daily: DailyMetrics[], preset: Preset): DailyMetrics[] {
  const withData = daily.filter(d => d.heartRate || d.restingHeartRate)
  if (preset === 'all') return withData
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  return withData.slice(-days)
}

export function HeartRateScreen({ daily }: Props) {
  const [preset, setPreset] = useState<Preset>('30d')

  const data = useMemo(() => filterDays(daily, preset).map(d => ({
    date: d.date.slice(5),
    avg: d.heartRate?.avg ? Math.round(d.heartRate.avg) : null,
    min: d.heartRate?.min ?? null,
    max: d.heartRate?.max ?? null,
    resting: d.restingHeartRate ? Math.round(d.restingHeartRate) : null,
  })), [daily, preset])

  const withHR = daily.filter(d => d.heartRate)
  const avgAll = withHR.length
    ? Math.round(withHR.reduce((a, d) => a + d.heartRate!.avg, 0) / withHR.length)
    : null
  const withRHR = daily.filter(d => d.restingHeartRate)
  const avgRHR = withRHR.length
    ? Math.round(withRHR.reduce((a, d) => a + d.restingHeartRate!, 0) / withRHR.length)
    : null
  const maxEver = withHR.length ? Math.max(...withHR.map(d => d.heartRate!.max)) : null

  return (
    <div className="screen">
      <h2>Пульс за период</h2>

      <div className="presets">
        {(['7d', '30d', '90d', 'all'] as Preset[]).map(p => (
          <button
            key={p}
            className={preset === p ? 'preset active' : 'preset'}
            onClick={() => setPreset(p)}
          >
            {p === 'all' ? 'Всё время' : p.replace('d', ' дн')}
          </button>
        ))}
      </div>

      <div className="stat-row">
        {avgAll && <div className="stat"><span>{avgAll}</span> уд/мин средний</div>}
        {avgRHR && <div className="stat"><span>{avgRHR}</span> уд/мин покой</div>}
        {maxEver && <div className="stat"><span>{maxEver}</span> уд/мин макс</div>}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="avg" name="Средний" stroke="var(--accent)" dot={false} connectNulls />
          <Line type="monotone" dataKey="resting" name="Покой" stroke="var(--green)" dot={false} connectNulls />
          <Line type="monotone" dataKey="max" name="Макс" stroke="var(--red)" dot={false} connectNulls strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
