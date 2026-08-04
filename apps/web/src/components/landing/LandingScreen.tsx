import { useEffect, useState } from 'react'
import { LazyMotion, domMax, MotionConfig } from 'motion/react'
import { useT } from '../../lib/i18n'
import { HeroBlock } from './blocks/HeroBlock'
import { TrustStrip } from './blocks/TrustStrip'
import { HowItWorks } from './blocks/HowItWorks'
import { ChatBlock } from './blocks/ChatBlock'
import { TelegramBlock } from './blocks/TelegramBlock'
import { FeatureGrid } from './blocks/FeatureGrid'
import { FinalCta } from './blocks/FinalCta'
import './Landing.css'
import { Icon } from '../../lib/icons'

export function LandingScreen({ onTry, onDemo, theme, onToggleTheme }: {
  onTry: () => void
  onDemo?: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}) {
  const { t, lang, setLang } = useT()
  // Русский скрыт — переключаем только между украинским и английским.
  const nextLang = lang === 'uk' ? 'en' : 'uk'
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
              <button className="landing-lang" onClick={onToggleTheme} aria-label={t('Сменить тему')} title={t('Сменить тему')}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
              </button>
              <button className="landing-lang" onClick={() => setLang(nextLang)} aria-label={t('Язык')}>
                <Icon name="world" size={16} /> {lang === 'uk' ? 'UA' : 'EN'}
              </button>
              <button className="landing-ghost" onClick={onTry}>{t('Войти')}</button>
              <button className="landing-cta" onClick={onTry}>{t('Попробовать')}</button>
            </div>
          </header>

          <main className="landing-main">
            <HeroBlock onTry={onTry} onDemo={onDemo} />
            <TrustStrip />
            <HowItWorks />
            <ChatBlock />
            <TelegramBlock />
            <FeatureGrid />
            <FinalCta onTry={onTry} onDemo={onDemo} />
          </main>
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
