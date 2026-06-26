import { useT } from '../../../lib/i18n'
import { useInView } from '../useInView'

export function InsightsBlock() {
  const { t } = useT()
  const [ref, inView] = useInView<HTMLDivElement>()

  const insights = [
    { title: t('☕ Кофе после 15:00'), text: t('→ сон на 1.5 ч короче') },
    { title: t('🍽️ Поздняя еда'), text: t('→ HRV падает на 15%') },
    { title: t('💼 Стрессовые дни'), text: t('→ пульс покоя выше на 8 уд/мин') },
  ]

  return (
    <section className="landing-block" ref={ref}>
      <div className={`landing-reveal ${inView ? 'in' : ''}`}>
        <h2 className="block-title">🧠 {t('AI находит закономерности, которые ты сам не заметишь')}</h2>
        <p className="block-sub">{t('Связывает сон, питание, стресс и активность — и показывает, что на что влияет.')}</p>

        <div className={`insights-web ${inView ? 'live' : ''}`} aria-hidden="true">
          <span className="node n1" /><span className="node n2" /><span className="node n3" />
          <span className="node n4" /><span className="node n5" />
          <svg className="web-lines" viewBox="0 0 400 160" preserveAspectRatio="none">
            <path d="M40,40 L200,80" /><path d="M200,80 L360,30" /><path d="M200,80 L120,140" /><path d="M200,80 L320,130" />
          </svg>
        </div>

        <div className="insight-cards">
          {insights.map((it, i) => (
            <div key={i} className={`insight-card ${inView ? 'in' : ''}`} style={{ transitionDelay: `${0.4 + i * 0.2}s` }}>
              <span className="insight-card-title">{it.title}</span>
              <span className="insight-card-text">{it.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
