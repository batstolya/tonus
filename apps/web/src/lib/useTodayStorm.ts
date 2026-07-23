import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { isDemoActive } from './demo'
import { stormTier, type StormTier } from './geoStorm'

// Сегодняшний Kp пользователя (environment_daily, RLS отдаёт свою строку;
// в демо — фикстура). Один общий источник для баннера и бейджа в топбаре.
export function useTodayStorm(): { kp: number | null; tier: StormTier | null } {
  const [kp, setKp] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    if (isDemoActive()) {
      import('./demoFixture').then(m => {
        if (cancelled) return
        const env = m.makeDemoEnvironment()
        const row = env.find(e => e.date === todayStr) ?? env[env.length - 1]
        setKp(row?.kp_index ?? null)
      })
      return () => { cancelled = true }
    }
    supabase.from('environment_daily').select('kp_index').eq('date', todayStr).maybeSingle()
      .then(({ data }: { data: { kp_index: number | null } | null }) => {
        if (!cancelled) setKp(data?.kp_index ?? null)
      })
    return () => { cancelled = true }
  }, [])
  return { kp, tier: stormTier(kp) }
}
