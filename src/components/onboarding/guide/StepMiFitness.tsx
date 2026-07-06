import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

export function StepMiFitness() {
  const { t } = useT()
  return (
    <div className="guide-content">
      <m.div
        className="guide-phone-frame"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        {/* Mi Fitness и Apple Health — дословные названия приложений, не переводим. */}
        <div className="guide-phone-row">Mi Fitness</div>
        <div className="guide-phone-row">{t('Профиль')} → {t('Настройки')}</div>
        <div className="guide-phone-row hl">Apple Health ✓</div>
      </m.div>
      <h2>{t('Включи синк с Apple Health')}</h2>
      <p>{t('В Mi Fitness: Профиль → Настройки → Apple Health → разреши запись данных. Дальше настроим как для Apple Watch.')}</p>
    </div>
  )
}
