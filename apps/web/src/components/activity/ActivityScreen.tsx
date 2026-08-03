import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  ReferenceLine, Cell,
} from 'recharts'
import type { DailyMetrics } from '../../types'
import { useT } from '../../lib/i18n'
import { Icon, type IconName } from '../../lib/icons'

interface Props {
  daily: DailyMetrics[]
}

type Preset = '14d' | '30d' | '90d'

const GOAL = 8000
const GREAT = 10000

// Steps are an ordered magnitude, so the buckets ramp through one hue rather
// than cycling four. The old red/amber/blue/green told a reader nothing about
// which way was "more" — green is not obviously above blue — and spent the
// status colours on a scale that has no failure state. The 8k and 10k
// reference lines carry the goals now.
function getColor(steps: number): string {
  if (steps >= GREAT) return 'var(--chart-s4)'
  if (steps >= GOAL) return 'var(--chart-s3)'
  if (steps >= 5000) return 'var(--chart-s2)'
  return 'var(--chart-s1)'
}

// The tooltip's level dot used to be a colored circle emoji (green/blue/
// yellow/red) — the color alone carried the meaning, since all four are the
// same glyph shape.
// Phosphor's duotone Circle renders in a single currentColor regardless of
// which registry name (dotOk/dotInfo/dotWarn/dotBad) it's under, so the hue
// has to be reapplied explicitly here or all four render identically.
function stepsLevel(steps: number): { icon: IconName; color: string; label: string } {
  if (steps >= GREAT) return { icon: 'dotOk', color: 'var(--ok)', label: 'Отлично' }
  if (steps >= GOAL) return { icon: 'dotInfo', color: 'var(--accent)', label: 'Цель достигнута' }
  if (steps >= 5000) return { icon: 'dotWarn', color: 'var(--warn)', label: 'Умеренно' }
  return { icon: 'dotBad', color: 'var(--bad)', label: 'Мало' }
}

// На уровне модуля (не внутри рендера): recharts вливает active/payload/label,
// t/locale прокидываем явно. Определение внутри компонента ремаунтило бы тултип
// каждый рендер (react-hooks/static-components).
function CustomTooltip({ active, payload, label, t, locale }: {
  active?: boolean
  label?: string | number
  payload?: { value: number }[]
  t: (ru: string, vars?: Record<string, string | number>) => string
  locale: string
}) {
  if (!active || !payload?.length) return null
  const steps = payload[0]?.value ?? 0
  return (
    <div className="custom-tooltip">
      <p className="tooltip-date">{label}</p>
      <p style={{ color: getColor(steps) }}><strong>{steps.toLocaleString(locale)}</strong> {t('шагов')}</p>
      {payload[0] && (() => {
        const lvl = stepsLevel(steps)
        return (
          <p style={{ color: 'var(--text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: lvl.color, display: 'inline-flex' }}><Icon name={lvl.icon} size={10} /></span>
            {t(lvl.label)}
          </p>
        )
      })()}
    </div>
  )
}

export function ActivityScreen({ daily }: Props) {
  const { t, locale } = useT()
  const k = t('к') // сокращение «тысяч» на осях и в легенде: к / k
  const [preset, setPreset] = useState<Preset>('30d')
  const days = preset === '14d' ? 14 : preset === '30d' ? 30 : 90

  const slice = useMemo(() =>
    daily.filter(d => d.steps != null).slice(-days),
    [daily, days])

  const data = useMemo(() => slice.map(d => ({
    date: d.date.slice(5),
    steps: d.steps ?? 0,
    distance: d.distance ? Math.round(d.distance * 10) / 10 : null,
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
    insights.push(t('Средний показатель {avg} шагов — ниже цели {goal}. Старайся добавлять короткие прогулки в обед.', { avg: avgSteps.toLocaleString(locale), goal: GOAL.toLocaleString(locale) }))
  }
  if (avgSteps && avgSteps >= GREAT) {
    insights.push(t('Отлично! Средний показатель {avg} шагов — выше {great}. Так держать.', { avg: avgSteps.toLocaleString(locale), great: GREAT.toLocaleString(locale) }))
  }
  if (slice.length > 0 && goalDays / slice.length < 0.5) {
    insights.push(t('Цель {goal} шагов достигнута только в {n} из {total} дней. Попробуй припарковаться дальше или выходить на остановку раньше.', { goal: GOAL.toLocaleString(locale), n: goalDays, total: slice.length }))
  }
  if (greatDays > slice.length * 0.4) {
    insights.push(t('{n} дней с {great}+ шагами — высокая активность, хорошая нагрузка на сердце.', { n: greatDays, great: GREAT.toLocaleString(locale) }))
  }

  return (
    <div className="screen">
      <h2>{t('Активность')}</h2>

      <div className="presets">
        {(['14d', '30d', '90d'] as Preset[]).map(p => (
          <button key={p} className={preset === p ? 'preset active' : 'preset'} onClick={() => setPreset(p)}>
            {p.replace('d', ` ${t('дн')}`)}
          </button>
        ))}
      </div>

      <div className="stat-row" style={{ marginBottom: 24 }}>
        {avgSteps && (
          <div className="stat">
            <span style={{ color: getColor(avgSteps) }}>{avgSteps.toLocaleString(locale)}</span>
            {t('среднее / день')}
          </div>
        )}
        {maxSteps && (
          <div className="stat">
            <span>{maxSteps.toLocaleString(locale)}</span>
            {t('рекорд')}
          </div>
        )}
        <div className="stat">
          <span style={{ color: 'var(--chart-s3)' }}>{goalDays}</span>
          {t('дней с {n}+ шагов', { n: GOAL.toLocaleString(locale) })}
        </div>
        <div className="stat">
          <span style={{ color: 'var(--chart-s4)' }}>{greatDays}</span>
          {t('дней с {n}+', { n: GREAT.toLocaleString(locale) })}
        </div>
      </div>

      {/* Steps goal legend */}
      <div className="activity-legend">
        <span className="legend-dot" style={{ background: 'var(--chart-s1)' }} /> &lt;5{k}
        <span className="legend-dot" style={{ background: 'var(--chart-s2)' }} /> 5–8{k}
        <span className="legend-dot" style={{ background: 'var(--chart-s3)' }} /> 8–10{k}
        <span className="legend-dot" style={{ background: 'var(--chart-s4)' }} /> 10{k}+
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 40, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}${k}`} />
          <Tooltip content={<CustomTooltip t={t} locale={locale} />} />
          <ReferenceLine y={GOAL} stroke="var(--chart-axis)" strokeDasharray="4 3" label={{ value: `8${k}`, position: 'right', fontSize: 11, fill: 'var(--text-muted)' }} />
          <ReferenceLine y={GREAT} stroke="var(--chart-axis)" strokeDasharray="4 3" label={{ value: `10${k}`, position: 'right', fontSize: 11, fill: 'var(--text-muted)' }} />
          <Bar dataKey="steps" name={t('Шаги')} radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={getColor(entry.steps)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {insights.length > 0 && (
        <div className="activity-insights">
          <h3>{t('Рекомендации')}</h3>
          {insights.map((text, i) => (
            <div key={i} className="insight-item">
              <p>{text}</p>
            </div>
          ))}
        </div>
      )}

      {data.some(d => d.distance) && (
        <div className="chart-section">
          <h3>{t('Дистанция (км)')}</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} unit={t('км')} />
              <Tooltip formatter={(v) => [`${v} ${t('км')}`, t('Дистанция')]} />
              <Bar dataKey="distance" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
