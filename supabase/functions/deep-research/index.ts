import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'
import { aiConsentRequiredResponse, fetchGeminiWithConsent, isAiConsentRequired } from '../_shared/aiConsent.ts'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: CORS })
    // AI Cost Guard
    const budget = await checkBudget(supabase, user.id)
    if (!budget.ok) return new Response(JSON.stringify({ error: 'budget_exceeded', message: budgetExceededMessage(budget) }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } })


    const { findings, periodLabel, notes } = await req.json()
    if (!findings || typeof findings !== 'string' || !findings.trim()) {
      return new Response(JSON.stringify({ reply: 'Недостаточно данных для анализа взаимосвязей. Нужно больше дней с метриками, событиями и наблюдениями.' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const prompt = `Ты — аналитик здоровья. Ниже СТАТИСТИЧЕСКИ ПОСЧИТАННЫЕ взаимосвязи в данных пользователя за ${periodLabel ?? 'период'}.
Эти числа уже вычислены детерминированно (Пирсон r и сравнение средних с эффектом Коэна). Твоя задача — ОБЪЯСНИТЬ их человеку, а НЕ выдумывать новые.

ПОСЧИТАННЫЕ ВЗАИМОСВЯЗИ:
${findings}
${notes ? `\nЗАМЕТКИ ДНЯ (контекст со слов пользователя):\n${notes}\n` : ''}
Напиши разбор на русском, plain text (без markdown-звёздочек и решёток), с emoji для заголовков:

🔍 Главные находки
— переформулируй 3-5 самых сильных связей простым языком, с числами. Что с чем связано и в какую сторону.

💡 Гипотезы
— осторожные объяснения, ПОЧЕМУ так может быть (физиология/поведение). Помечай как гипотезы.

🧪 Что проверить
— 2-3 конкретных мини-эксперимента или наблюдения, чтобы подтвердить/опровергнуть связь.

⚠️ Оговорки
— напомни: корреляция ≠ причинность; малая выборка ненадёжна; это не диагноз, при тревожных значениях — к врачу.

Правила: опирайся ТОЛЬКО на переданные числа, не выдумывай связи которых нет в списке. Если связь слабая по n — так и скажи. Кратко и по делу.`

    const res = await fetchGeminiWithConsent(
      supabase,
      user.id,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } }),
      }
    )
    if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`)
    const data = await res.json()
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Не удалось сформировать разбор.'
    const tokens = data.usageMetadata?.totalTokenCount ?? null
    if (tokens) await supabase.from('ai_usage').insert({ user_id: user.id, source: 'deep-research', tokens_used: tokens })

    return new Response(JSON.stringify({ reply }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    if (isAiConsentRequired(e)) return aiConsentRequiredResponse(CORS)
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'Error' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
