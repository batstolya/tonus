import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isDemoActive } from '../lib/demo'

// Демо-режим: фейковый пользователь без Supabase (см. lib/demo.ts).
function demoUser(): User | null {
  return isDemoActive()
    ? ({ id: '00000000-0000-0000-0000-000000000000', email: 'demo@tonus.app' } as User)
    : null
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(demoUser)
  const [loading, setLoading] = useState(() => !isDemoActive())
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    if (isDemoActive()) return
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, loading, passwordRecovery, setPasswordRecovery }
}
