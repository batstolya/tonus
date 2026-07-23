import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'
export type ThemeMode = 'dark' | 'light' | 'system'

// Сохранённый выбор пользователя побеждает; иначе — дефолт контекста
// (лендинг/незалогинен → light, приложение → dark).
export function resolveTheme(saved: string | null, fallback: Theme): Theme {
  return saved === 'dark' || saved === 'light' ? saved : fallback
}

// Режим темы (mate-style): явный light/dark или system (следует за ОС).
// Мусор и отсутствие значения → system.
export function resolveMode(saved: string | null): ThemeMode {
  return saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'system'
}

// Итоговая тема из режима: system подставляет тему ОС (или контекстный дефолт,
// когда matchMedia недоступен — тесты/старые браузеры).
export function themeFromMode(mode: ThemeMode, systemDark: boolean | null, fallback: Theme): Theme {
  if (mode !== 'system') return mode
  return systemDark == null ? fallback : (systemDark ? 'dark' : 'light')
}

function systemPrefersDark(): boolean | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function useTheme(defaultTheme: Theme = 'dark') {
  // Пишем в localStorage только при явном выборе: простое посещение
  // не должно фиксировать тему навсегда.
  const [mode, setModeState] = useState<ThemeMode>(() => resolveMode(localStorage.getItem('theme')))
  const [sysDark, setSysDark] = useState<boolean | null>(systemPrefersDark)

  // Пока пользователь ничего не выбирал (нет ключа в localStorage), system
  // не должен ломать старый контекстный дефолт лендинга: без сохранённого
  // выбора и без matchMedia остаётся defaultTheme.
  const theme = themeFromMode(mode, sysDark, defaultTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // system-режим следует за сменой темы ОС на лету
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setMode = (m: ThemeMode) => {
    localStorage.setItem('theme', m)
    setModeState(m)
  }

  // Легаси-переключатель (лендинг): явный выбор противоположной темы
  const toggle = () => setMode(theme === 'dark' ? 'light' : 'dark')

  return { theme, mode, setMode, toggle }
}
