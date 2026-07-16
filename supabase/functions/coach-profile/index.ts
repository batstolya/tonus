import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget } from '../_shared/costGuard.ts'
import { isServiceRoleCall } from '../_shared/serviceRoleAuth.ts'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-request-id' }

const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const authHeader = req.headers.get('Authorization') ?? ''
    // поддержка service-role вызова (из cron) с x-user-id, иначе по токену пользователя
    const serviceUserId = req.headers.get('x-user-id')
    let userId: string | null = null
    if (serviceUserId && isServiceRoleCall(req, SUPABASE_SERVICE_KEY)) {
      userId = serviceUserId
    } else {
      const { data, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      if (error || !data.user) return new Response('Unauthorized', { status: 401, headers: CORS })
      userId = data.user.id
    }

    // не пересобирать чаще раза в сутки, если не force
    const { force } = await req.json().catch(() => ({ force: false }))
    const { data: existing } = await supabase.from('coach_profile').select('*').eq('user_id', userId).maybeSingle()
    if (existing && !force && existing.updated_at && (Date.now() - new Date(existing.updated_at).getTime()) < 86400000) {
      return new Response(JSON.stringify(existing), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // AI Cost Guard — при превышении бюджета вернуть текущий профиль без пересборки
    const budget = await checkBudget(supabase, userId)
    if (!budget.ok) {
      return new Response(JSON.stringify(existing ?? { summary: '', facts: [] }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const since = new Date(); since.setDate(since.getDate() - 30)
    const sinceStr = since.toISOString().slice(0, 10)

    const [metricsRes, notesRes, goalsRes, supsRes, concernsRes] = await Promise.all([
      supabase.from('daily_metrics').select('date, resting_heart_rate, hrv, sleep_hours, steps').eq('user_id', userId).gte('date', sinceStr),
      supabase.from('context_notes').select('date, note').eq('user_id', userId).gte('date', sinceStr).order('date', { ascending: false }).limit(20),
      supabase.from('goals').select('title, metric, status').eq('user_id', userId),
      supabase.from('supplements').select('name').eq('user_id', userId).eq('active', true),
      supabase.from('health_concerns').select('name, status').eq('user_id', userId),
    ])

    type MetricRow = { date: string; resting_heart_rate: number | null; hrv: number | null; sleep_hours: number | null; steps: number | null }
    const m: MetricRow[] = metricsRes.data ?? []
    const num = (k: keyof MetricRow): number[] =>
      m.map(r => r[k]).filter((v): v is number => typeof v === 'number')
    const metricsLine = [
      num('hrv').length ? `HRV ~${avg(num('hrv'))!.toFixed(0)}мс` : '',
      num('resting_heart_rate').length ? `пульс покоя ~${avg(num('resting_heart_rate'))!.toFixed(0)}` : '',
      num('sleep_hours').length ? `сон ~${avg(num('sleep_hours'))!.toFixed(1)}ч` : '',
      num('steps').length ? `шаги ~${Math.round(avg(num('steps'))!)}` : '',
    ].filter(Boolean).join(', ')

    const notes = ((notesRes.data ?? []) as { date: string; note: string }[]).map(n => `${n.date}: ${n.note}`).join('\n')
    const goals = ((goalsRes.data ?? []) as { title: string; metric: string; status: string }[]).map(g => `${g.title} [${g.status}]`).join('; ')
    const sups = ((supsRes.data ?? []) as { name: string }[]).map(s => s.name).join(', ')
    const concerns = ((concernsRes.data ?? []) as { name: string; status: string }[]).map(c => `${c.name} [${c.status}]`).join('; ')

    const prevSummary = existing?.summary ? `\nПРЕДЫДУЩИЙ ПРОФИЛЬ (обнови, не теряя важного):\n${existing.summary}\n` : ''

    const prompt = `Ты — персональный коуч по здоровью. Составь КРАТКИЙ накопительный профиль пользователя для памяти ассистента — чтобы в будущих разговорах помнить контекст.
${prevSummary}
ДАННЫЕ ЗА 30 ДНЕЙ:
Средние: ${metricsLine || 'нет'}
Цели: ${goals || 'нет'}
Препараты: ${sups || 'нет'}
Проблемы: ${concerns || 'нет'}
Заметки дня (со слов пользователя):
${notes || 'нет'}

Верни ТОЛЬКО JSON:
{
  "summary": "3-5 предложений: кто пользователь по здоровью, его цели, привычки, контекст жизни, что для него важно. Простым языком, без воды.",
  "facts": ["короткие ключевые факты", "макс 8 штук", "то что стоит помнить надолго"]
}
Правила: опирайся только на данные, не выдумывай. Не диагнозы. На русском.`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    )
    if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`)
    const data = await res.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    const tokens = data.usageMetadata?.totalTokenCount ?? null
    if (tokens) await supabase.from('ai_usage').insert({ user_id: userId, source: 'coach-profile', tokens_used: tokens })

    let parsed: { summary?: unknown; facts?: unknown } = {}
    try { parsed = JSON.parse(raw) } catch { /* ignore */ }
    const summary = typeof parsed.summary === 'string' ? parsed.summary : (existing?.summary ?? '')
    const facts = Array.isArray(parsed.facts) ? parsed.facts.slice(0, 8) : (existing?.facts ?? [])

    const { data: saved } = await supabase.from('coach_profile').upsert(
      { user_id: userId, summary, facts, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    ).select('*').single()

    return new Response(JSON.stringify(saved ?? { summary, facts }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'Error' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
