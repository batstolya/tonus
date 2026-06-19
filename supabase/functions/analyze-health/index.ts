import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `Ты помощник по самочувствию. Анализируешь данные здоровья из Apple Health и даёшь короткое саммери на русском языке.

Правила:
- Никаких медицинских диагнозов. Только наблюдения и советы по образу жизни.
- Опирайся на тренды и отклонения от личных базовых уровней, а не абсолютные значения.
- При тревожных признаках — мягко советуй обратиться к врачу, без алармизма.
- Коротко и конкретно. "Что улучшить" — выполнимые шаги.
- Не выдумывай данные которых нет.

Верни строго JSON (без markdown) в формате:
{
  "summary": "2-3 предложения общего вывода",
  "good": ["пункт 1", "пункт 2"],
  "improve": ["пункт 1", "пункт 2"],
  "focus": ["1-2 конкретных фокуса на период"]
}`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return new Response('Unauthorized', { status: 401, headers: CORS })
    // AI Cost Guard
    const budget = await checkBudget(supabase, user.id)
    if (!budget.ok) return new Response(JSON.stringify({ error: 'budget_exceeded', message: budgetExceededMessage(budget) }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } })


    const { digest, periodStart, periodEnd } = await req.json()
    if (!digest || !periodStart || !periodEnd) {
      return new Response('Missing fields', { status: 400, headers: CORS })
    }

    // Call Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: `Данные здоровья за период ${periodStart} — ${periodEnd}:\n\n${digest}` }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048, responseMimeType: 'application/json' },
        }),
      }
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      return new Response(`Gemini error: ${err}`, { status: 502, headers: CORS })
    }

    const geminiData = await geminiRes.json()
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const tokensUsed = geminiData.usageMetadata?.totalTokenCount ?? null

    let parsed: { summary: string; good: string[]; improve: string[]; focus: string[] }
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim())
    } catch {
      return new Response(`Failed to parse Gemini response: ${rawText}`, { status: 502, headers: CORS })
    }

    // Save to DB
    const { data: saved, error: dbError } = await supabase.from('ai_analyses').insert({
      user_id: user.id,
      period_start: periodStart,
      period_end: periodEnd,
      summary: parsed.summary,
      good: parsed.good,
      improve: parsed.improve,
      focus: parsed.focus,
      model: 'gemini-2.5-flash',
      tokens_used: tokensUsed,
    }).select().single()

    if (dbError) return new Response(`DB error: ${dbError.message}`, { status: 500, headers: CORS })

    if (tokensUsed) {
      await supabase.from('ai_usage').insert({ user_id: user.id, source: 'analyze', tokens_used: tokensUsed })
    }

    return new Response(JSON.stringify(saved), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(String(e), { status: 500, headers: CORS })
  }
})
