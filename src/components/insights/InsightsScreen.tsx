import { useState } from 'react'
import type { DailyMetrics } from '../../types'
import { generateInsights } from '../../utils/insights'

interface Props {
  daily: DailyMetrics[]
}

interface CompareRow {
  label: string
  thisWeek: string
  lastWeek: string
  delta: number
  unit: string
  higherIsBetter: boolean
}

function avg(arr: number[]): number | null {
  if (!arr.length) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function pick(days: DailyMetrics[], key: keyof DailyMetrics): number[] {
  return days.map(d => d[key] as number | null).filter((v): v is number => v != null)
}

function fmtVal(v: number | null, dec = 1): string {
  return v == null ? '—' : v.toFixed(dec)
}

function buildComparison(daily: DailyMetrics[]): CompareRow[] {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const thisWeek = sorted.slice(-7)
  const lastWeek = sorted.slice(-14, -7)

  const rows: CompareRow[] = []

  function addRow(
    label: string,
    key: keyof DailyMetrics,
    unit: string,
    higherIsBetter: boolean,
    dec = 1,
    multiplier = 1,
  ) {
    const cur = avg(pick(thisWeek, key).map(v => v * multiplier))
    const prv = avg(pick(lastWeek, key).map(v => v * multiplier))
    if (cur == null && prv == null) return
    const delta = cur != null && prv != null ? cur - prv : 0
    rows.push({
      label,
      thisWeek: fmtVal(cur, dec),
      lastWeek: fmtVal(prv, dec),
      delta,
      unit,
      higherIsBetter,
    })
  }

  addRow('Пульс покоя', 'restingHeartRate', 'уд/мин', false, 0)
  addRow('HRV', 'hrv', 'мс', true, 0)
  addRow('Сон', 'sleepHours', 'ч', true, 1)
  addRow('Шаги', 'steps', 'шагов', true, 0)
  addRow('SpO₂', 'oxygenSaturation', '%', true, 1, 100)
  addRow('Активные калории', 'activeEnergy', 'ккал', true, 0)

  return rows
}

function DeltaBadge({ delta, unit, higherIsBetter }: { delta: number; unit: string; higherIsBetter: boolean }) {
  if (Math.abs(delta) < 0.05) return <span className="cmp-delta neutral">→ без изменений</span>
  const good = higherIsBetter ? delta > 0 : delta < 0
  const sign = delta > 0 ? '+' : ''
  const dec = Math.abs(delta) < 10 ? 1 : 0
  return (
    <span className={`cmp-delta ${good ? 'good' : 'bad'}`}>
      {sign}{delta.toFixed(dec)} {unit}
    </span>
  )
}

export function InsightsScreen({ daily }: Props) {
  const insights = generateInsights(daily)
  const [comparison, setComparison] = useState<CompareRow[] | null>(null)

  function handleCompare() {
    setComparison(buildComparison(daily))
  }

  return (
    <div className="screen">
      <h2>Инсайты и тренды</h2>

      <div style={{ marginBottom: 16 }}>
        <button className="btn-primary" onClick={handleCompare}>
          Сравнить эту неделю с прошлой
        </button>
      </div>

      {comparison && (
        <div className="insight-card cmp-card" style={{ marginBottom: 16 }}>
          <div className="insight-tag">Сравнение недель</div>
          <table className="cmp-table">
            <thead>
              <tr>
                <th>Метрика</th>
                <th>Эта неделя</th>
                <th>Прошлая неделя</th>
                <th>Изменение</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(row => (
                <tr key={row.label}>
                  <td className="cmp-label">{row.label}</td>
                  <td className="cmp-val">{row.thisWeek} <span className="cmp-unit">{row.unit}</span></td>
                  <td className="cmp-val muted">{row.lastWeek} <span className="cmp-unit">{row.unit}</span></td>
                  <td><DeltaBadge delta={row.delta} unit={row.unit} higherIsBetter={row.higherIsBetter} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {insights.length === 0 ? (
        <p className="empty-hint">Нужно хотя бы 14 дней данных для генерации инсайтов.</p>
      ) : (
        <div className="insights-list">
          {insights.map(i => (
            <div key={i.id} className="insight-card">
              <div className="insight-tag">{i.metric}</div>
              <p>{i.text}</p>
            </div>
          ))}
        </div>
      )}
      <p className="caveat">Всё выше — наблюдения на основе данных, не медицинские рекомендации.</p>
    </div>
  )
}
