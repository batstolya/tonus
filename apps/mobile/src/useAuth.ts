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

    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
    })

    return () => {
      subscription.unsubscribe()
      stopRefresh()
    }
  }, [])

  return { user, loading, passwordRecovery, setPasswordRecovery }
}
