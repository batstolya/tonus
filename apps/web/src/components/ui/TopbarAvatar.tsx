import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getAvatarUrl } from '../../lib/api/avatar'
import { AVATAR_CHANGED } from '../../lib/avatarEvent'
import { type Lang, useT } from '../../lib/i18n'
import type { ThemeMode } from '../../hooks/useTheme'
import { Icon } from '../../lib/icons'
import { Avatar } from './Avatar'
import { LangFlyout } from './LangFlyout'
import { ThemeFlyout } from './ThemeFlyout'

interface TopbarAvatarProps {
  user: User
  lang: Lang
  onSelectLang: (lang: Lang) => void
  themeMode: ThemeMode
  onSelectTheme: (mode: ThemeMode) => void
  onOpenSettings: () => void
  onSignOut: () => void
}

const languageLabels: Record<Lang, string> = { ru: 'RU', uk: 'UA', en: 'EN' }

// Reads the photo itself rather than taking it as a prop: settings is the only
// place that changes it, and it announces the change on the window. Keeping the
// two independent avoids threading the URL through the whole shell for a
// picture that changes about once a year.
export function TopbarAvatar({
  user,
  lang,
  onSelectLang,
  themeMode,
  onSelectTheme,
  onOpenSettings,
  onSignOut,
}: TopbarAvatarProps) {
  const { t } = useT()
  const [url, setUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  // Only one flyout is ever open: picking a language while the theme panel is
  // out would leave two panels stacked on the same edge.
  const [flyout, setFlyout] = useState<'lang' | 'theme' | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const closeMenu = () => {
    setOpen(false)
    setFlyout(null)
  }

  useEffect(() => {
    let live = true
    const read = () => { void getAvatarUrl(user.id).then(u => { if (live) setUrl(u) }) }
    read()
    window.addEventListener(AVATAR_CHANGED, read)
    return () => { live = false; window.removeEventListener(AVATAR_CHANGED, read) }
  }, [user.id])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return
      setOpen(false)
      setFlyout(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setFlyout(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const themeLabel = (mode: ThemeMode) => {
    if (mode === 'light') return t('Светлая')
    if (mode === 'dark') return t('Тёмная')
    return t('Системная')
  }

  const selectLanguage = (nextLang: Lang) => {
    onSelectLang(nextLang)
    closeMenu()
  }

  const selectTheme = (mode: ThemeMode) => {
    onSelectTheme(mode)
    closeMenu()
  }

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        className="topbar-avatar"
        onClick={() => setOpen(value => !value)}
        title={t('Профиль')}
        aria-label={t('Профиль')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="account-menu-panel"
      >
        <Avatar url={url} size={28} />
      </button>
      {open && (
        <div id="account-menu-panel" className="account-menu-panel" role="dialog" aria-label={t('Профиль')}>
          <div className="account-menu-email">{user.email}</div>
          <button
            type="button"
            className={flyout === 'lang' ? 'active' : undefined}
            aria-expanded={flyout === 'lang'}
            onClick={() => setFlyout(value => (value === 'lang' ? null : 'lang'))}
          >
            <Icon name="world" /> {t('Язык')} <span>{languageLabels[lang]}</span><Icon name="chevronRight" />
          </button>
          <button
            type="button"
            className={flyout === 'theme' ? 'active' : undefined}
            aria-expanded={flyout === 'theme'}
            onClick={() => setFlyout(value => (value === 'theme' ? null : 'theme'))}
          >
            <Icon name="moon" /> {t('Тема')} <span>{themeLabel(themeMode)}</span><Icon name="chevronRight" />
          </button>
          <button type="button" onClick={() => { closeMenu(); onOpenSettings() }}>
            <Icon name="settings" /> {t('Настройки')}
          </button>
          <button type="button" onClick={() => { closeMenu(); onSignOut() }}>
            <Icon name="signOut" /> {t('Выйти')}
          </button>
          {flyout === 'lang' && <LangFlyout lang={lang} onSelect={selectLanguage} />}
          {flyout === 'theme' && <ThemeFlyout mode={themeMode} onSelect={selectTheme} />}
        </div>
      )}
    </div>
  )
}
