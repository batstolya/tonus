import { AppState } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { createTonusClient, getEnv } from '@tonus/shared'

// The session token is the only credential the app holds, so it goes to the
// iOS Keychain — not into MMKV next to the language preference. SecureStore is
// async, which supabase-js accepts for auth storage.
const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

// Created lazily on first use rather than at module load. Metro does not
// reorder modules the way Rollup hoists chunks, and bootstrap.ts runs first,
// so this is belt-and-braces — but the web app already paid for that lesson
// once (an eager getEnv() blanked production in Phase 0a).
let client: ReturnType<typeof createTonusClient> | null = null

export function getSupabase(): ReturnType<typeof createTonusClient> {
  if (!client) {
    const { supabaseUrl, supabaseAnonKey } = getEnv()
    client = createTonusClient({
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      options: {
        auth: {
          storage: secureStorage,
          persistSession: true,
          autoRefreshToken: true,
          // There is no URL fragment to read tokens from on a phone; the deep
          // link handler feeds recovery tokens to setSession() instead.
          detectSessionInUrl: false,
        },
      },
    })
  }
  return client
}

/**
 * supabase-js's refresh timer does not survive iOS backgrounding: left alone,
 * the token silently goes stale and the first request after a long background
 * fails with a 401 that looks unrelated. Tie the timer to AppState instead.
 * Returns an unsubscribe function.
 */
export function startSessionRefreshLifecycle(): () => void {
  const supabase = getSupabase()
  const sync = (state: string) => {
    if (state === 'active') void supabase.auth.startAutoRefresh()
    else void supabase.auth.stopAutoRefresh()
  }
  const sub = AppState.addEventListener('change', sync)
  sync(AppState.currentState)
  return () => { sub.remove() }
}
