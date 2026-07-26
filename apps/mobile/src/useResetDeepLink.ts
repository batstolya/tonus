import { useEffect, useState } from 'react'
import * as Linking from 'expo-linking'
import { getSupabase } from './supabase'

// Supabase кладёт токены восстановления во фрагмент URL
// (tonus://reset#access_token=…). detectSessionInUrl на RN выключен, поэтому
// приложение достаёт их само и передаёт в setSession(), а тот уже поднимает
// событие PASSWORD_RECOVERY через useAuth.
export function recoveryTokensFrom(url: string): { access_token: string; refresh_token: string } | null {
  const fragment = url.split('#')[1]
  if (!fragment) return null
  const params = new URLSearchParams(fragment)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  return access_token && refresh_token ? { access_token, refresh_token } : null
}

const EXPIRED = 'Ссылка для сброса пароля устарела или уже использована. Запросите новую.'

export interface RecoveryLinkState {
  /** Текст ошибки, если ссылка не сработала; null, пока всё в порядке. */
  error: string | null
  clearError: () => void
}

/**
 * Обрабатывает ссылку восстановления и — что важнее — сообщает, когда она не
 * сработала. Раньше ошибка setSession глоталась молча: человек тапал по письму,
 * приложение открывалось, и ничего не происходило. Ссылки живут ограниченное
 * время, так что открыть просроченную — обычное дело, а не край сценария
 * (найдено ручной проверкой на симуляторе).
 */
export function useResetDeepLink(): RecoveryLinkState {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handle(url: string | null) {
      const tokens = url ? recoveryTokensFrom(url) : null
      if (!tokens) return
      const { error: sessionError } = await getSupabase().auth.setSession(tokens)
      if (sessionError) {
        console.warn(`[recovery link] setSession failed: ${sessionError.message}`)
        setError(EXPIRED)
      }
    }
    // Холодный старт: приложение запустила ссылка из письма.
    void Linking.getInitialURL().then(handle)
    // Тёплый старт: приложение уже было открыто.
    const sub = Linking.addEventListener('url', event => { void handle(event.url) })
    return () => { sub.remove() }
  }, [])

  return { error, clearError: () => { setError(null) } }
}
