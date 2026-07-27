import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { loadTodayData, type TodayData } from '@tonus/shared'
import { getSupabase } from './supabase'

export interface TodayState {
  data: TodayData | null
  loading: boolean
  refreshing: boolean
  error: string | null
  refresh: () => void
}

/**
 * Загружает данные экрана и обновляет их при возвращении в приложение.
 *
 * Обновление на переднем плане — это ещё и ПЕРВЫЙ запрос приложения с
 * авторизацией. До него обвязка autoRefreshToken из фазы 2b была непроверяемой:
 * приложению было некуда ходить, и протухший токен ничем себя не выдавал.
 */
export function useTodayData(userId: string | undefined): TodayState {
  const [data, setData] = useState<TodayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (!userId) return
    if (mode === 'refresh') setRefreshing(true)
    setError(null)
    try {
      setData(await loadTodayData(getSupabase(), userId, new Date()))
    } catch (e) {
      // Сеть отвалилась или запрос упал: показываем последние загруженные
      // цифры с пометкой, а не пустой экран — но молчать нельзя.
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [userId])

  useEffect(() => {
    // Через таймер: синхронный setState внутри эффекта — каскадные
    // перерисовки, правило react-hooks ловит это справедливо.
    const id = setTimeout(() => { void load('initial') }, 0)
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void load('refresh')
    })
    return () => { clearTimeout(id); sub.remove() }
  }, [load])

  return {
    data,
    loading,
    refreshing,
    error,
    refresh: () => { void load('refresh') },
  }
}
