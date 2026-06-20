import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

// Default location: Munich, Germany
const DEFAULT_LAT = 48.1351
const DEFAULT_LON = 11.5820

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    // Use Munich defaults (profiles table may not have lat/lon columns)
    const lat = DEFAULT_LAT
    const lon = DEFAULT_LON

    // Fetch last 30 days from Open-Meteo (free, no key)
    const end = new Date().toISOString().slice(0, 10)
    const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_mean,surface_pressure_mean,precipitation_sum,daylight_duration&start_date=${start}&end_date=${end}&timezone=auto`

    const res = await fetch(url)
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
    const data = await res.json()

    const dates: string[] = data.daily?.time ?? []
    const temps: number[] = data.daily?.temperature_2m_mean ?? []
    const pressures: number[] = data.daily?.surface_pressure_mean ?? []
    const precips: number[] = data.daily?.precipitation_sum ?? []
    const daylights: number[] = data.daily?.daylight_duration ?? [] // seconds

    const rows = dates.map((date, i) => ({
      user_id: user.id,
      date,
      temp_c: temps[i] ?? null,
      pressure_hpa: pressures[i] ?? null,
      daylight_minutes: daylights[i] != null ? Math.round(daylights[i] / 60) : null,
      precipitation_mm: precips[i] ?? null,
    }))

    const { error } = await supabase.from('environment_daily').upsert(rows, { onConflict: 'user_id,date' })
    if (error) throw new Error(error.message)

    return new Response(JSON.stringify({ synced: rows.length }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
