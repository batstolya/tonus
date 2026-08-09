import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { computeDailyScores } from '../_shared/scores.ts'
import { detectAnomaly, shouldSendAlert, buildAlertMessage, type AnomalyDay } from '../_shared/anomaly.ts'
import { withObservability } from '../_shared/observability.ts'
import { consumeRateLimit, hashRateLimitSubject, rateLimitedResponse } from '../_shared/rateLimit.ts'
import { sendTelegram } from '../_shared/telegram.ts'
import { processHealthPayload } from './normalize.ts'

// Приём данных Apple Health от Health Auto Export (SPEC-AUTOSYNC).
// Изолировано: пишет в *_staging; в боевые таблицы — только при mode='live'.
// Серверный дедуп повторяет правила браузерного воркера (паритет).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-request-id' }

// Разбор payload'а и дедуп живут в _shared/hae.ts — их же импортирует скрипт
// сверки источников (scripts/diff-ingest-sources.ts). Правишь правила там.

const handler = async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token') ?? req.headers.get('x-ingest-token') ?? ''
    if (!token) return new Response('Missing token', { status: 401, headers: CORS })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Durable per-token limit (PR 3); keyed by hash so raw tokens never leave the request.
    const rateSubject = await hashRateLimitSubject(token)
    if (!await consumeRateLimit(supabase, { bucket: `ingest:${rateSubject}`, limit: 120, windowSeconds: 3600 })) {
      return rateLimitedResponse(CORS)
    }

    const { data: tok } = await supabase.from('ingest_tokens').select('user_id, mode').eq('token', token).maybeSingle()
    if (!tok) return new Response('Invalid token', { status: 401, headers: CORS })
    const userId = tok.user_id

    const payload: unknown = await req.json().catch(() => null)
    if (!payload) return new Response('Bad JSON', { status: 400, headers: CORS })

    // Store original JSON, normalize supported formats, then write parsed rows.
    const { metrics, sleep, mErr, sErr, promoted } = await processHealthPayload(userId, payload, tok.mode, {
      storeRaw: async value => {
        await supabase.from('ingest_raw').insert({ user_id: userId, payload: value })
      },
      loadTimezone: async () => {
        const { data: profile } = await supabase.from('profiles').select('timezone').eq('id', userId).maybeSingle()
        return profile?.timezone
      },
      writeMetricsStaging: async rows => {
        const { error } = await supabase.from('metrics_daily_staging').upsert(rows, { onConflict: 'user_id,date,metric' })
        return error?.message ?? null
      },
      writeSleepStaging: async rows => {
        const { error } = await supabase.from('sleep_sessions_staging').upsert(rows, { onConflict: 'user_id,date' })
        return error?.message ?? null
      },
      writeMetricsLive: async rows => {
        const { error } = await supabase.from('metrics_daily').upsert(rows, { onConflict: 'user_id,date,metric' })
        return !error
      },
      writeSleepLive: async rows => {
        const { error } = await supabase.from('sleep_sessions').upsert(rows, { onConflict: 'user_id,date' })
        return !error
      },
      writeHeartRateSamples: async rows => {
        await supabase.from('heart_rate_samples').upsert(rows, { onConflict: 'user_id,ts' })
      },
    })

    // 3) промоут в боевые таблицы ТОЛЬКО при mode='live'
    if (tok.mode === 'live') {
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
                await sendTelegram(tgToken, link.telegram_chat_id, message, { payload: { parse_mode: 'HTML' } })
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
