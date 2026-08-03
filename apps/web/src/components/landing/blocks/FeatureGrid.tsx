import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'
import { Icon, type IconName } from '../../../lib/icons'

const ITEMS: { icon: IconName; label: string }[] = [
  { icon: 'meds', label: 'Препараты и лечение' },
  { icon: 'lab', label: 'Анализы из лаборатории' },
  { icon: 'fastFood', label: 'Питание' },
  { icon: 'focus', label: 'Цели' },
  { icon: 'microscope', label: 'Эксперименты' },
  { icon: 'stethoscope', label: 'Проблемы и симптомы' },
  { icon: 'exportData', label: 'Экспорт данных' },
  { icon: 'world', label: 'Два языка: uk / en' },
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
            <span className="feature-icon"><Icon name={it.icon} size={24} /></span>
            <span>{t(it.label)}</span>
          </m.div>
        ))}
      </div>
    </section>
  )
}
