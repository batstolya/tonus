import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'
import { isValidInternalSecret } from '../_shared/auth.ts'
import { aiConsentRequiredResponse, fetchGeminiWithConsent, isAiConsentRequired } from '../_shared/aiConsent.ts'
import { corsHeadersFor } from '../_shared/cors.ts'
import { langNominative } from '../_shared/replyLang.ts'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INTERNAL_SECRET = Deno.env.get('TONUS_INTERNAL_SECRET') ?? ''
const ALLOWED_ORIGINS = Deno.env.get('TONUS_ALLOWED_ORIGINS') ?? ''

// target_metric ОБЯЗАН быть одним из этих ключей — ровно те, что понимает фронт
// (METRIC_OPTIONS в ExperimentsScreen.tsx). Невалидные отсеиваем и на клиенте, и здесь.
const ALLOWED: Record<string, string> = {
  hrv: 'HRV — вариабельность пульса, мс (выше лучше)',
  restingHeartRate: 'Пульс покоя, уд/мин (ниже лучше)',
  sleepHours: 'Длительность сна, ч (выше лучше)',
  sleepDeep: 'Глубокий сон, ч (выше лучше)',
  sleepREM: 'REM сон, ч (выше лучше)',
  steps: 'Шаги (выше лучше)',
  activeEnergy: 'Активные калории, ккал (выше лучше)',
  oxygenSaturation: 'SpO₂, % (выше лучше)',
  heartRate: 'ЧСС средняя, уд/мин (ниже лучше)',
}

