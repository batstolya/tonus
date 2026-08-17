import { useT } from '../../lib/i18n'
import type { Lang } from '../../lib/i18n'

// Each language names itself: someone looking for a language they can read
// should not have to read the current one to find it.
const OPTIONS: { code: Lang; label: string; short: string }[] = [
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'uk', label: 'Українська', short: 'UA' },
  { code: 'en', label: 'English', short: 'EN' },
]

// The language picker as a panel beside the account menu, matching the theme
// one: the account list stays visible behind it. Presentational — the owner
// holds the open state and closes on select.
export function LangFlyout({ lang, onSelect }: { lang: Lang; onSelect: (l: Lang) => void }) {
  const { t } = useT()
  return (
    <div className="theme-flyout lang-flyout" role="dialog" aria-label={t('Язык')}>
      <div className="theme-flyout-title">{t('Язык')}</div>
      {OPTIONS.map(option => (
        <button
          type="button"
          key={option.code}
          className={`lang-option${lang === option.code ? ' active' : ''}`}
          aria-pressed={lang === option.code}
          onClick={() => onSelect(option.code)}
        >
          <span className="lang-label">{option.label}</span>
          <span className="lang-code">{option.short}</span>
        </button>
      ))}
    </div>
  )
}
