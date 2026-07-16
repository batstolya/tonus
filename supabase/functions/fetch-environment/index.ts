import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isValidCronSecret } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Свой секрет для cron-джобы (ENV_CRON_SECRET) с фолбэком на общий
const CRON_SECRET = Deno.env.get('ENV_CRON_SECRET') ?? Deno.env.get('TONUS_CRON_SECRET') ?? ''
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret, x-request-id' }

// Default location: Munich, Germany
const DEFAULT_LAT = 48.1351
const DEFAULT_LON = 11.5820

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ── CRON path: секрет в заголовке → синк всех пользователей с профилем ──
    if (isValidCronSecret(req, CRON_SECRET)) {
      const { data: profiles } = await supabase.from('profiles').select('id, latitude, longitude')
      const results: { user: string; synced?: number; error?: string }[] = []
      for (const p of profiles ?? []) {
        try {
          const synced = await syncUser(supabase, p.id,
            typeof p.latitude === 'number' ? p.latitude : DEFAULT_LAT,
            typeof p.longitude === 'number' ? p.longitude : DEFAULT_LON)
          results.push({ user: p.id, synced })
        } catch (e) {
          results.push({ user: p.id, error: (e as Error).message })
        }
      }
      return new Response(JSON.stringify({ ran: results.length, results }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // ── UI path: user JWT ──
    const authHeader = req.headers.get('Authorization') ?? ''
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    // Координаты из профиля пользователя; если не заданы — фолбэк на Мюнхен
    let lat = DEFAULT_LAT
    let lon = DEFAULT_LON
    const { data: profile } = await supabase
      .from('profiles')
      .select('latitude, longitude')
      .eq('id', user.id)
      .maybeSingle()
    if (profile && typeof profile.latitude === 'number' && typeof profile.longitude === 'number') {
      lat = profile.latitude
      lon = profile.longitude
    }

    const synced = await syncUser(supabase, user.id, lat, lon)
    return new Response(JSON.stringify({ synced }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})

// Синк среды одного пользователя: погода+AQI+пыльца+Kp за 30 дней → environment_daily
async function syncUser(supabase: SupabaseClient, userId: string, lat: number, lon: number): Promise<number> {
  {
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

    // ── Air Quality + pollen (best-effort: сбой не ломает синк погоды) ──
    const airByDate: Record<string, { aqiSum: number; aqiN: number; polSum: number; polN: number }> = {}
    try {
      const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        `&hourly=european_aqi,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen,olive_pollen` +
        `&start_date=${start}&end_date=${end}&timezone=auto`
      const aqRes = await fetch(aqUrl)
      if (aqRes.ok) {
        const aq = await aqRes.json()
        const times: string[] = aq.hourly?.time ?? []
        const aqi: (number | null)[] = aq.hourly?.european_aqi ?? []
        const pollenKeys = ['alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'ragweed_pollen', 'olive_pollen']
        const pollenSeries: (number | null)[][] = pollenKeys.map((k) => aq.hourly?.[k] ?? [])
        for (let i = 0; i < times.length; i++) {
          const d = times[i].slice(0, 10)
          const bucket = (airByDate[d] ??= { aqiSum: 0, aqiN: 0, polSum: 0, polN: 0 })
          if (typeof aqi[i] === 'number') { bucket.aqiSum += aqi[i] as number; bucket.aqiN++ }
          let hourPollen = 0, hasPollen = false
          for (const series of pollenSeries) {
            const v = series[i]
            if (typeof v === 'number') { hourPollen += v; hasPollen = true }
          }
          if (hasPollen) { bucket.polSum += hourPollen; bucket.polN++ }
        }
      }
    } catch (_e) {
      // воздух недоступен — продолжаем без него
    }
    const dailyAqi = (d: string): number | null => {
      const b = airByDate[d]
      return b && b.aqiN ? Math.round(b.aqiSum / b.aqiN) : null
    }
    const dailyPollen = (d: string): number | null => {
      const b = airByDate[d]
      return b && b.polN ? Math.round((b.polSum / b.polN) * 10) / 10 : null
    }

    // ── Kp-индекс, магнитные бури (best-effort: сбой GFZ не ломает синк) ──
    // Глобальный индекс, координаты не нужны. За день берём максимум по
    // 3-часовым слотам — буря определяется пиком (Kp >= 5).
    const kpByDate: Record<string, number> = {}
    try {
      const kpRes = await fetch(`https://kp.gfz.de/app/json/?start=${start}T00:00:00Z&end=${end}T23:59:59Z&index=Kp`)
      if (kpRes.ok) {
        const kp = await kpRes.json()
        const times: string[] = kp.datetime ?? []
        const vals: (number | null)[] = kp.Kp ?? []
        for (let i = 0; i < times.length; i++) {
          const d = times[i].slice(0, 10)
          const v = vals[i]
          if (typeof v === 'number' && (kpByDate[d] == null || v > kpByDate[d])) kpByDate[d] = v
        }
      }
    } catch (_e) {
      // GFZ недоступен — продолжаем без Kp
    }

    const rows = dates.map((date, i) => ({
      user_id: userId,
      date,
      temp_c: temps[i] ?? null,
      pressure_hpa: pressures[i] ?? null,
      daylight_minutes: daylights[i] != null ? Math.round(daylights[i] / 60) : null,
      precipitation_mm: precips[i] ?? null,
      air_quality: dailyAqi(date),
      pollen: dailyPollen(date),
      kp_index: kpByDate[date] ?? null,
    }))

    const { error } = await supabase.from('environment_daily').upsert(rows, { onConflict: 'user_id,date' })
    if (error) throw new Error(error.message)

    return rows.length
  }
}
