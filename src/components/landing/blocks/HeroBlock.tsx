import { lazy, Suspense } from 'react'
import { m } from 'motion/react'
import type { Variants } from 'motion/react'
import { useT } from '../../../lib/i18n'

const LiveDemoPanel = lazy(() =>
  import('../LiveDemoPanel').then(mod => ({ default: mod.LiveDemoPanel })),
)

const titleVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.08 } },
}
const wordVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

export function HeroBlock({ onTry, onDemo }: { onTry: () => void; onDemo?: () => void }) {
  const { t } = useT()
  const title = t('Всё о твоём здоровье — в одном месте. И AI, который находит, что на тебя реально влияет.')
  return (
    <section className="landing-hero">
      <div className="landing-hero-grid">
        <div className="landing-hero-copy">
          <m.h1 className="landing-hero-title" variants={titleVariants} initial="hidden" animate="show">
            {title.split(' ').map((w, i) => (
              <m.span
                key={i}
                variants={wordVariants}
                className={/AI|ШІ|ИИ/.test(w) ? 'lp-word lp-grad-text' : 'lp-word'}
              >
                {w}{' '}
              </m.span>
            ))}
          </m.h1>
          <m.p
            className="landing-hero-sub"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.5 }}
          >
            {t('Личный хаб здоровья: Apple Watch, привычки и анализы — а AI находит закономерности.')}
          </m.p>
          <m.div
            className="landing-hero-actions"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
          >
            <button className="landing-cta landing-cta-lg" onClick={onTry}>{t('Попробовать')}</button>
            {onDemo && <button className="landing-ghost landing-cta-lg" onClick={onDemo}>{t('Посмотреть демо')}</button>}
          </m.div>
        </div>
        <div className="landing-hero-demo">
          <Suspense fallback={<div className="ld-panel ld-skeleton lp-glass" />}>
            <LiveDemoPanel onDemo={onDemo} />
          </Suspense>
        </div>
      </div>
    </section>
  )
}
