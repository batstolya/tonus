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
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (error || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

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
      // generate из данных за 30 дней
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
      const { data: metrics } = await supabase.from('daily_metrics').select('*')
        .eq('user_id', user.id).gte('date', cutoff.toISOString().slice(0, 10)).order('date')

      if (!metrics?.length || metrics.length < 5) {
        return new Response(JSON.stringify({ suggestions: [], message: 'Пока недостаточно данных. Нужно хотя бы несколько дней метрик.' }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
      }

      const rhr = metrics.map((r: any) => r.resting_heart_rate).filter(Boolean)
      const hrv = metrics.map((r: any) => r.hrv).filter(Boolean)
      const sleep = metrics.map((r: any) => r.sleep_hours).filter(Boolean)
      const steps = metrics.map((r: any) => r.steps).filter(Boolean)
      const deep = metrics.map((r: any) => r.sleep_deep).filter(Boolean)

      const mid = Math.floor(metrics.length / 2)
      const first = metrics.slice(0, mid)
      const last = metrics.slice(mid)
      const trend = (col: string, digits = 0) =>
        `${avg(first.map((r: any) => r[col]).filter(Boolean))?.toFixed(digits) ?? '—'} → ${avg(last.map((r: any) => r[col]).filter(Boolean))?.toFixed(digits) ?? '—'}`

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
Глубокий сон: ${trend('sleep_deep', 1)}
Шаги: ${trend('steps')}`

      prompt = `Ты — персональный ИИ-коуч по здоровью. На основе данных пользователя предложи 2-3 эксперимента-самонаблюдения: изменить одну привычку и отследить, как меняется метрика.

${digest}

Доступные метрики (target_metric ДОЛЖЕН быть ровно одним из этих ключей):
${metricList}

Ответь СТРОГО JSON-массивом, без markdown и пояснений:
[{ "hypothesis": "...", "change_rule": "...", "target_metric": "ключ", "rationale": "..." }]

Правила:
- 2-3 эксперимента, каждый про РАЗНУЮ метрику.
- hypothesis — короткая проверяемая формулировка ожидаемого эффекта, 1 предложение.
- change_rule — конкретное ежедневное действие, которое человек меняет.
- target_metric — ровно один ключ из списка.
- rationale — 1 предложение со ссылкой на конкретные цифры из данных выше.
- Опирайся на то, что в данных выглядит слабым местом или явным трендом.
- Реалистичные, безопасные изменения. Тон поддерживающий. Язык — русский.`
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
  } catch (e: any) {
    return new Response(e.message ?? 'Error', { status: 500, headers: CORS })
  }
})
