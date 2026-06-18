import { useState } from 'react'
import type { DailyMetrics } from '../../types'
import { generateInsights } from '../../utils/insights'
import {
  computeTrends, computeRecords, computeStreaks, computeAnomalies,
  computeWeekdayPatterns, buildHeatmap, INSIGHT_METRICS, WD_NAMES,
} from '../../utils/insightsExtra'
import { useT } from '../../lib/i18n'

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
  const { t } = useT()
  if (Math.abs(delta) < 0.05) return <span className="cmp-delta neutral">→ {t('без изменений')}</span>
  const good = higherIsBetter ? delta > 0 : delta < 0
  const sign = delta > 0 ? '+' : ''
  const dec = Math.abs(delta) < 10 ? 1 : 0
  return (
    <span className={`cmp-delta ${good ? 'good' : 'bad'}`}>
      {sign}{delta.toFixed(dec)} {t(unit)}
    </span>
  )
}

function Heatmap({ daily }: { daily: DailyMetrics[] }) {
  const { t } = useT()
  const [mk, setMk] = useState(INSIGHT_METRICS[2]) // сон по умолчанию
  const { cells } = buildHeatmap(daily, mk.key, mk.betterHigh)
  if (!cells.length) return null
  function color(pct: number | null) {
    if (pct == null) return 'var(--border)'
    // красный (плохо) → жёлтый → зелёный (хорошо)
    const hue = pct * 120
    return `hsl(${hue} 65% 50%)`
  }
  return (
    <div className="ins-section">
      <div className="ins-section-head">
        <h3 className="goals-section-title" style={{ margin: 0 }}>🗓 {t('Календарь')}</h3>
        <select className="log-input" style={{ width: 'auto', fontSize: 13 }} value={mk.key as string}
          onChange={e => setMk(INSIGHT_METRICS.find(m => m.key === e.target.value)!)}>
          {INSIGHT_METRICS.map(m => <option key={m.key as string} value={m.key as string}>{t(m.label)}</option>)}
        </select>
      </div>
      <div className="heatmap">
        {cells.map(cell => {
          const val = cell.v != null ? cell.v.toFixed(mk.decimals) : '—'
          return <div key={cell.date} className={`heat-cell${cell.v == null ? ' empty' : ''}`}
            style={{ background: color(cell.pct) }}
            title={`${cell.date}: ${val}${mk.unit ? ' ' + t(mk.unit) : ''}`} />
        })}
      </div>
    </div>
  )
}

export function InsightsScreen({ daily }: Props) {
  const { t } = useT()
  const insights = generateInsights(daily)
  const [comparison, setComparison] = useState<CompareRow[] | null>(null)

  const trends = computeTrends(daily)
  const records = computeRecords(daily)
  const streaks = computeStreaks(daily)
  const anomalies = computeAnomalies(daily)
  const weekday = computeWeekdayPatterns(daily)

  function handleCompare() {
    setComparison(buildComparison(daily))
  }

  const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

  return (
    <div className="screen">
      <h2>{t('Инсайты и тренды')}</h2>

      {/* A1. Тренды */}
      {trends.length > 0 && (
        <div className="ins-cards">
          {trends.map(tr => (
            <div key={tr.label} className="ins-card">
              <div className="ins-card-label">{t(tr.label)}</div>
              <div className="ins-card-value">{tr.cur.toFixed(tr.decimals)}<span className="ins-card-unit">{tr.unit ? t(tr.unit) : ''}</span></div>
              <div className={`ins-card-delta ${tr.good === true ? 'good' : tr.good === false ? 'bad' : 'neutral'}`}>
                {tr.deltaPct > 0 ? '↑' : tr.deltaPct < 0 ? '↓' : '→'} {Math.abs(tr.deltaPct).toFixed(0)}% {t('за 2 недели')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* A2-A3. Рекорды и серии */}
      {(records.length > 0 || streaks.length > 0) && (
        <div className="ins-section">
          <h3 className="goals-section-title">🏆 {t('Рекорды и серии')}</h3>
          <div className="ins-badges">
            {streaks.map(s => (
              <span key={s.label} className="ins-badge streak">🔥 {s.days} {t(s.label)}</span>
            ))}
            {records.map(r => (
              <span key={r.label} className="ins-badge">{t(r.label)}: <b>{r.value.toLocaleString('ru-RU', { maximumFractionDigits: r.decimals })}{r.unit ? ' ' + t(r.unit) : ''}</b> · {fmtDate(r.date)}</span>
            ))}
          </div>
        </div>
      )}

      {/* A4. Аномалии */}
      {anomalies.length > 0 && (
        <div className="ins-section">
          <h3 className="goals-section-title">⚠️ {t('Дни-выбросы')}</h3>
          <div className="ins-badges">
            {anomalies.map((a, i) => (
              <span key={i} className="ins-badge anomaly">{fmtDate(a.date)} — {t(a.label)} {a.value.toFixed(a.decimals)}{a.unit ? ' ' + t(a.unit) : ''}</span>
            ))}
          </div>
        </div>
      )}

      {/* C. Хитмап */}
      <Heatmap daily={daily} />

      {/* D. Паттерны по дням недели */}
      {weekday.length > 0 && (
        <div className="ins-section">
          <h3 className="goals-section-title">📅 {t('Паттерны по дням недели')}</h3>
          <div className="ins-badges">
            {weekday.map((w, i) => (
              <span key={i} className="ins-badge">
                {t(WD_NAMES[w.weekday])}: {t(w.label)} {w.higher ? t('выше') : t('ниже')} {t('на')} {Math.abs(w.delta).toFixed(w.decimals)}{w.unit ? ' ' + t(w.unit) : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ margin: '20px 0 16px' }}>
        <button className="btn-primary" onClick={handleCompare}>
          {t('Сравнить эту неделю с прошлой')}
        </button>
      </div>

      {comparison && (
        <div className="insight-card cmp-card" style={{ marginBottom: 16 }}>
          <div className="insight-tag">{t('Сравнение недель')}</div>
          <table className="cmp-table">
            <thead>
              <tr>
                <th>{t('Метрика')}</th>
                <th>{t('Эта неделя')}</th>
                <th>{t('Прошлая неделя')}</th>
                <th>{t('Изменение')}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(row => (
                <tr key={row.label}>
                  <td className="cmp-label">{t(row.label)}</td>
                  <td className="cmp-val">{row.thisWeek} <span className="cmp-unit">{t(row.unit)}</span></td>
                  <td className="cmp-val muted">{row.lastWeek} <span className="cmp-unit">{t(row.unit)}</span></td>
                  <td><DeltaBadge delta={row.delta} unit={row.unit} higherIsBetter={row.higherIsBetter} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {insights.length === 0 ? (
        <p className="empty-hint">{t('Нужно хотя бы 14 дней данных для генерации инсайтов.')}</p>
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
      <p className="caveat">{t('Всё выше — наблюдения на основе данных, не медицинские рекомендации.')}</p>
    </div>
  )
}
