import { useEffect, useState } from 'react'
import { LazyMotion, domMax, MotionConfig } from 'motion/react'
import { useT } from '../../lib/i18n'
import { HeroBlock } from './blocks/HeroBlock'
import { MetricsBlock } from './blocks/MetricsBlock'
import { InsightsBlock } from './blocks/InsightsBlock'
import { ChatBlock } from './blocks/ChatBlock'
import { ExperimentsBlock } from './blocks/ExperimentsBlock'
import { FeatureGrid } from './blocks/FeatureGrid'
import './Landing.css'

export function LandingScreen({ onTry, onDemo }: { onTry: () => void; onDemo?: () => void }) {
  const { t, lang, setLang } = useT()
  const nextLang = lang === 'ru' ? 'uk' : lang === 'uk' ? 'en' : 'ru'
  const flag = lang === 'ru' ? '🇷🇺' : lang === 'uk' ? '🇺🇦' : '🇬🇧'
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <div className="landing">
          <div className="lp-bg" aria-hidden="true">
            <span className="lp-glow lp-glow-a" />
            <span className="lp-glow lp-glow-b" />
          </div>

          <header className={`landing-topbar${scrolled ? ' scrolled' : ''}`}>
            <span className="landing-logo">Tonus</span>
            <div className="landing-topbar-right">
              <button className="landing-lang" onClick={() => setLang(nextLang)} aria-label="Язык">
                {flag}
              </button>
              <button className="landing-ghost" onClick={onTry}>{t('Войти')}</button>
              <button className="landing-cta" onClick={onTry}>{t('Попробовать')}</button>
            </div>
          </header>

          <main className="landing-main">
            <HeroBlock onTry={onTry} onDemo={onDemo} />
            {/* Старые блоки: заменяются по мере выполнения задач 5–8 */}
            <MetricsBlock />
            <InsightsBlock />
            <ChatBlock />
            <ExperimentsBlock />
            <FeatureGrid />
            <section className="landing-final-cta">
              <h2>{t('Готов(а) попробовать?')}</h2>
              <button className="landing-cta landing-cta-lg" onClick={onTry}>{t('Попробовать')}</button>
            </section>
          </main>
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
