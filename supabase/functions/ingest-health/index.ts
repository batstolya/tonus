import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { computeDailyScores } from '../_shared/scores.ts'
import { detectAnomaly, shouldSendAlert, buildAlertMessage, type AnomalyDay } from '../_shared/anomaly.ts'
import { withObservability } from '../_shared/observability.ts'

// Приём данных Apple Health от Health Auto Export (SPEC-AUTOSYNC).
// Изолировано: пишет в *_staging; в боевые таблицы — только при mode='live'.
// Серверный дедуп повторяет правила браузерного воркера (паритет).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

// Имена метрик HAE → наши ключи (camelCase, как в боевой metrics_daily)
const METRIC_MAP: Record<string, string> = {
  step_count: 'steps',
  distance_walking_running: 'distance',
  walking_running_distance: 'distance',
  active_energy: 'activeEnergy',
  apple_exercise_time: 'exerciseMinutes',
  flights_climbed: 'flightsClimbed',
  heart_rate: 'heartRate',
  resting_heart_rate: 'restingHeartRate',
  walking_heart_rate_average: 'walkingHeartRate',
  heart_rate_variability: 'hrv',
  blood_oxygen_saturation: 'oxygenSaturation',
  respiratory_rate: 'respiratoryRate',
  apple_sleeping_wrist_temperature: 'wristTemperature',
  vo2_max: 'vo2max',
}
// Метрики-суммы: дедуп = сумма внутри источника, максимум по источникам
const SUM_METRICS = new Set(['steps', 'distance', 'activeEnergy', 'exerciseMinutes', 'flightsClimbed'])
// HAE дистанцию даёт в км или метрах в зависимости от настроек — приведём к км если похоже на метры
// "2024-01-15 00:00:00 +0000" → "2024-01-15"; не-строки (мусор в payload) → ''
const dayOf = (s: unknown) => typeof s === 'string' ? s.slice(0, 10) : ''

interface MetricRow { user_id: string; date: string; metric: string; avg_val?: number | null; min_val?: number | null; max_val?: number | null; sum_val?: number | null }
interface SleepRow { user_id: string; date: string; duration_hours: number; deep_hours: number | null; rem_hours: number | null; core_hours: number | null; bedtime: string | null; wake_time: string | null }

// Структура HAE JSON — внешний формат, поля произвольны, значения проверяем в рантайме.
interface HaePoint {
  date?: unknown; source?: string
  qty?: unknown; value?: unknown
  Avg?: unknown; avg?: unknown; Min?: unknown; min?: unknown; Max?: unknown; max?: unknown
  totalSleep?: unknown; asleep?: unknown; total?: unknown; deep?: unknown; rem?: unknown; core?: unknown
  sleepStart?: unknown; sleepEnd?: unknown; startDate?: unknown
}
interface HaeMetric { name?: string; units?: unknown; data?: HaePoint[] }
interface HaePayload { data?: { metrics?: HaeMetric[] }; metrics?: HaeMetric[] }

function num(v: unknown): number | null { const n = Number(v); return isFinite(n) ? n : null }

