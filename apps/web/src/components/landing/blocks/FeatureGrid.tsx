import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

const ITEMS = [
  { icon: '💊', label: 'Препараты и лечение' },
  { icon: '🧪', label: 'Анализы из лаборатории' },
  { icon: '🍔', label: 'Питание' },
  { icon: '🎯', label: 'Цели' },
  { icon: '🔬', label: 'Эксперименты' },
  { icon: '🩺', label: 'Проблемы и симптомы' },
  { icon: '📤', label: 'Экспорт данных' },
  { icon: '🌍', label: 'Два языка: uk / en' },
]

export function FeatureGrid() {
  const { t } = useT()
  return (
    <section className="landing-block">
      <h2 className="block-title">{t('И это ещё не всё')}</h2>
      <div className="feature-grid">
        {ITEMS.map((it, i) => (
          <m.div
            key={it.label}
            className="feature-cell lp-glass"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: (i % 4) * 0.07, duration: 0.45 }}
          >
            <span className="feature-icon">{it.icon}</span>
            <span>{t(it.label)}</span>
          </m.div>
        ))}
      </div>
    </section>
  )
}
