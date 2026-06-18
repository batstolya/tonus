import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { translations } from './translations'

export type Lang = 'ru' | 'uk' | 'en'

const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
]
export { LANGS }

function detectLang(): Lang {
  const saved = localStorage.getItem('lang') as Lang | null
  if (saved && ['ru', 'uk', 'en'].includes(saved)) return saved
  const nav = navigator.language.slice(0, 2)
  if (nav === 'uk') return 'uk'
  if (nav === 'en') return 'en'
  return 'ru'
}

interface I18nCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (ru: string, vars?: Record<string, string | number>) => string
}

const Ctx = createContext<I18nCtx | null>(null)

// Перевод по русскому ключу. Если перевода нет — возвращает русский исходник.
function translate(ru: string, lang: Lang): string {
  if (lang === 'ru') return ru
  return translations[ru]?.[lang] ?? ru
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem('lang', l)
    setLangState(l)
  }, [])

  const t = useCallback((ru: string, vars?: Record<string, string | number>) => {
    let s = translate(ru, lang)
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    return s
  }, [lang])

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

export function useT() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useT must be used within I18nProvider')
  return ctx
}
