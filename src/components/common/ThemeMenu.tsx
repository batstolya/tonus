import { useState } from 'react'
import { useT } from '../../lib/i18n'
import type { ThemeMode } from '../../hooks/useTheme'

// Переключатель темы в стиле mate: попап «Тема» с тремя карточками-превью
// (Светлая / Тёмная / Системная). Системная следует за темой ОС.
const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Светлая' },
  { mode: 'dark', label: 'Тёмная' },
  { mode: 'system', label: 'Системная' },
]

function Preview({ mode }: { mode: ThemeMode }) {
  return (
    <span className={`theme-preview theme-preview-${mode}`} aria-hidden>
      <span /><span /><span />
    </span>
  )
}

export function ThemeMenu({ mode, onSelect }: { mode: ThemeMode; onSelect: (m: ThemeMode) => void }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)

  return (
    <div className="lang-picker">
      <button className="theme-toggle" onClick={() => setOpen(o => !o)} title={t('Тема')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open && (
        <>
          <div className="lang-overlay" onClick={() => setOpen(false)} />
          <div className="lang-menu theme-menu">
            <div className="theme-menu-title">{t('Тема')}</div>
            <div className="theme-menu-options">
              {OPTIONS.map(o => (
                <button key={o.mode}
                  className={`theme-option${mode === o.mode ? ' active' : ''}`}
                  onClick={() => { onSelect(o.mode); setOpen(false) }}>
                  <Preview mode={o.mode} />
                  <span className="theme-option-label">{t(o.label)}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
