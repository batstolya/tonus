import { useEffect, useState } from 'react'
import { computeAdherence, type AdherenceLog } from '../../lib/adherence'
import { getAdherenceLogs } from '../../lib/api/supplements'
import { isDemoActive } from '../../lib/demo'
import { demoList } from '../../lib/demoDb'
import { useT } from '../../lib/i18n'
import type { Supplement } from '../../lib/supplements'

// Соблюдение препаратов (F6 smart-tonus): скользящее окно 14/30 дней
// (в отличие от календарного месяца выше), серии подряд, общий процент.
// Логи грузим сами — экрану доступен только текущий месяц.

const demoLogs = (): AdherenceLog[] => {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  return demoList('supplement_logs').filter(l => l.date >= since) as AdherenceLog[]
}

export function AdherenceBlock({ supplements }: { supplements: Supplement[] }) {
  const { t } = useT()
  // Демо-логи ставим ленивым инициализатором, а не setState в эффекте
  // (react-hooks/set-state-in-effect) — то же состояние, на рендер меньше.
  const [logs, setLogs] = useState<AdherenceLog[]>(() => isDemoActive() ? demoLogs() : [])
  const [win, setWin] = useState<14 | 30>(14)
  const active = supplements.filter(s => s.active)

  useEffect(() => {
    if (!active.length || isDemoActive()) return
    let cancelled = false
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    getAdherenceLogs(since).then(data => { if (!cancelled) setLogs(data) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.length])

  if (!active.length) return null
  const { items, overallPct } = computeAdherence(active, logs, win)
  if (!items.length) return null

  return (
    <div className="ins-block adherence-block">
      <div className="ins-block-head">
        <h3 className="ins-title">📈 {t('Соблюдение')}</h3>
        <div className="adherence-tabs">
          {([14, 30] as const).map(w => (
            <button key={w} className={`chat-period-btn ${win === w ? 'active' : ''}`} onClick={() => setWin(w)}>
              {w} {t('дн.')}
            </button>
          ))}
        </div>
      </div>
      {overallPct != null && (
        <p className="adherence-overall">
          {t('В среднем')}: <b>{overallPct}%</b>
        </p>
      )}
      <div className="adherence-list">
        {items.map(i => (
          <div key={i.id} className="adherence-row">
            <span className="adherence-name">
              {i.name}
              {i.streak >= 3 && <span className="adherence-streak"> 🔥 {i.streak} {t('дн.')}</span>}
            </span>
            <div className="adherence-bar">
              <div
                className="adherence-fill"
                style={{ width: `${i.pct}%`, background: i.pct >= 80 ? '#34d399' : i.pct >= 50 ? '#f59e0b' : '#ef4444' }}
              />
            </div>
            <span className="adherence-pct">{i.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