// Разбор HAE JSON → строки для staging. Возвращает { metrics, sleep }.
function parseHAE(userId: string, payload: HaePayload): { metrics: MetricRow[]; sleep: SleepRow[] } {
  const metricsArr: HaeMetric[] = payload?.data?.metrics ?? payload?.metrics ?? []
  const metrics: MetricRow[] = []
  const sleep: SleepRow[] = []

  for (const m of metricsArr) {
    const name: string = m?.name ?? ''
    const points: HaePoint[] = m?.data ?? []
    if (!points.length) continue

    if (name === 'sleep_analysis') {
      // группируем по дню; берём запись с максимальной длительностью (основной сон)
      const byDay: Record<string, SleepRow> = {}
      for (const p of points) {
        const date = dayOf(p.date ?? p.sleepStart ?? p.startDate)
        if (!date) continue
        // HAE отдаёт фазы в часах: asleep/total, deep, rem, core; иногда в минутах
        let total = num(p.totalSleep ?? p.asleep ?? p.total ?? p.value)
        let deep = num(p.deep), rem = num(p.rem), core = num(p.core)
        // если значения выглядят как минуты (>16) — переведём в часы
        const toH = (x: number | null) => x == null ? null : (x > 16 ? x / 60 : x)
        total = toH(total); deep = toH(deep); rem = toH(rem); core = toH(core)
        if (total == null || total <= 0 || total > 16) continue // отбрасываем мусор
        const prev = byDay[date]
        if (!prev || total > prev.duration_hours) {
          byDay[date] = {
            user_id: userId, date, duration_hours: total,
            deep_hours: deep, rem_hours: rem, core_hours: core,
            // полные дата-время (боевая колонка — timestamptz); HH:MM не подходит
            bedtime: p.sleepStart ? String(p.sleepStart) : null,
            wake_time: p.sleepEnd ? String(p.sleepEnd) : null,
          }
        }
      }
      sleep.push(...Object.values(byDay))
      continue
    }

    const key = METRIC_MAP[name]
    if (!key) continue

    if (SUM_METRICS.has(key)) {
      // сумма-внутри-источника → максимум-по-источникам (iPhone+Watch не задваиваем)
      const perDay: Record<string, Record<string, number>> = {}
      for (const p of points) {
        const date = dayOf(p.date)
        const q = num(p.qty ?? p.value)
        if (!date || q == null) continue
        const src = p.source ?? 'unknown'
        ;(perDay[date] ??= {})[src] = (perDay[date][src] ?? 0) + q
      }
      const units = String(m?.units ?? '').toLowerCase()
      for (const [date, bySrc] of Object.entries(perDay)) {
        let v = Math.max(...Object.values(bySrc))
        if (key === 'distance' && v > 100) v = v / 1000 // метры → км
        // активная энергия: HAE отдаёт в кДж, у нас в ккал
        if (key === 'activeEnergy' && (units.includes('kj') || units.includes('кдж'))) v = v / 4.184
        // целочисленные метрики округляем (HAE может слать дроби при агрегации)
        if (key === 'steps' || key === 'flightsClimbed' || key === 'exerciseMinutes') v = Math.round(v)
        metrics.push({ user_id: userId, date, metric: key, sum_val: v })
      }
    } else {
      // усреднённые метрики: один день — берём avg/min/max
      const perDay: Record<string, { sum: number; n: number; min: number; max: number }> = {}
      for (const p of points) {
        const date = dayOf(p.date)
        const avg = num(p.Avg ?? p.avg ?? p.qty ?? p.value)
        if (!date || avg == null) continue
        const mn = num(p.Min ?? p.min) ?? avg
        const mx = num(p.Max ?? p.max) ?? avg
        const cur = perDay[date] ??= { sum: 0, n: 0, min: mn, max: mx }
        cur.sum += avg; cur.n += 1; cur.min = Math.min(cur.min, mn); cur.max = Math.max(cur.max, mx)
      }
      for (const [date, a] of Object.entries(perDay)) {
        let avg = a.sum / a.n, mn = a.min, mx = a.max
        if (key === 'oxygenSaturation') { // храним как долю (×100 при показе)
          const norm = (x: number) => x > 1.5 ? x / 100 : x
          avg = norm(avg); mn = norm(mn); mx = norm(mx)
        }
        metrics.push({ user_id: userId, date, metric: key, avg_val: avg, min_val: mn, max_val: mx })
      }
    }
  }
  return { metrics, sleep }
}

// Сырые посекундные замеры пульса для карты стресса (heart_rate_samples).
// Дедуп по ts (Apple пишет несколько в секунду). Только если пришли сэмплы.
function parseHRSamples(userId: string, payload: HaePayload): { user_id: string; ts: string; bpm: number; source: string }[] {
  const metricsArr: HaeMetric[] = payload?.data?.metrics ?? payload?.metrics ?? []
  const hr = metricsArr.find(m => m?.name === 'heart_rate')
  if (!hr || !Array.isArray(hr.data)) return []
  const byTs = new Map<string, { user_id: string; ts: string; bpm: number; source: string }>()
  for (const p of hr.data) {
    const bpm = num(p.Avg ?? p.avg ?? p.qty ?? p.value)
    if (bpm == null || !p.date) continue
    const ts = new Date(String(p.date)).toISOString()
    byTs.set(ts, { user_id: userId, ts, bpm: Math.round(bpm), source: p.source ?? 'Apple' })
  }
  return [...byTs.values()]
}

