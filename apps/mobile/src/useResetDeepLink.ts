import { useEffect, useState } from 'react'
import * as Linking from 'expo-linking'
import { parseRecoveryLink } from '@tonus/shared'
import { getSupabase } from './supabase'

export interface RecoveryLinkState {
  /** Текст ошибки, если ссылка не сработала; null, пока всё в порядке. */
  error: string | null
  clearError: () => void
}

/**
 * Обрабатывает ссылку восстановления и — что важнее — сообщает, когда она не
 * сработала. Молчание здесь выглядит как поломка: человек тапает по письму,
 * приложение открывается, и ничего не происходит.
 *
 * Разбор фрагмента живёт в @tonus/shared под тестами: форм у него две
 * (токены либо описание ошибки), и первая версия знала только про токены —
 * то есть на настоящей просроченной ссылке молчала. Проверено вживую.
 */
export function useResetDeepLink(): RecoveryLinkState {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handle(url: string | null) {
      const link = parseRecoveryLink(url)
      if (link.kind === 'unrelated') return
      if (link.kind === 'error') {
        console.warn(`[recovery link] ${link.message}`)
        setError(link.message)
        return
      }
      const { error: sessionError } = await getSupabase().auth.setSession({
        access_token: link.accessToken,
        refresh_token: link.refreshToken,
      })
      if (sessionError) {
        console.warn(`[recovery link] setSession failed: ${sessionError.message}`)
        setError('Не удалось открыть ссылку для сброса пароля. Запросите новую.')
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
