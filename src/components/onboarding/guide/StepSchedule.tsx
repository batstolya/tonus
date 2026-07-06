import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

const ITEMS = [
  'Включи все метрики здоровья и сон',
  'Интервал — каждые 1-3 часа',
  'Не забудь включить автоматизацию (Enable)',
]

export function StepSchedule() {
  const { t } = useT()
  return (
    <div className="guide-content">
      <h2>{t('Выбери данные и расписание')}</h2>
      <ul className="guide-checklist">
        {ITEMS.map((item, i) => (
          <m.li
            key={item}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.25 }}
          >
            ✅ {t(item)}
          </m.li>
        ))}
      </ul>
    </div>
  )
}
