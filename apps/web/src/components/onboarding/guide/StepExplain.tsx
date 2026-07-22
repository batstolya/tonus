import { useId } from 'react'
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

// Появление элементов сцены по очереди: часы → стрелка → телефон → стрелка → график.
const appear = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, type: 'spring' as const, stiffness: 260, damping: 22 },
})

export function StepExplain() {
  const { t } = useT()
  // useId обязателен: дубликаты id градиентов уже ломали SVG на лендинге.
  const grad = useId()
  return (
    <div className="guide-content">
      <svg width="280" height="120" viewBox="0 0 280 120" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--green, #34d399)" />
            <stop offset="100%" stopColor="var(--yellow, #fbbf24)" />
          </linearGradient>
        </defs>
        {/* часы */}
        <m.g {...appear(0)} stroke="currentColor" strokeWidth="2">
          <rect x="14" y="34" width="36" height="52" rx="9" fill="none" />
          <path d="M22 50h20M22 70h20" />
        </m.g>
        <m.path {...appear(0.35)} d="M60 60h34m0 0-8-8m8 8-8 8" stroke="currentColor" strokeWidth="2" />
        {/* телефон */}
        <m.g {...appear(0.7)} stroke="currentColor" strokeWidth="2">
          <rect x="104" y="22" width="44" height="76" rx="8" fill="none" />
          <path d="M120 90h12" />
        </m.g>
        <m.path {...appear(1.05)} d="M158 60h34m0 0-8-8m8 8-8 8" stroke="currentColor" strokeWidth="2" />
        {/* график Tonus */}
        <m.g {...appear(1.4)}>
          <rect x="202" y="30" width="64" height="60" rx="10" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M210 76l14-16 12 8 18-22" stroke={`url(#${grad})`} strokeWidth="3" strokeLinecap="round" fill="none" />
        </m.g>
      </svg>
      <h2>{t('Данные будут приходить сами')}</h2>
      <p>{t('Часы → телефон → Tonus. Один раз настроим — дальше всё автоматически, каждый день.')}</p>
    </div>
  )
}
