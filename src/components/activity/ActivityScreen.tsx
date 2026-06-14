import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  ReferenceLine, Cell,
} from 'recharts'
import type { DailyMetrics } from '../../types'

interface Props {
  daily: DailyMetrics[]
}

type Preset = '14d' | '30d' | '90d'

const GOAL = 8000
const GREAT = 10000

function getColor(steps: number): string {
  if (steps >= GREAT) return '#5bc896'
  if (steps >= GOAL) return '#6c8fff'
  if (steps >= 5000) return '#f59e0b'
  return '#ff6b6b'
}

export function ActivityScreen({ daily }: Props) {
  const [preset, setPreset] = useState<Preset>('30d')
  const days = preset === '14d' ? 14 : preset === '30d' ? 30 : 90

  const slice = useMemo(() =>
    daily.filter(d => d.steps != null).slice(-days),
    [daily, days])

  const data = useMemo(() => slice.map(d => ({
    date: d.date.slice(5),
    steps: d.steps ?? 0,
    distance: d.distance ? Math.round(d.distance / 100) / 10 : null,
    energy: d.activeEnergy ? Math.round(d.activeEnergy) : null,
    exercise: d.exerciseMinutes ?? null,
  })), [slice])

  const avgSteps = slice.length
    ? Math.round(slice.reduce((a, d) => a + (d.steps ?? 0), 0) / slice.length)
    : null

  const maxSteps = slice.length ? Math.max(...slice.map(d => d.steps ?? 0)) : null
  const goalDays = slice.filter(d => (d.steps ?? 0) >= GOAL).length
  const greatDays = slice.filter(d => (d.steps ?? 0) >= GREAT).length

  // Weeks where average was low
  const insights: string[] = []
  if (avgSteps && avgSteps < GOAL) {
    insights.push(`Средний показатель ${avgSteps.toLocaleString('ru-RU')} шагов — ниже цели ${GOAL.toLocaleString('ru-RU')}. Старайся добавлять короткие прогулки в обед.`)
  }
  if (avgSteps && avgSteps >= GREAT) {
    insights.push(`Отлично! Средний показатель ${avgSteps.toLocaleString('ru-RU')} шагов — выше ${GREAT.toLocaleString('ru-RU')}. Так держать.`)
  }
  if (slice.length > 0 && goalDays / slice.length < 0.5) {
    insights.push(`Цель ${GOAL.toLocaleString('ru-RU')} шагов достигнута только в ${goalDays} из ${slice.length} дней. Попробуй припарковаться дальше или выходить на остановку раньше.`)
  }
  if (greatDays > slice.length * 0.4) {
    insights.push(`${greatDays} дней с ${GREAT.toLocaleString('ru-RU')}+ шагами — высокая активность, хорошая нагрузка на сердце.`)
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const steps = payload[0]?.value
    return (
      <div className="custom-tooltip">
        <p className="tooltip-date">{label}</p>
        <p style={{ color: getColor(steps) }}><strong>{steps?.toLocaleString('ru-RU')}</strong> шагов</p>
        {payload[0] && <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {steps >= GREAT ? '🟢 Отлично' : steps >= GOAL ? '🔵 Цель достигнута' : steps >= 5000 ? '🟡 Умеренно' : '🔴 Мало'}
        </p>}
      </div>
    )
  }

  return (
    <div className="screen">
      <h2>Активность</h2>

      <div className="presets">
        {(['14d', '30d', '90d'] as Preset[]).map(p => (
          <button key={p} className={preset === p ? 'preset active' : 'preset'} onClick={() => setPreset(p)}>
            {p.replace('d', ' дн')}
          </button>
        ))}
      </div>

      <div className="stat-row" style={{ marginBottom: 24 }}>
        {avgSteps && (
          <div className="stat">
            <span style={{ color: getColor(avgSteps) }}>{avgSteps.toLocaleString('ru-RU')}</span>
            среднее / день
          </div>
        )}
        {maxSteps && (
          <div className="stat">
            <span>{maxSteps.toLocaleString('ru-RU')}</span>
            рекорд
          </div>
        )}
        <div className="stat">
          <span style={{ color: '#5bc896' }}>{goalDays}</span>
          дней с {GOAL.toLocaleString('ru-RU')}+ шагов
        </div>
        <div className="stat">
          <span style={{ color: '#5bc896' }}>{greatDays}</span>
          дней с {GREAT.toLocaleString('ru-RU')}+
        </div>
      </div>

      {/* Steps goal legend */}
      <div className="activity-legend">
        <span className="legend-dot" style={{ background: '#ff6b6b' }} /> &lt;5к
        <span className="legend-dot" style={{ background: '#f59e0b' }} /> 5–8к
        <span className="legend-dot" style={{ background: '#6c8fff' }} /> 8–10к
        <span className="legend-dot" style={{ background: '#5bc896' }} /> 10к+
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 40, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}к`} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={GOAL} stroke="#6c8fff" strokeDasharray="4 3" label={{ value: '8к', position: 'right', fontSize: 11, fill: '#6c8fff' }} />
          <ReferenceLine y={GREAT} stroke="#5bc896" strokeDasharray="4 3" label={{ value: '10к', position: 'right', fontSize: 11, fill: '#5bc896' }} />
          <Bar dataKey="steps" name="Шаги" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={getColor(entry.steps)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {insights.length > 0 && (
        <div className="activity-insights">
          <h3>Рекомендации</h3>
          {insights.map((text, i) => (
            <div key={i} className="insight-item">
              <p>{text}</p>
            </div>
          ))}
        </div>
      )}

      {data.some(d => d.distance) && (
        <div className="chart-section">
          <h3>Дистанция (км)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} unit="км" />
              <Tooltip formatter={(v: any) => [`${v} км`, 'Дистанция']} />
              <Bar dataKey="distance" fill="#6c8fff" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
