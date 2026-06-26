import { useT } from '../../../lib/i18n'
import { useInView } from '../useInView'

export function FeatureGrid() {
  const { t } = useT()
  const [ref, inView] = useInView<HTMLDivElement>()

  const items = [
    { icon: '💊', label: t('Препараты и лечение') },
    { icon: '🧪', label: t('Анализы из лаборатории') },
    { icon: '🍔', label: t('Питание') },
    { icon: '🎯', label: t('Цели') },
    { icon: '📤', label: t('Экспорт данных') },
    { icon: '🌍', label: t('Три языка: ru / uk / en') },
  ]

  return (
    <section className="landing-block" ref={ref}>
      <h2 className="block-title">{t('И это ещё не всё')}</h2>
      <div className="feature-grid">
        {items.map((it, i) => (
          <div key={i} className={`feature-cell ${inView ? 'in' : ''}`} style={{ transitionDelay: `${i * 80}ms` }}>
            <span className="feature-icon">{it.icon}</span>
            <span>{it.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
