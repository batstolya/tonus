import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getAvatarUrl } from '../../lib/api/avatar'
import { AVATAR_CHANGED } from '../../lib/avatarEvent'
import { type Lang, useT } from '../../lib/i18n'
import type { ThemeMode } from '../../hooks/useTheme'
import { Icon } from '../../lib/icons'
import { Avatar } from './Avatar'

interface TopbarAvatarProps {
  user: User
  lang: Lang
  onSelectLang: (lang: Lang) => void
  themeMode: ThemeMode
  onSelectTheme: (mode: ThemeMode) => void
  onOpenSettings: () => void
  onSignOut: () => void
}

type AccountMenuView = 'main' | 'language' | 'theme'

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
  const [view, setView] = useState<AccountMenuView>('main')

  const closeMenu = () => {
    setOpen(false)
    setView('main')
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setView('main')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const themeLabel = (mode: ThemeMode) => {
    if (mode === 'light') return t('Светлая')
    if (mode === 'dark') return t('Тёмная')
    return t('Системная')
  }

  const selectLanguage = (nextLang: Lang) => {
    onSelectLang(nextLang)
    setView('main')
  }

  const selectTheme = (mode: ThemeMode) => {
    onSelectTheme(mode)
    setView('main')
  }

  return (
    <div className="account-menu">
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
      {open && <>
        <div className="account-menu-overlay" onClick={closeMenu} />
        <div id="account-menu-panel" className="account-menu-panel" role="dialog" aria-label={t('Профиль')}>
          {view === 'main' && <>
            <div className="account-menu-email">{user.email}</div>
            <button type="button" onClick={() => setView('language')}>
              <Icon name="world" /> {t('Язык')} <span>{languageLabels[lang]}</span><Icon name="chevronRight" />
            </button>
            <button type="button" onClick={() => setView('theme')}>
              <Icon name="moon" /> {t('Тема')} <span>{themeLabel(themeMode)}</span><Icon name="chevronRight" />
            </button>
            <button type="button" onClick={() => { closeMenu(); onOpenSettings() }}>
              <Icon name="settings" /> {t('Настройки')}
            </button>
            <button type="button" onClick={() => { closeMenu(); onSignOut() }}>
              <Icon name="signOut" /> {t('Выйти')}
            </button>
          </>}
          {view === 'language' && <>
            <button type="button" onClick={() => setView('main')}>{t('Назад')}</button>
            {(['ru', 'uk', 'en'] as Lang[]).map(option => (
              <button type="button" key={option} onClick={() => selectLanguage(option)}>{languageLabels[option]}</button>
            ))}
          </>}
          {view === 'theme' && <>
            <button type="button" onClick={() => setView('main')}>{t('Назад')}</button>
            {(['light', 'dark', 'system'] as ThemeMode[]).map(option => (
              <button type="button" key={option} onClick={() => selectTheme(option)}>{themeLabel(option)}</button>
            ))}
          </>}
        </div>
      </>}
    </div>
  )
}
