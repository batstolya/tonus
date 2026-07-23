import { supabase } from './supabase'
import { ephemeralStorage } from './platform'

// Приватность деликатных записей (см. спеку 2026-07-11-private-concerns).
// Это защита от чужих глаз на экране, НЕ шифрование: данные в БД и в
// AI-анализе остаются как есть. Маскируем только отображение.

const UNLOCK_KEY = 'tonus_privacy_unlocked'
const MASKED_CONCERN_LABEL = '🔒 Скрытая проблема'

export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`tonus-pin:${pin}`))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Unlock lives until the platform session ends (web: tab close).
// Storage errors are swallowed inside the adapter implementations.
export function isUnlocked(): boolean {
  return ephemeralStorage.get(UNLOCK_KEY) === '1'
}

export function lock(): void {
  ephemeralStorage.remove(UNLOCK_KEY)
}

// Маскируем только когда PIN задан: при сброшенном PIN записи видимы,
// а не заперты навсегда без способа открыть.
export function isMasked(isPrivate: boolean, pinSet: boolean): boolean {
  return isPrivate && pinSet && !isUnlocked()
}

export function maskConcernLabel(name: string, isPrivate: boolean, pinSet: boolean): string {
  return isMasked(isPrivate, pinSet) ? MASKED_CONCERN_LABEL : name
}

export async function loadPinHash(userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('privacy_pin_hash').eq('id', userId).maybeSingle()
  return (data?.privacy_pin_hash as string | null) ?? null
}

export async function unlock(userId: string, pin: string): Promise<boolean> {
  const stored = await loadPinHash(userId)
  if (!stored) return false
  const ok = stored === await hashPin(pin)
  if (ok) ephemeralStorage.set(UNLOCK_KEY, '1')
  return ok
}

// Смена существующего PIN требует текущий
export async function setPin(userId: string, newPin: string, currentPin?: string): Promise<'ok' | 'wrong_current'> {
  const stored = await loadPinHash(userId)
  if (stored && stored !== await hashPin(currentPin ?? '')) return 'wrong_current'
  await supabase.from('profiles').upsert({ id: userId, privacy_pin_hash: await hashPin(newPin) })
  ephemeralStorage.set(UNLOCK_KEY, '1')
  return 'ok'
}