const handler = async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token') ?? req.headers.get('x-ingest-token') ?? ''
    if (!token) return new Response('Missing token', { status: 401, headers: CORS })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: tok } = await supabase.from('ingest_tokens').select('user_id, mode').eq('token', token).maybeSingle()
    if (!tok) return new Response('Invalid token', { status: 401, headers: CORS })
    const userId = tok.user_id

    const payload: HaePayload | null = await req.json().catch(() => null)
    if (!payload) return new Response('Bad JSON', { status: 400, headers: CORS })

    // 1) всегда сохраняем сырой JSON
    await supabase.from('ingest_raw').insert({ user_id: userId, payload })

    // 2) разбор → staging
    const { metrics, sleep } = parseHAE(userId, payload)
    let mErr: string | null = null, sErr: string | null = null
    if (metrics.length) {
      const { error } = await supabase.from('metrics_daily_staging').upsert(
        metrics.map(r => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'user_id,date,metric' })
      mErr = error?.message ?? null
    }
    if (sleep.length) {
      const { error } = await supabase.from('sleep_sessions_staging').upsert(
        sleep.map(r => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'user_id,date' })
      sErr = error?.message ?? null
    }

    // 3) промоут в боевые таблицы ТОЛЬКО при mode='live'
    let promoted = 0
    if (tok.mode === 'live') {
      if (metrics.length) {
        const { error } = await supabase.from('metrics_daily').upsert(
          metrics.map(r => ({ ...r })), { onConflict: 'user_id,date,metric' })
        if (!error) promoted += metrics.length
      }
      if (sleep.length) {
        const { error } = await supabase.from('sleep_sessions').upsert(
          sleep.map(r => ({ ...r })), { onConflict: 'user_id,date' })
        if (!error) promoted += sleep.length
      }
      // сырой пульс для карты стресса (если HAE прислал сэмплы, а не дневной агрегат)
      const hrSamples = parseHRSamples(userId, payload)
      for (let i = 0; i < hrSamples.length; i += 500) {
        await supabase.from('heart_rate_samples').upsert(hrSamples.slice(i, i + 500), { onConflict: 'user_id,ts' })
      }

      // Пересчёт дневных оценок (readiness/recovery/stress/baseline) из автосинка,
      // чтобы они не отставали, когда веб-приложение не открывают. Best-effort —
      // ошибка здесь не должна валить приём данных. Зеркало src/lib/scores.ts.
      try {
        const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
        const { data: dm } = await supabase
          .from('daily_metrics')
          .select('date, hrv, resting_heart_rate, sleep_hours, steps')
          .eq('user_id', userId).gte('date', since).order('date')
        if (dm?.length) {
          const dmRows: { date: string; hrv: number | null; resting_heart_rate: number | null; sleep_hours: number | null; steps: number | null }[] = dm
          const scores = computeDailyScores(dmRows.map(r => ({
            date: r.date, hrv: r.hrv, restingHeartRate: r.resting_heart_rate,
            sleepHours: r.sleep_hours, steps: r.steps,
          }))).slice(-90).map(s => ({ ...s, user_id: userId, updated_at: new Date().toISOString() }))
          if (scores.length) await supabase.from('daily_scores').upsert(scores, { onConflict: 'user_id,date' })
        }
      } catch (_) { /* оценки не критичны для приёма данных */ }

      // Страж здоровья (F1, smart-tonus): z-score свежего дня против личной
      // нормы → health_alerts + Telegram. Best-effort: ошибка детектора
      // не должна валить приём данных.
      try {
        const since35 = new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10)
        const { data: am } = await supabase
          .from('metrics_daily')
          .select('date, metric, avg_val')
          .eq('user_id', userId).gte('date', since35)
          .in('metric', ['restingHeartRate', 'wristTemperature', 'hrv', 'respiratoryRate', 'oxygenSaturation'])
        if (am?.length) {
          const KEY: Record<string, keyof Omit<AnomalyDay, 'date'>> = {
            restingHeartRate: 'rhr', wristTemperature: 'wristTemp', hrv: 'hrv',
            respiratoryRate: 'respiratoryRate', oxygenSaturation: 'spo2',
          }
          const byDate: Record<string, AnomalyDay> = {}
          for (const r of am) {
            const d = byDate[r.date] ??= { date: r.date, rhr: null, wristTemp: null, hrv: null, respiratoryRate: null, spo2: null }
            const k = KEY[r.metric]
            if (k && r.avg_val != null) d[k] = Number(r.avg_val)
          }
          const result = detectAnomaly(Object.values(byDate))
          if (result) {
            const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString()
            const { data: recent } = await supabase
              .from('health_alerts').select('level, created_at')
              .eq('user_id', userId).eq('type', 'anomaly').gte('created_at', dayAgo)
            const recentAnomaly = (recent ?? []).filter(
              (a: { level: 'yellow' | 'red' | null; created_at: string }): a is { level: 'yellow' | 'red'; created_at: string } => a.level != null,
            )
            if (shouldSendAlert(recentAnomaly, result.level)) {
              const targetDate = Object.keys(byDate).sort().pop()!
              const message = buildAlertMessage(result)
              await supabase.from('health_alerts').insert({
                user_id: userId, type: 'anomaly', date: targetDate, level: result.level,
                findings: result.findings, message,
              })
              const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
              const { data: link } = await supabase
                .from('telegram_links').select('telegram_chat_id')
                .eq('user_id', userId).maybeSingle()
              if (tgToken && link?.telegram_chat_id) {
                await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: link.telegram_chat_id, text: message, parse_mode: 'HTML' }),
                })
              }
            }
          }
        }
      } catch { /* страж не критичен для приёма данных */ }
    }

    const status = `metrics:${metrics.length} sleep:${sleep.length} mode:${tok.mode}${mErr ? ` mErr:${mErr}` : ''}${sErr ? ` sErr:${sErr}` : ''}`
    await supabase.from('ingest_tokens').update({ last_ingest_at: new Date().toISOString(), last_status: status }).eq('user_id', userId)

    return new Response(JSON.stringify({ ok: true, metrics: metrics.length, sleep: sleep.length, mode: tok.mode, promoted }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'Error' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
}

serve(withObservability('edge.ingest_health', handler))
