// Чистая логика wizard-а подключения: какие шаги показывать для какой ветки
// и как переживать перезагрузку страницы. Без DOM и без Supabase.
import type { DeviceType } from '../../store/appStore'

export type GuidePhone = 'iphone' | 'android'
export type GuideStepId =
  | 'device' | 'explain' | 'phone' | 'mifitness'
  | 'install' | 'automation' | 'webhook' | 'schedule' | 'verify'
  | 'android_soon'

const HAE_STEPS: GuideStepId[] = ['install', 'automation', 'webhook', 'schedule', 'verify']

export function stepsFor(device: DeviceType | null, phone: GuidePhone | null): GuideStepId[] {
  if (device === 'apple_watch') return ['device', 'explain', ...HAE_STEPS]
  if (device === 'xiaomi') {
    if (phone === 'iphone') return ['device', 'explain', 'phone', 'mifitness', ...HAE_STEPS]
    if (phone === 'android') return ['device', 'explain', 'phone', 'android_soon']
    return ['device', 'explain', 'phone']
  }
  return ['device']
}

const STEP_KEY = 'tonus.connectGuideStep'
const PHONE_KEY = 'tonus.connectGuidePhone'
export const DISMISSED_KEY = 'tonus.connectGuideDismissed'

export interface GuideProgress { step: number; phone: GuidePhone | null }

export function loadGuideProgress(): GuideProgress {
  const raw = Number(localStorage.getItem(STEP_KEY) ?? '0')
  const phone = localStorage.getItem(PHONE_KEY)
  return {
    step: Number.isInteger(raw) && raw >= 0 ? raw : 0,
    phone: phone === 'iphone' || phone === 'android' ? phone : null,
  }
}

export function saveGuideProgress(p: GuideProgress): void {
  localStorage.setItem(STEP_KEY, String(p.step))
  if (p.phone) localStorage.setItem(PHONE_KEY, p.phone)
  else localStorage.removeItem(PHONE_KEY)
}

export function clearGuideProgress(): void {
  localStorage.removeItem(STEP_KEY)
  localStorage.removeItem(PHONE_KEY)
}

const OWNER_KEY = 'tonus.connectGuideUser'

// Прогресс и «Пропустить» принадлежат конкретному аккаунту: при входе другого
// пользователя в этом же браузере гайд начинается заново, а не резюмирует чужой.
export function ensureGuideOwner(userId: string): void {
  if (localStorage.getItem(OWNER_KEY) === userId) return
  localStorage.setItem(OWNER_KEY, userId)
  localStorage.removeItem(DISMISSED_KEY)
  clearGuideProgress()
}
