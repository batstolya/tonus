import { useState } from 'react'
import type { DailyMetrics } from '../../types'
import { generateInsights } from '../../utils/insights'
import {
  computeTrends, computeRecords, computeStreaks, computeAnomalies,
  computeWeekdayPatterns, buildHeatmap, INSIGHT_METRICS, WD_NAMES,
} from '../../utils/insightsExtra'
import { useT } from '../../lib/i18n'

interface Props { daily: DailyMetrics[] }

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="ins-title">{children}</h3>
}

function Heatmap({ daily }: { daily: DailyMetrics[] }) {
  const { t, locale } = useT()
  const [mk, setMk] = useState(INSIGHT_METRICS[2])
  const [hover, setHover] = useState<{ date: string; v: number | null } | null>(null)
  const { cells } = buildHeatmap(daily, mk.key, mk.betterHigh)
  if (!cells.length) return null

  function color(pct: number | null) {
    if (pct == null) return 'var(--surface2)'
    const hue = pct * 130
    const light = 62 - pct * 8
    return `hsl(${hue} 72% ${light}%)`
  }
  const fmtVal = (v: number | null) =>
    v == null ? '—' : v.toLocaleString(locale, { maximumFractionDigits: mk.decimals })
  const cellVal = (v: number | null): string => {
    if (v == null) return ''
    if (mk.key === 'steps' || mk.key === 'activeEnergy')
      return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}к` : String(Math.round(v))
    return v.toFixed(mk.decimals)
  }
  const fmtD = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' })

  return (
    <div className="ins-block">
      <div className="ins-block-head">
        <SectionTitle>📅 {t('Календарь')}</SectionTitle>
        <select className="ins-select" value={mk.key as string}
          onChange={e => { setMk(INSIGHT_METRICS.find(m => m.key === e.target.value)!); setHover(null) }}>
          {INSIGHT_METRICS.map(m => <option key={m.key as string} value={m.key as string}>{t(m.label)}</option>)}
        </select>
      </div>
      <div className="heat-hint">
        {hover
          ? <><b>{fmtD(hover.date)}</b> — {fmtVal(hover.v)}{mk.unit ? ' ' + t(mk.unit) : ''}</>
          : <span className="settings-muted">
              {t('норма')}: {mk.betterHigh ? '≥' : '≤'} {mk.greenAt.toLocaleString(locale)}{mk.unit ? ' ' + t(mk.unit) : ''} — {t('зелёный')}
            </span>}
      </div>
      <div className="heatmap">
        {cells.map(cell => (
          <div key={cell.date}
            className={`heat-cell${cell.v == null ? ' empty' : ''}`}
            style={{ background: color(cell.pct) }}
            onMouseEnter={() => setHover({ date: cell.date, v: cell.v })}
            onClick={() => setHover({ date: cell.date, v: cell.v })}
            title={`${fmtD(cell.date)}: ${fmtVal(cell.v)}`}>
            {cellVal(cell.v)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function InsightsScreen({ daily }: Props) {
  const { t, locale } = useT()
  const insights = generateInsights(daily)
  const trends = computeTrends(daily)
  const records = computeRecords(daily)
  const streaks = computeStreaks(daily)
  const anomalies = computeAnomalies(daily)
  const weekday = computeWeekdayPatterns(daily)
  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  const isEmpty = trends.length === 0 && records.length === 0 && weekday.length === 0 && insights.length === 0

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>{t('Инсайты и тренды')}</h2>
      </div>

      {isEmpty && (
        <p className="empty-hint">{t('Нужно хотя бы 14 дней данных для генерации инсайтов.')}</p>
      )}

      {/* Тренды — карточки */}
      {trends.length > 0 && (
        <div className="ins-cards">
          {trends.map(tr => (
            <div key={tr.label} className="ins-card">
              <div className="ins-card-label">{t(tr.label)}</div>
              <div className="ins-card-value">
                {tr.cur.toFixed(tr.decimals)}
                <span className="ins-card-unit">{tr.unit ? t(tr.unit) : ''}</span>
              </div>
              <div className={`ins-card-delta ${tr.good === true ? 'good' : tr.good === false ? 'bad' : 'neutral'}`}>
                {tr.deltaPct > 0 ? '↑' : tr.deltaPct < 0 ? '↓' : '→'} {Math.abs(tr.deltaPct).toFixed(0)}% {t('за 2 недели')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Рекорды и серии */}
      {(records.length > 0 || streaks.length > 0) && (
        <div className="ins-block">
          <SectionTitle>🏆 {t('Рекорды и серии')}</SectionTitle>
          <div className="ins-chips">
            {streaks.map(s => (
              <span key={s.label} className="ins-chip ins-chip--streak">
                🔥 {s.days} {t(s.label)}
              </span>
            ))}
            {records.map(r => (
              <span key={r.label} className="ins-chip">
                {t(r.label)}: <b>{r.value.toLocaleString(locale, { maximumFractionDigits: r.decimals })}{r.unit ? ' ' + t(r.unit) : ''}</b>
                <span className="ins-chip-date"> · {fmtDate(r.date)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Аномалии */}
      {anomalies.length > 0 && (
        <div className="ins-block">
          <SectionTitle>⚠️ {t('Дни-выбросы')}</SectionTitle>
          <div className="ins-chips">
            {anomalies.map((a, i) => (
              <span key={i} className="ins-chip ins-chip--warn">
                {fmtDate(a.date)} — {t(a.label)} {a.value.toFixed(a.decimals)}{a.unit ? ' ' + t(a.unit) : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI инсайты */}
      {insights.length > 0 && (
        <div className="ins-block">
          <SectionTitle>💡 {t('Наблюдения')}</SectionTitle>
          <div className="ins-ai-list">
            {insights.map(i => (
              <div key={i.id} className="ins-ai-card">
                <span className="ins-ai-tag">{i.metric}</span>
                <p>{i.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Хитмап */}
      <Heatmap daily={daily} />

      {/* Паттерны по дням недели */}
      {weekday.length > 0 && (
        <div className="ins-block">
          <SectionTitle>📆 {t('Паттерны по дням недели')}</SectionTitle>
          <div className="ins-chips">
            {weekday.map((w, i) => (
              <span key={i} className="ins-chip">
                <b>{t(WD_NAMES[w.weekday])}</b>: {t(w.label)} {w.higher ? t('выше') : t('ниже')} {t('на')} {Math.abs(w.delta).toFixed(w.decimals)}{w.unit ? ' ' + t(w.unit) : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="ins-caveat">{t('Всё выше — наблюдения на основе данных, не медицинские рекомендации.')}</p>
    </div>
  )
}
