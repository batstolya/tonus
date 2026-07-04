import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

// Сохранённый выбор пользователя побеждает; иначе — дефолт контекста
// (лендинг/незалогинен → light, приложение → dark).
export function resolveTheme(saved: string | null, fallback: Theme): Theme {
  return saved === 'dark' || saved === 'light' ? saved : fallback
}

export function useTheme(defaultTheme: Theme = 'dark') {
  // Пишем в localStorage только при явном toggle: простое посещение
  // не должно фиксировать тему навсегда.
  const [saved, setSaved] = useState<string | null>(() => localStorage.getItem('theme'))
  const theme = resolveTheme(saved, defaultTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    setSaved(next)
  }
  return { theme, toggle }
}
