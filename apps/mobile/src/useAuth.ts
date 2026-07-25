import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isDemoActive } from '@tonus/shared'
import { getSupabase, startSessionRefreshLifecycle } from './supabase'

// Demo mode short-circuits Supabase entirely, same as on the web.
const DEMO_USER = { id: '00000000-0000-0000-0000-000000000000', email: 'demo@tonus.app' } as User

export interface AuthState {
  user: User | null
  loading: boolean
  passwordRecovery: boolean
  setPasswordRecovery: (value: boolean) => void
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(() => (isDemoActive() ? DEMO_USER : null))
  const [loading, setLoading] = useState(() => !isDemoActive())
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    if (isDemoActive()) return
    const supabase = getSupabase()
    const stopRefresh = startSessionRefreshLifecycle()

    // Loading resolves from the subscription, not from getSession(): supabase-js
    // emits INITIAL_SESSION once it has read storage, and driving the flag from
    // a getSession().then() left the app spinning forever whenever that read
    // hung or rejected (no network, keychain unavailable) — caught by the CI
    // simulator screenshot, which showed the spinner and nothing else.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
    })

    // Belt to the subscription's braces: if initialisation fails outright, the
    // app must fall through to the auth screen rather than sit on a spinner.
    void supabase.auth.getSession()
      .then(({ data }) => {
        setUser(data.session?.user ?? null)
        setLoading(false)
      })
      .catch(() => { setLoading(false) })

    return () => {
      subscription.unsubscribe()
      stopRefresh()
    }
  }, [])

  return { user, loading, passwordRecovery, setPasswordRecovery }
}
