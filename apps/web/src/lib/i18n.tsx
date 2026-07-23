import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { translate, detectLang, LOCALES, type Lang } from './translate'
import { persistentStorage } from './platform'

export type { Lang }
export { LANGS } from './translate'

interface I18nCtx {
  lang: Lang
  locale: string
  setLang: (l: Lang) => void
  t: (ru: string, vars?: Record<string, string | number>) => string
}

const Ctx = createContext<I18nCtx | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  const setLang = useCallback((l: Lang) => {
    persistentStorage.set('lang', l)
    setLangState(l)
  }, [])

  const t = useCallback((ru: string, vars?: Record<string, string | number>) => {
    let s = translate(ru, lang)
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    return s
  }, [lang])

  return <Ctx.Provider value={{ lang, locale: LOCALES[lang], setLang, t }}>{children}</Ctx.Provider>
}

// Provider + hook are one unit; splitting the file would churn every consumer.
// eslint-disable-next-line react-refresh/only-export-components
export function useT() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useT must be used within I18nProvider')
  return ctx
}
