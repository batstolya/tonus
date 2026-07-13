// Словарь переводов. Ключ — русский исходный текст. Значения — uk и en.
// Если ключа нет — UI показывает русский исходник (см. i18n.tsx).
// Разбит по доменам (воркстрим C): части в ./*.ts, здесь только слияние.
import { common } from './common'
import { onboarding } from './onboarding'
import { dashboard } from './dashboard'
import { settings } from './settings'
import { health } from './health'
import { ai_insights } from './ai-insights'
import { metrics } from './metrics'
import { landing } from './landing'

export interface Translation { uk: string; en: string }

export const translations: Record<string, Translation> = {
  ...common,
  ...onboarding,
  ...dashboard,
  ...settings,
  ...health,
  ...ai_insights,
  ...metrics,
  ...landing,
}
