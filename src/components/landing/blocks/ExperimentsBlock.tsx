import { useT } from '../../../lib/i18n'
import { useInView } from '../useInView'
import { Counter } from '../../ui/Counter'

export function ExperimentsBlock() {
  const { t } = useT()
  const [ref, inView] = useInView<HTMLDivElement>()

  return (
    <section className="landing-block" ref={ref}>
      <div className={`landing-reveal ${inView ? 'in' : ''}`}>
        <h2 className="block-title">🔬 {t('Проверяй, что работает именно на тебе')}</h2>
        <p className="block-sub">{t('Гипотеза: меньше кофе → лучше сон')}</p>

        <div className="lp-exp-timeline">
          <div className={`lp-exp-period a ${inView ? 'in' : ''}`}><span>{t('Период A')}</span></div>
          <div className={`lp-exp-period b ${inView ? 'in' : ''}`}><span>{t('Период B')}</span></div>
        </div>

        <div className={`lp-exp-result ${inView ? 'in' : ''}`}>
          <span className="lp-exp-result-label">{t('Результат')}</span>
          <span className="lp-exp-result-delta">+{inView ? <Counter value={12} /> : 0}%</span>
          <span className="lp-exp-result-metric">{t('глубокий сон')}</span>
        </div>
      </div>
    </section>
  )
}
