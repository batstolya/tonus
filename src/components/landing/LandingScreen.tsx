import { useT } from '../../lib/i18n'
import './Landing.css'

export function LandingScreen({ onTry }: { onTry: () => void }) {
  const { t, lang, setLang } = useT()
  const nextLang = lang === 'ru' ? 'uk' : lang === 'uk' ? 'en' : 'ru'
  const flag = lang === 'ru' ? '🇷🇺' : lang === 'uk' ? '🇺🇦' : '🇬🇧'

  return (
    <div className="landing">
      <header className="landing-topbar">
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
        {/* Hero — плейсхолдер, заменяется на <HeroBlock/> в Task 5 */}
        <section className="landing-hero">
          <h1 className="landing-hero-title">
            {t('Всё о твоём здоровье — в одном месте. И AI, который находит, что на тебя реально влияет.')}
          </h1>
          <p className="landing-hero-sub">
            {t('Личный хаб здоровья: Apple Watch, привычки и анализы — а AI находит закономерности.')}
          </p>
          <button className="landing-cta landing-cta-lg" onClick={onTry}>{t('Попробовать')}</button>
        </section>

        {/* Блоки 2–6 вставляются в Task 6–10 */}

        <section className="landing-final-cta">
          <h2>{t('Готов(а) попробовать?')}</h2>
          <button className="landing-cta landing-cta-lg" onClick={onTry}>{t('Попробовать')}</button>
        </section>
      </main>
    </div>
  )
}
