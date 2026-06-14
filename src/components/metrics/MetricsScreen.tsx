import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import type { DailyMetrics, MetricKey } from '../../types'

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
  distance: 'Дистанция (м)',
  activeEnergy: 'Активная энергия (ккал)',
  exerciseMinutes: 'Минуты тренировки',
  flightsClimbed: 'Этажи',
}

function getValue(d: DailyMetrics, key: MetricKey): number | null {
  const v = d[key]
  if (v === undefined || v === null) return null
  if (typeof v === 'object' && 'avg' in v) return Math.round(v.avg)
  return typeof v === 'number' ? Math.round(v * 10) / 10 : null
}

interface Props {
  daily: DailyMetrics[]
}

export function MetricsScreen({ daily }: Props) {
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

  return (
    <div className="screen">
      <h2>Все показатели</h2>

      <div className="metric-selectors">
        <label>
          Показатель 1
          <select value={primary} onChange={e => setPrimary(e.target.value as MetricKey)}>
            {available.map(k => <option key={k} value={k}>{METRIC_LABELS[k]}</option>)}
          </select>
        </label>
        <label>
          Показатель 2 (наложить)
          <select value={secondary} onChange={e => setSecondary(e.target.value as MetricKey | '')}>
            <option value="">—</option>
            {available.filter(k => k !== primary).map(k => <option key={k} value={k}>{METRIC_LABELS[k]}</option>)}
          </select>
        </label>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis yAxisId="left" domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
          {secondary && <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 11 }} />}
          <Tooltip />
          <Line yAxisId="left" type="monotone" dataKey="primary" name={METRIC_LABELS[primary]} stroke="#6c8fff" strokeWidth={2} dot={false} connectNulls />
          {secondary && (
            <Line yAxisId="right" type="monotone" dataKey="secondary" name={METRIC_LABELS[secondary as MetricKey]} stroke="#5bc896" strokeWidth={2} dot={false} connectNulls />
          )}
        </LineChart>
      </ResponsiveContainer>

      <div className="metrics-table-wrap">
        <table className="metrics-table">
          <thead>
            <tr>
              <th>Дата</th>
              {available.map(k => <th key={k}>{METRIC_LABELS[k]}</th>)}
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