function avg(vals: number[]): number | null {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

// Локальные типы строк с реально используемыми колонками.
interface MetricsRow {
  date: string
  resting_heart_rate: number | null
  hrv: number | null
  sleep_hours: number | null
  steps: number | null
}
interface SleepRow { date: string; bedtime: string | null; wake_time: string | null; deep_hours: number | null; rem_hours: number | null }
interface EventRow { ts: string; type: string }
interface EnvRow { date: string; temp_c: number | null; daylight_minutes: number | null; air_quality: number | null; pollen: number | null }

// .filter(Boolean) не сужает (number | null)[] → number[]; нужен type guard.
const nums = (vals: (number | null | undefined)[]): number[] =>
  vals.filter((v): v is number => v != null)

interface Suggestion {
  hypothesis: string
  change_rule: string
  target_metric: string
  rationale: string
}

serve(async (req) => {
  const CORS = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    // Internal call from telegram-bot with x-user-id + x-internal-secret (biweekly-report pattern)
    const serviceUserId = req.headers.get('x-user-id')
    let user: { id: string } | null = null
    if (serviceUserId && isValidInternalSecret(req, INTERNAL_SECRET)) {
      const { data } = await supabase.auth.admin.getUserById(serviceUserId)
      user = data.user
    } else {
      const { data, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      if (error || !data.user) return new Response('Unauthorized', { status: 401, headers: CORS })
      user = data.user
    }
    if (!user) return new Response('Unauthorized', { status: 401, headers: CORS })

    // AI Cost Guard
    const budget = await checkBudget(supabase, user.id)
    if (!budget.ok) return new Response(JSON.stringify({ error: 'budget_exceeded', message: budgetExceededMessage(budget) }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } })

    const body: { mode?: unknown; idea?: unknown; lang?: unknown } = await req.json().catch(() => ({}))
    const lang = body.lang
    const mode: 'generate' | 'refine' = body.mode === 'refine' ? 'refine' : 'generate'
    const idea = String(body.idea ?? '').slice(0, 300)

    const metricList = Object.entries(ALLOWED).map(([k, v]) => `- "${k}" — ${v}`).join('\n')

    let prompt: string

    if (mode === 'refine') {
      if (idea.trim().length < 2) {
        return new Response(JSON.stringify({ error: 'Опиши идею в нескольких словах.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }
      prompt = `Пользователь хочет проверить на себе гипотезу про здоровье и описал идею своими словами: "${idea}".
Преврати это в один аккуратный эксперимент-самонаблюдение.

Доступные метрики (target_metric ДОЛЖЕН быть ровно одним из этих ключей):
${metricList}

Ответь СТРОГО JSON-массивом из ОДНОГО объекта, без markdown и пояснений:
[{ "hypothesis": "...", "change_rule": "...", "target_metric": "ключ", "rationale": "..." }]

Правила:
- hypothesis — короткая проверяемая формулировка ожидаемого эффекта, 1 предложение.
- change_rule — конкретное ежедневное действие, которое человек меняет.
- target_metric — ровно один ключ из списка, самый подходящий к идее.
- rationale — 1 предложение: почему это разумно проверить.
- Реалистичное, безопасное изменение. Тон поддерживающий. Язык — ${langNominative(lang)}.`
    } else {
      // generate из данных за 30 дней — метрики + ПОВЕДЕНИЕ + среда + тайминг сна
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
      const since = cutoff.toISOString().slice(0, 10)

      const [metricsRes, sleepsRes, eventsRes, envRes, noteRes] = await Promise.all([
        supabase.from('daily_metrics').select('*').eq('user_id', user.id).gte('date', since).order('date'),
        supabase.from('sleep_sessions').select('date, bedtime, wake_time, deep_hours, rem_hours').eq('user_id', user.id).gte('date', since),
        supabase.from('intake_events').select('ts, type').eq('user_id', user.id).gte('ts', `${since}T00:00:00Z`),
        supabase.from('environment_daily').select('date, temp_c, daylight_minutes, air_quality, pollen').eq('user_id', user.id).gte('date', since),
        supabase.from('daily_note_settings').select('timezone').eq('user_id', user.id).maybeSingle(),
      ])
      const metrics: MetricsRow[] = metricsRes.data ?? []
      if (metrics.length < 5) {
        return new Response(JSON.stringify({ suggestions: [], message: 'Пока недостаточно данных. Нужно хотя бы несколько дней метрик.' }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
      }
      const sleeps: SleepRow[] = sleepsRes.data ?? []
      const events: EventRow[] = eventsRes.data ?? []
      const env: EnvRow[] = envRes.data ?? []
      const tz = noteRes.data?.timezone || 'Europe/Kyiv'
      const localHour = (iso: string) => {
        const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).formatToParts(new Date(iso)).find(x => x.type === 'hour')?.value
        return p != null ? parseInt(p, 10) : new Date(iso).getUTCHours()
      }

      const rhr = nums(metrics.map(r => r.resting_heart_rate))
      const hrv = nums(metrics.map(r => r.hrv))
      const sleep = nums(metrics.map(r => r.sleep_hours))
      const steps = nums(metrics.map(r => r.steps))
      const deep = nums(sleeps.map(s => s.deep_hours))

      const mid = Math.floor(metrics.length / 2)
      const first = metrics.slice(0, mid)
      const last = metrics.slice(mid)
      const trend = (col: 'resting_heart_rate' | 'hrv' | 'sleep_hours' | 'steps', digits = 0) =>
        `${avg(nums(first.map(r => r[col])))?.toFixed(digits) ?? '—'} → ${avg(nums(last.map(r => r[col])))?.toFixed(digits) ?? '—'}`

      // тайминг сна: средний локальный час засыпания/пробуждения (с круговым сдвигом)
      const bedH = sleeps.flatMap(s => s.bedtime ? [localHour(s.bedtime)] : [])
      const wakeH = sleeps.flatMap(s => s.wake_time ? [localHour(s.wake_time)] : [])
      const avgClock = (hrs: number[], shift: number) => {
        if (!hrs.length) return '—'
        const adj = hrs.map(h => (h < shift ? h + 24 : h))
        const m = (adj.reduce((a, b) => a + b, 0) / adj.length) % 24
        const hh = Math.floor(m), mm = Math.round((m - hh) * 60)
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
      }

      // поведение (управляемые рычаги)
      const evOf = (t: string) => events.filter(e => e.type === t)
      const coffee = evOf('coffee'), lateCoffee = coffee.filter(e => localHour(e.ts) >= 16)
      const meals = evOf('meal'), lateMeals = meals.filter(e => localHour(e.ts) >= 21)
      const alcoholDays = new Set(evOf('alcohol').map(e => e.ts.slice(0, 10))).size
      const workoutDays = new Set(evOf('workout').map(e => e.ts.slice(0, 10))).size

      // среда (контекст, не цель)
      const temps = nums(env.map(e => e.temp_c))
      const pollens = nums(env.map(e => e.pollen))
      const aqis = nums(env.map(e => e.air_quality))
      const hotDays = temps.filter(t => t >= 25).length

      const behaviorLines: string[] = []
      if (coffee.length) behaviorLines.push(`Кофе: ${coffee.length} за период, из них ${lateCoffee.length} после 16:00`)
      if (meals.length) behaviorLines.push(`Приёмы пищи (логируются): ${meals.length}, поздних после 21:00: ${lateMeals.length}`)
      if (alcoholDays) behaviorLines.push(`Алкоголь: ${alcoholDays} дн из ${metrics.length}`)
      if (workoutDays) behaviorLines.push(`Тренировки: ${workoutDays} дн`)
      if (bedH.length) behaviorLines.push(`Время засыпания: ~${avgClock(bedH, 12)}, пробуждение: ~${avgClock(wakeH, 4)}`)

      const envLines: string[] = []
      if (temps.length) envLines.push(`Температура: ${avg(temps)?.toFixed(0)}°C (жарких дней ≥25°: ${hotDays})`)
      if (aqis.length) envLines.push(`Качество воздуха AQI: ${avg(aqis)?.toFixed(0)}`)
      if (pollens.length) envLines.push(`Пыльца: ${avg(pollens)?.toFixed(0)} (ср.)`)

      const digest = `ДАННЫЕ ЗА ${metrics.length} ДНЕЙ (${metrics[0].date} — ${metrics[metrics.length - 1].date}):
Пульс покоя: ${avg(rhr)?.toFixed(0) ?? '—'} уд/мин
HRV: ${avg(hrv)?.toFixed(0) ?? '—'} мс
Сон: ${avg(sleep)?.toFixed(1) ?? '—'} ч (ночей ≥7ч: ${sleep.filter(v => v >= 7).length}/${sleep.length})
Глубокий сон: ${avg(deep)?.toFixed(1) ?? '—'} ч
Шаги: ${avg(steps) ? Math.round(avg(steps)!) : '—'}/день

ТРЕНД (первая половина → вторая половина периода):
Пульс покоя: ${trend('resting_heart_rate')}
HRV: ${trend('hrv')}
Сон: ${trend('sleep_hours', 1)}
Шаги: ${trend('steps')}

ПОВЕДЕНИЕ (управляемые рычаги для экспериментов):
${behaviorLines.length ? behaviorLines.join('\n') : '(событий мало — предлагай эксперименты по таймингу сна и активности)'}

СРЕДА (НЕ управляется, только контекст для rationale):
${envLines.length ? envLines.join('\n') : '(нет данных среды)'}`

      prompt = `Ты — персональный ИИ-коуч по здоровью. Предложи 2-3 СЕРЬЁЗНЫХ эксперимента-самонаблюдения по схеме «изменить ОДНУ управляемую привычку → отследить измеримый исход».

${digest}

Доступные метрики-исходы (target_metric ДОЛЖЕН быть ровно одним из этих ключей):
${metricList}

Ответь СТРОГО JSON-массивом, без markdown:
[{ "hypothesis": "...", "change_rule": "...", "target_metric": "ключ", "rationale": "..." }]

ЖЁСТКИЕ ПРАВИЛА:
- Каждый эксперимент меняет КОНКРЕТНУЮ привычку из раздела ПОВЕДЕНИЕ (тайминг кофе, поздняя еда, время отбоя/подъёма, алкоголь, активность). НЕ предлагай абстрактное «делай больше метрики Y».
- change_rule — точное ежедневное действие с цифрой/временем (напр. «последняя чашка кофе до 14:00», «отбой до 23:30», «ужин до 20:00»).
- target_metric — измеримый исход, на который эта привычка реально влияет (кофе/еда/отбой → глубокий сон, HRV, длительность сна; активность → пульс покоя).
- Среда (жара, пыльца) — НЕ цель эксперимента (её нельзя менять), упоминай только в rationale как возможное объяснение.
- rationale — 1 предложение со ссылкой на КОНКРЕТНЫЕ цифры поведения/исходов выше.
- hypothesis — 1 предложение: привычка X влияет на исход Y.
- 2-3 эксперимента про разные привычки. Реалистично, безопасно. Язык — ${langNominative(lang)}.`
    }

    const geminiRes = await fetchGeminiWithConsent(
      supabase,
      user.id,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!geminiRes.ok) throw new Error(`Gemini error: ${await geminiRes.text()}`)
    const geminiData = await geminiRes.json()
    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'
    const tokensUsed = geminiData.usageMetadata?.totalTokenCount ?? null

    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonStr)
    } catch (parseErr) {
      // ответ обрезан — вытащим целые объекты до обрыва
      const objs = jsonStr.match(/\{[^{}]*\}/g) ?? []
      const rescued = objs
        .map((o: string): unknown => { try { return JSON.parse(o) } catch { return null } })
        .filter(Boolean)
      if (!rescued.length) throw new Error('ИИ вернул некорректный ответ. Попробуй ещё раз.', { cause: parseErr })
      parsed = rescued
    }

    if (!Array.isArray(parsed)) throw new Error('Invalid response format')

    // Оставляем только валидные предложения с метрикой из белого списка
    const suggestions: Suggestion[] = (parsed as unknown[])
      .flatMap((u): Suggestion[] => {
        if (!u || typeof u !== 'object') return []
        const s = u as Record<string, unknown>
        if (typeof s.hypothesis !== 'string' || typeof s.change_rule !== 'string') return []
        if (typeof s.target_metric !== 'string' || !ALLOWED[s.target_metric]) return []
        return [{
          hypothesis: s.hypothesis.slice(0, 200),
          change_rule: s.change_rule.slice(0, 200),
          target_metric: s.target_metric,
          rationale: String(s.rationale ?? '').slice(0, 300),
        }]
      })
      .slice(0, mode === 'refine' ? 1 : 3)

    if (tokensUsed) {
      await supabase.from('ai_usage').insert({ user_id: user.id, source: 'suggest-experiments', tokens_used: tokensUsed })
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    if (isAiConsentRequired(e)) return aiConsentRequiredResponse(CORS)
    return new Response((e as Error).message ?? 'Error', { status: 500, headers: CORS })
  }
})
