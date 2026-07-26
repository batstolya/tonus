import { useEffect } from 'react'
import * as Linking from 'expo-linking'
import { getSupabase } from './supabase'

// Supabase puts the recovery tokens in the URL fragment (tonus://reset#access_token=…).
// detectSessionInUrl is off on RN, so the app extracts them itself and hands
// them to setSession(), which then emits PASSWORD_RECOVERY through useAuth.
export function recoveryTokensFrom(url: string): { access_token: string; refresh_token: string } | null {
  const fragment = url.split('#')[1]
  if (!fragment) return null
  const params = new URLSearchParams(fragment)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  return access_token && refresh_token ? { access_token, refresh_token } : null
}

export function useResetDeepLink(): void {
  useEffect(() => {
    function handle(url: string | null) {
      const tokens = url ? recoveryTokensFrom(url) : null
      if (tokens) void getSupabase().auth.setSession(tokens)
    }
    // Cold start: the email link launched the app.
    void Linking.getInitialURL().then(handle)
    // Warm start: the app was already running.
    const sub = Linking.addEventListener('url', event => { handle(event.url) })
    return () => { sub.remove() }
  }, [])
}
