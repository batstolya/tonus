import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useT } from '../../../lib/i18n'

// Стилизованные «экраны» HAE вместо скриншотов: не устареют при обновлениях
// интерфейса HAE и переводятся вместе с остальным UI.
const FRAMES = ['plus', 'type', 'format'] as const

export function StepAutomation() {
  const { t } = useT()
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % FRAMES.length), 2500)
    return () => clearInterval(id)
  }, [])
  const f = FRAMES[frame]
  return (
    <div className="guide-content">
      <AnimatePresence mode="wait">
        <m.div
          key={f}
          className="guide-phone-frame"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25 }}
        >
          {f === 'plus' ? (
            <>
              <div className="guide-phone-row">Automations</div>
              <div className="guide-phone-row hl">{t('Automations → «+»')}</div>
            </>
          ) : f === 'type' ? (
            <>
              <div className="guide-phone-row">Automations</div>
              <div className="guide-phone-row hl">{t('Тип: REST API')}</div>
              <div className="guide-phone-row">MQTT</div>
              <div className="guide-phone-row">Home Assistant</div>
            </>
          ) : (
            <>
              <div className="guide-phone-row">REST API</div>
              <div className="guide-phone-row hl">{t('Метод POST · Формат JSON')}</div>
            </>
          )}
        </m.div>
      </AnimatePresence>
      <h2>{t('Создай автоматизацию')}</h2>
      <p>{t('В Health Auto Export открой вкладку Automations и нажми «+».')}</p>
    </div>
  )
}
