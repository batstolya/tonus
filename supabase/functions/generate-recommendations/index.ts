import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'
import { aiConsentRequiredResponse, fetchGeminiWithConsent, isAiConsentRequired } from '../_shared/aiConsent.ts'
import { corsHeadersFor } from '../_shared/cors.ts'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGINS = Deno.env.get('TONUS_ALLOWED_ORIGINS') ?? ''

function avg(vals: number[]): number | null {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

// Локальный тип строки daily_metrics с реально используемыми колонками.
interface MetricsRow {
  date: string
  resting_heart_rate: number | null
  hrv: number | null
  sleep_hours: number | null
  sleep_deep: number | null
  steps: number | null
}

// .filter(Boolean) не сужает (number | null)[] → number[]; нужен type guard.
const nums = (vals: (number | null | undefined)[]): number[] =>
  vals.filter((v): v is number => v != null)

serve(async (req) => {
  const CORS = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (error || !user) return new Response('Unauthorized', { status: 401, headers: CORS })
    // AI Cost Guard
    const budget = await checkBudget(supabase, user.id)
    if (!budget.ok) return new Response(JSON.stringify({ error: 'budget_exceeded', message: budgetExceededMessage(budget) }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } })


    // Load last 30 days of metrics
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
    const { data: metricsData } = await supabase.from('daily_metrics').select('*')
      .eq('user_id', user.id).gte('date', cutoff.toISOString().slice(0, 10)).order('date')
    const metrics: MetricsRow[] = metricsData ?? []

    if (!metrics.length) {
      return new Response(JSON.stringify({ count: 0, message: 'Нет данных' }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Load existing active goals to avoid duplicates
    const { data: activeGoals } = await supabase.from('goals').select('metric').eq('user_id', user.id).eq('status', 'active')
    const activeMetrics = new Set(((activeGoals ?? []) as { metric: string }[]).map(g => g.metric))

    // Build stats digest
    const rhr = nums(metrics.map(r => r.resting_heart_rate))
    const hrv = nums(metrics.map(r => r.hrv))
    const sleep = nums(metrics.map(r => r.sleep_hours))
    const steps = nums(metrics.map(r => r.steps))
    const deep = nums(metrics.map(r => r.sleep_deep))

    // Compare first 2 weeks vs last 2 weeks
    const mid = Math.floor(metrics.length / 2)
    const first = metrics.slice(0, mid)
    const last = metrics.slice(mid)

    const digest = `
ДАННЫЕ ЗА 30 ДНЕЙ (${metrics[0].date} — ${metrics[metrics.length-1].date}):
ЧСС покоя: среднее ${avg(rhr)?.toFixed(0) ?? '—'} уд/мин
HRV: среднее ${avg(hrv)?.toFixed(0) ?? '—'} мс
Сон: среднее ${avg(sleep)?.toFixed(1) ?? '—'} ч, ночей ≥7ч: ${sleep.filter(v => v >= 7).length}/${sleep.length}
Глубокий сон: ${avg(deep)?.toFixed(1) ?? '—'} ч
Шаги: ${avg(steps) ? Math.round(avg(steps)!) : '—'}/день

ТРЕНД (первые 2 недели → последние 2 недели):
ЧСС: ${avg(nums(first.map(r => r.resting_heart_rate)))?.toFixed(0) ?? '—'} → ${avg(nums(last.map(r => r.resting_heart_rate)))?.toFixed(0) ?? '—'}
HRV: ${avg(nums(first.map(r => r.hrv)))?.toFixed(0) ?? '—'} → ${avg(nums(last.map(r => r.hrv)))?.toFixed(0) ?? '—'}
Сон: ${avg(nums(first.map(r => r.sleep_hours)))?.toFixed(1) ?? '—'} → ${avg(nums(last.map(r => r.sleep_hours)))?.toFixed(1) ?? '—'}
Шаги: ${avg(nums(first.map(r => r.steps))) ? Math.round(avg(nums(first.map(r => r.steps)))!) : '—'} → ${avg(nums(last.map(r => r.steps))) ? Math.round(avg(nums(last.map(r => r.steps)))!) : '—'}

УЖЕ ЕСТЬ АКТИВНЫЕ ЦЕЛИ ПО: ${activeMetrics.size ? [...activeMetrics].join(', ') : 'нет'}
`

    const prompt = `Ты — персональный ИИ-коуч по здоровью. На основе данных пользователя предложи 2-3 конкретные, измеримые цели.

${digest}

Ответь СТРОГО в формате JSON массива (без markdown, без пояснений):
[
  {
    "metric": "sleep_hours" | "hrv" | "resting_heart_rate" | "steps" | "active_energy" | "sleep_deep",
    "text": "Краткое предложение цели (1-2 предложения, поддерживающий тон)",
    "rationale": "Конкретное обоснование на основе данных (ссылайся на цифры)",
    "suggested_target": число (целевое значение в единицах метрики),
    "suggested_target_label": "человеко-читаемый целевой результат (например '7.5 ч/ночь')"
  }
]

Правила:
- Не предлагай цели по метрикам где уже есть активные цели
- Цели постепенные: не более 10-15% от текущего значения
- Не предлагай агрессивных целей по калориям/нагрузке
- Используй поддерживающий тон, без штрафных формулировок
- Если данных по метрике нет — не включай в список
- Максимум 3 рекомендации`

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
            temperature: 0.4,
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

    // Parse JSON from response (strip markdown fences if present)
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    let recs: unknown
    try {
      recs = JSON.parse(jsonStr)
    } catch (parseErr) {
      // Ответ обрезан/повреждён — попробуем вытащить целые объекты до обрыва
      const objs = jsonStr.match(/\{[^{}]*\}/g) ?? []
      const rescued = objs
        .map((o: string): unknown => { try { return JSON.parse(o) } catch { return null } })
        .filter(Boolean)
      if (!rescued.length) {
        throw new Error('ИИ вернул некорректный ответ. Попробуй ещё раз.', { cause: parseErr })
      }
      recs = rescued
    }

    if (!Array.isArray(recs)) throw new Error('Invalid response format')

    // Save to DB
    const toInsert = (recs as unknown[]).map((u) => {
      const r = (u ?? {}) as Record<string, unknown>
      return {
        user_id: user.id,
        metric: r.metric,
        text: r.text,
        rationale: r.rationale ?? null,
        suggested_target: r.suggested_target ?? null,
        suggested_target_label: r.suggested_target_label ?? null,
        status: 'new',
        source: 'ai',
      }
    })

    const { data: inserted } = await supabase.from('recommendations').insert(toInsert).select()

    if (tokensUsed) {
      await supabase.from('ai_usage').insert({ user_id: user.id, source: 'generate-recommendations', tokens_used: tokensUsed })
    }

    return new Response(JSON.stringify({ count: inserted?.length ?? 0, recommendations: inserted }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    if (isAiConsentRequired(e)) return aiConsentRequiredResponse(CORS)
    return new Response((e as Error).message ?? 'Error', { status: 500, headers: CORS })
  }
})
