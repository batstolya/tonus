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

function Heatmap({ daily }: { daily: DailyMetrics[] }) {
  const { t } = useT()
  const [mk, setMk] = useState(INSIGHT_METRICS[2]) // сон по умолчанию
  const [hover, setHover] = useState<{ date: string; v: number | null } | null>(null)
  const { cells } = buildHeatmap(daily, mk.key, mk.betterHigh)
  if (!cells.length) return null
  function color(pct: number | null) {
    if (pct == null) return 'var(--border)'
    const hue = pct * 120 // красный (плохо) → жёлтый → зелёный (хорошо)
    return `hsl(${hue} 65% 50%)`
  }
  const fmtVal = (v: number | null) => v == null ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: mk.decimals })
  const fmtD = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  return (
    <div className="ins-section">
      <div className="ins-section-head">
        <h3 className="goals-section-title" style={{ margin: 0 }}>🗓 {t('Календарь')}</h3>
        <select className="log-input" style={{ width: 'auto', fontSize: 13 }} value={mk.key as string}
          onChange={e => { setMk(INSIGHT_METRICS.find(m => m.key === e.target.value)!); setHover(null) }}>
          {INSIGHT_METRICS.map(m => <option key={m.key as string} value={m.key as string}>{t(m.label)}</option>)}
        </select>
      </div>
      <div className="heat-detail">
        {hover
          ? <span><b>{fmtD(hover.date)}</b> — {fmtVal(hover.v)}{mk.unit ? ' ' + t(mk.unit) : ''}</span>
          : <span className="settings-muted">{t('Наведи на день, чтобы увидеть число')}</span>}
      </div>
      <div className="heatmap">
        {cells.map(cell => (
          <div key={cell.date} className={`heat-cell${cell.v == null ? ' empty' : ''}`}
            style={{ background: color(cell.pct) }}
            onMouseEnter={() => setHover({ date: cell.date, v: cell.v })}
            onClick={() => setHover({ date: cell.date, v: cell.v })}
            title={`${fmtD(cell.date)}: ${fmtVal(cell.v)}`} />
        ))}
      </div>
    </div>
  )
}

export function InsightsScreen({ daily }: Props) {
  const { t } = useT()
  const insights = generateInsights(daily)

  const trends = computeTrends(daily)
  const records = computeRecords(daily)
  const streaks = computeStreaks(daily)
  const anomalies = computeAnomalies(daily)
  const weekday = computeWeekdayPatterns(daily)

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

      {insights.length > 0 && (
        <div className="insights-list">
          {insights.map(i => (
            <div key={i.id} className="insight-card">
              <div className="insight-tag">{i.metric}</div>
              <p>{i.text}</p>
            </div>
          ))}
        </div>
      )}

      {trends.length === 0 && records.length === 0 && weekday.length === 0 && insights.length === 0 && (
        <p className="empty-hint">{t('Нужно хотя бы 14 дней данных для генерации инсайтов.')}</p>
      )}
      <p className="caveat">{t('Всё выше — наблюдения на основе данных, не медицинские рекомендации.')}</p>
    </div>
  )
}
