import type { CSSProperties } from 'react'
import { useT } from '../../../lib/i18n'
import { useInView } from '../useInView'
import { Counter } from '../../ui/Counter'

export function MetricsBlock() {
  const { t } = useT()
  const [ref, inView] = useInView<HTMLDivElement>()

  const bars = [40, 65, 50, 80, 60, 90, 70] // высоты в %

  return (
    <section className="landing-block" ref={ref}>
      <div className={`landing-reveal ${inView ? 'in' : ''}`}>
        <h2 className="block-title">📊 {t('Все метрики в одном дашборде')}</h2>
        <p className="block-sub">{t('Apple Watch синхронизируется автоматически — а ты видишь живую картину.')}</p>

        <div className="metrics-grid">
          <div className="metric-card">
            <span className="metric-label">{t('Пульс покоя')}</span>
            <span className="metric-value">{inView ? <Counter value={58} /> : 0} <small>bpm</small></span>
          </div>
          <div className="metric-card">
            <span className="metric-label">{t('Сон')}</span>
            <span className="metric-value">{inView ? <Counter value={7} /> : 0}<small>ч 20м</small></span>
          </div>
          <div className="metric-card">
            <span className="metric-label">{t('Активность')}</span>
            <span className="metric-value">{inView ? <Counter value={512} /> : 0} <small>kcal</small></span>
          </div>

          <div className="metric-card metric-chart">
            <span className="metric-label">{t('Стресс')}</span>
            <div className={`bars ${inView ? 'grow' : ''}`}>
              {bars.map((h, i) => (
                <span
                  key={i}
                  className="bar"
                  style={{ '--h': `${h}%`, transitionDelay: `${i * 80}ms` } as CSSProperties}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
