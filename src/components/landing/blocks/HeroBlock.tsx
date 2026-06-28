import { useT } from '../../../lib/i18n'
import HeroShowcase from '../HeroShowcase'

export function HeroBlock({ onTry }: { onTry: () => void }) {
  const { t } = useT()
  return (
    <section className="landing-hero">
      <svg className="hero-pulse" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,100 L300,100 L330,100 L350,40 L370,160 L390,100 L420,100 L1200,100" />
      </svg>
      <div className="landing-hero-grid">
        <div className="landing-hero-copy">
          <h1 className="landing-hero-title">
            {t('Всё о твоём здоровье — в одном месте. И AI, который находит, что на тебя реально влияет.')}
          </h1>
          <p className="landing-hero-sub">
            {t('Личный хаб здоровья: Apple Watch, привычки и анализы — а AI находит закономерности.')}
          </p>
          <button className="landing-cta landing-cta-lg" onClick={onTry}>{t('Попробовать')}</button>
        </div>
        <div className="landing-hero-demo">
          <HeroShowcase />
        </div>
      </div>
    </section>
  )
}
