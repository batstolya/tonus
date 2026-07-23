import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

export function FinalCta({ onTry, onDemo }: { onTry: () => void; onDemo?: () => void }) {
  const { t } = useT()
  return (
    <m.section
      className="landing-final-cta lp-glass"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.55 }}
    >
      <h2>{t('Готов(а) попробовать?')}</h2>
      <div className="landing-hero-actions" style={{ justifyContent: 'center' }}>
        <button className="landing-cta landing-cta-lg" onClick={onTry}>{t('Попробовать')}</button>
        {onDemo && <button className="landing-ghost landing-cta-lg" onClick={onDemo}>{t('Посмотреть демо')}</button>}
      </div>
      <p className="lp-footer">Tonus © 2026</p>
    </m.section>
  )
}
