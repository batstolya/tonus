import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

// Официальная страница HAE в App Store (Lybron/HealthyApps).
export const HAE_APPSTORE_URL = 'https://apps.apple.com/app/id1115567069'

export function StepInstallHAE() {
  const { t } = useT()
  return (
    <div className="guide-content">
      <m.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden="true">
          <rect x="4" y="4" width="80" height="80" rx="20" stroke="currentColor" strokeWidth="2" />
          <path d="M44 24v28m0 0-11-11m11 11 11-11M28 62h32" stroke="var(--green, #34d399)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </m.div>
      <h2>{t('Установи Health Auto Export')}</h2>
      <p>{t('Это приложение само отправляет данные Apple Health в Tonus. Есть бесплатный пробный период — хватит, чтобы всё проверить.')}</p>
      <a className="guide-cta" href={HAE_APPSTORE_URL} target="_blank" rel="noreferrer">{t('Открыть в App Store')}</a>
    </div>
  )
}
