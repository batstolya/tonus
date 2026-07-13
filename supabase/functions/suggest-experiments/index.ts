import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

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

interface Suggestion {
  hypothesis: string
  change_rule: string
  target_metric: string
  rationale: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    // Service-role вызов из telegram-bot с x-user-id (паттерн biweekly-report)
    const serviceUserId = req.headers.get('x-user-id')
    let user: { id: string } | null = null
    if (serviceUserId && authHeader.includes(SUPABASE_SERVICE_KEY.slice(0, 20))) {
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

    const body = await req.json().catch(() => ({}))
    const mode: 'generate' | 'refine' = body.mode === 'refine' ? 'refine' : 'generate'
    const idea = (body.idea ?? '').toString().slice(0, 300)

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
- Реалистичное, безопасное изменение. Тон поддерживающий. Язык — русский.`
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
      const metrics = metricsRes.data
      if (!metrics?.length || metrics.length < 5) {
        return new Response(JSON.stringify({ suggestions: [], message: 'Пока недостаточно данных. Нужно хотя бы несколько дней метрик.' }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
      }
      const sleeps = sleepsRes.data ?? []
      const events = eventsRes.data ?? []
      const env = envRes.data ?? []
      const tz = noteRes.data?.timezone || 'Europe/Kyiv'
      const localHour = (iso: string) => {
        const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).formatToParts(new Date(iso)).find(x => x.type === 'hour')?.value
        return p != null ? parseInt(p, 10) : new Date(iso).getUTCHours()
      }

      const rhr = metrics.map((r: any) => r.resting_heart_rate).filter(Boolean)
      const hrv = metrics.map((r: any) => r.hrv).filter(Boolean)
      const sleep = metrics.map((r: any) => r.sleep_hours).filter(Boolean)
      const steps = metrics.map((r: any) => r.steps).filter(Boolean)
      const deep = sleeps.map((s: any) => s.deep_hours).filter(Boolean)

      const mid = Math.floor(metrics.length / 2)
      const first = metrics.slice(0, mid)
      const last = metrics.slice(mid)
      const trend = (col: string, digits = 0) =>
        `${avg(first.map((r: any) => r[col]).filter(Boolean))?.toFixed(digits) ?? '—'} → ${avg(last.map((r: any) => r[col]).filter(Boolean))?.toFixed(digits) ?? '—'}`

      // тайминг сна: средний локальный час засыпания/пробуждения (с круговым сдвигом)
      const bedH = sleeps.filter((s: any) => s.bedtime).map((s: any) => localHour(s.bedtime))
      const wakeH = sleeps.filter((s: any) => s.wake_time).map((s: any) => localHour(s.wake_time))
      const avgClock = (hrs: number[], shift: number) => {
        if (!hrs.length) return '—'
        const adj = hrs.map(h => (h < shift ? h + 24 : h))
        const m = (adj.reduce((a, b) => a + b, 0) / adj.length) % 24
        const hh = Math.floor(m), mm = Math.round((m - hh) * 60)
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
      }

      // поведение (управляемые рычаги)
      const evOf = (t: string) => events.filter((e: any) => e.type === t)
      const coffee = evOf('coffee'), lateCoffee = coffee.filter((e: any) => localHour(e.ts) >= 16)
      const meals = evOf('meal'), lateMeals = meals.filter((e: any) => localHour(e.ts) >= 21)
      const alcoholDays = new Set(evOf('alcohol').map((e: any) => e.ts.slice(0, 10))).size
      const workoutDays = new Set(evOf('workout').map((e: any) => e.ts.slice(0, 10))).size

      // среда (контекст, не цель)
      const temps = env.map((e: any) => e.temp_c).filter((v: any) => v != null)
      const pollens = env.map((e: any) => e.pollen).filter((v: any) => v != null)
      const aqis = env.map((e: any) => e.air_quality).filter((v: any) => v != null)
      const hotDays = temps.filter((t: number) => t >= 25).length

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
Сон: ${avg(sleep)?.toFixed(1) ?? '—'} ч (ночей ≥7ч: ${sleep.filter((v: number) => v >= 7).length}/${sleep.length})
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
- 2-3 эксперимента про разные привычки. Реалистично, безопасно. Язык — русский.`
    }

    const geminiRes = await fetch(
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
    let parsed: any
    try {
      parsed = JSON.parse(jsonStr)
    } catch (_e) {
      // ответ обрезан — вытащим целые объекты до обрыва
      const objs = jsonStr.match(/\{[^{}]*\}/g) ?? []
      parsed = objs.map((o: string) => { try { return JSON.parse(o) } catch { return null } }).filter(Boolean)
      if (!parsed.length) throw new Error('ИИ вернул некорректный ответ. Попробуй ещё раз.')
    }

    if (!Array.isArray(parsed)) throw new Error('Invalid response format')

    // Оставляем только валидные предложения с метрикой из белого списка
    const suggestions: Suggestion[] = parsed
      .filter((s: any) => s && typeof s.hypothesis === 'string' && typeof s.change_rule === 'string' && ALLOWED[s.target_metric])
      .map((s: any) => ({
        hypothesis: String(s.hypothesis).slice(0, 200),
        change_rule: String(s.change_rule).slice(0, 200),
        target_metric: s.target_metric,
        rationale: String(s.rationale ?? '').slice(0, 300),
      }))
      .slice(0, mode === 'refine' ? 1 : 3)

    if (tokensUsed) {
      await supabase.from('ai_usage').insert({ user_id: user.id, source: 'suggest-experiments', tokens_used: tokensUsed })
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response((e as Error).message ?? 'Error', { status: 500, headers: CORS })
  }
})
