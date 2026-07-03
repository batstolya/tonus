import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell,
} from 'recharts'
import type { StressMapEntry } from '../../types'
import { useT } from '../../lib/i18n'

interface Props {
  entries: StressMapEntry[]
}

// Цвет по приросту пульса над базовым уровнем
function deltaColor(d: number): string {
  if (d >= 30) return 'var(--red)'
  if (d >= 15) return '#f59e0b'
  return 'var(--green)'
}

const axisTick = { fontSize: 11, fill: 'var(--text-muted)' }
const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 12,
}

// Однострочная подпись события (recharts по умолчанию переносит длинный текст)
function EventTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const v = payload?.value ?? ''
  const label = v.length > 22 ? v.slice(0, 21) + '…' : v
  return (
    <text x={x} y={y} dx={-6} dy={4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
      {label}
    </text>
  )
}

export function StressCharts({ entries }: Props) {
  const { t, locale } = useT()

  // Только содержательная стрессовая нагрузка: есть прирост и не физическая активность
  const usable = useMemo(
    () => entries.filter(e => e.heartRateDelta != null && e.sampleCount > 0 && !e.isPhysicalActivity),
    [entries],
  )

  const weekdayShort = useMemo(() => {
    const names: string[] = []
    for (let i = 0; i < 7; i++) names.push(new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }))
    return names // 0 = Пн … 6 = Вс
  }, [locale])

  const byHour = useMemo(() => {
    const map = new Map<number, number[]>()
    for (const e of usable) {
      const h = e.event.start.getHours()
      ;(map.get(h) ?? map.set(h, []).get(h)!).push(e.heartRateDelta!)
    }
    return [...map.entries()]
      .map(([h, vals]) => ({ label: `${h}:00`, hour: h, delta: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), count: vals.length }))
      .sort((a, b) => a.hour - b.hour)
  }, [usable])

  const byWeekday = useMemo(() => {
    const sums = Array.from({ length: 7 }, () => [] as number[])
    for (const e of usable) {
      const idx = (e.event.start.getDay() + 6) % 7 // Пн = 0
      sums[idx].push(e.heartRateDelta!)
    }
    return sums.map((vals, i) => ({
      label: weekdayShort[i],
      delta: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0,
      count: vals.length,
    }))
  }, [usable, weekdayShort])

  const topEvents = useMemo(
    () => [...usable]
      .sort((a, b) => b.heartRateDelta! - a.heartRateDelta!)
      .slice(0, 8)
      .map(e => ({ title: e.event.title, delta: e.heartRateDelta!, peak: e.peakHeartRate }))
      .reverse(), // recharts рисует горизонтальные бары снизу вверх
    [usable],
  )

  if (usable.length < 2) {
    return <p className="empty-hint" style={{ marginTop: 24 }}>{t('Недостаточно данных для графиков. Нужно больше событий с измеренным пульсом.')}</p>
  }

  const peak = usable.reduce((m, e) => (e.heartRateDelta! > m.heartRateDelta! ? e : m), usable[0])
  const avgDelta = Math.round(usable.reduce((a, e) => a + e.heartRateDelta!, 0) / usable.length)

  return (
    <div className="stress-charts">
      <div className="stat-row">
        <div className="stat"><span>{usable.length}</span> {t('событий')}</div>
        <div className="stat"><span>+{avgDelta}</span> {t('средний прирост')}</div>
        <div className="stat"><span>+{peak.heartRateDelta}</span> {t('пиковая нагрузка')}</div>
      </div>

      <div className="chart-block">
        <div className="chart-title">{t('Стресс по времени суток')}</div>
        <div className="chart-sub">{t('Средний прирост пульса над базовым уровнем')}</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={byHour} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={axisTick} interval="preserveStartEnd" />
            <YAxis tick={axisTick} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: 'var(--border)', opacity: 0.3 }}
              formatter={(v) => [`+${v} ${t('к базовому')}`, t('Пульс')]}
            />
            <Bar dataKey="delta" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {byHour.map((d, i) => <Cell key={i} fill={deltaColor(d.delta)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-block">
        <div className="chart-title">{t('Стресс по дням недели')}</div>
        <div className="chart-sub">{t('Средний прирост пульса над базовым уровнем')}</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={byWeekday} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={axisTick} />
            <YAxis tick={axisTick} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: 'var(--border)', opacity: 0.3 }}
              formatter={(v) => [`+${v} ${t('к базовому')}`, t('Пульс')]}
            />
            <Bar dataKey="delta" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {byWeekday.map((d, i) => <Cell key={i} fill={d.count ? deltaColor(d.delta) : 'var(--border)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-block">
        <div className="chart-title">{t('Самые нагруженные события')}</div>
        <div className="chart-sub">{t('Топ событий по приросту пульса')}</div>
        <ResponsiveContainer width="100%" height={Math.max(180, topEvents.length * 40)}>
          <BarChart data={topEvents} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={axisTick} />
            <YAxis
              type="category"
              dataKey="title"
              tick={<EventTick />}
              width={160}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: 'var(--border)', opacity: 0.3 }}
              formatter={(v) => [`+${v} ${t('к базовому')}`, t('Пульс')]}
            />
            <Bar dataKey="delta" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {topEvents.map((d, i) => <Cell key={i} fill={deltaColor(d.delta)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="stress-caveat">{t('Физическая активность исключена из графиков.')}</p>
    </div>
  )
}
