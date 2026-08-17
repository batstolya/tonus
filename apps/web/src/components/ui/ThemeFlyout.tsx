import { useT } from '../../lib/i18n'
import type { ThemeMode } from '../../hooks/useTheme'

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Светлая' },
  { mode: 'dark', label: 'Тёмная' },
  { mode: 'system', label: 'Системная' },
]

// The three previews are drawn in CSS rather than as icons: they have to show
// the actual page colours of each theme, which no monochrome glyph can do.
// System is the split of the other two.
function Preview({ mode }: { mode: ThemeMode }) {
  return (
    <span className={`theme-preview theme-preview-${mode}`} aria-hidden>
      <span /><span /><span />
    </span>
  )
}

// The theme picker as a panel beside the account menu, not a view inside it:
// the list behind it stays readable, so the choice keeps its context. Purely
// presentational — the owner keeps the open state and closes on select.
export function ThemeFlyout({ mode, onSelect }: { mode: ThemeMode; onSelect: (m: ThemeMode) => void }) {
  const { t } = useT()
  return (
    <div className="theme-flyout" role="dialog" aria-label={t('Тема')}>
      <div className="theme-flyout-title">{t('Тема')}</div>
      <div className="theme-flyout-options">
        {OPTIONS.map(option => (
          <button
            type="button"
            key={option.mode}
            className={`theme-option${mode === option.mode ? ' active' : ''}`}
            aria-pressed={mode === option.mode}
            onClick={() => onSelect(option.mode)}
          >
            <Preview mode={option.mode} />
            <span className="theme-option-label">{t(option.label)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
