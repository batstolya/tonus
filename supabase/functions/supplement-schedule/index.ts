import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

// Average "HH:MM" times (used for typical wake/bedtime). Handles times past
// midnight for bedtime by treating <12:00 as next-day for the bedtime average.
function avgTime(times: string[], wrap = false): string | null {
  const mins = times
    .map((t) => {
      const m = /^(\d{1,2}):(\d{2})/.exec(t)
      if (!m) return null
      let v = parseInt(m[1]) * 60 + parseInt(m[2])
      if (wrap && v < 12 * 60) v += 24 * 60 // bedtime after midnight
      return v
    })
    .filter((v): v is number => v !== null)
  if (!mins.length) return null
  const a = Math.round(mins.reduce((s, v) => s + v, 0) / mins.length) % (24 * 60)
  return `${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`
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
    if (!budget.ok) {
      return new Response(JSON.stringify({ error: 'budget_exceeded', message: budgetExceededMessage(budget) }), {
        status: 402, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Active supplement stack
    const { data: sups } = await supabase
      .from('supplements')
      .select('name, default_dose, unit')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('sort_order')

    if (!sups?.length) {
      return new Response(JSON.stringify({ message: 'Нет добавок' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Age + sex
    const { data: prof } = await supabase
      .from('profiles')
      .select('birth_year, sex')
      .eq('id', user.id)
      .maybeSingle()
    const age = prof?.birth_year ? new Date().getFullYear() - prof.birth_year : null
    const sexLabel = prof?.sex === 'male' ? 'мужской' : prof?.sex === 'female' ? 'женский' : null

    // Typical wake / bedtime from recent sleep sessions (last 14)
    const { data: sleep } = await supabase
      .from('sleep_sessions')
      .select('bedtime, wake_time, date')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(14)
    const sleepRows: { bedtime: string | null; wake_time: string | null; date: string }[] = sleep ?? []
    const wake = avgTime(sleepRows.map(s => s.wake_time).filter((v): v is string => !!v))
    const bed = avgTime(sleepRows.map(s => s.bedtime).filter((v): v is string => !!v), true)

    const supRows: { name: string; default_dose: string | number | null; unit: string | null }[] = sups
    const stackList = supRows
      .map(s => `- ${s.name}${s.default_dose ? ` (${s.default_dose}${s.unit ? ` ${s.unit}` : ''})` : ''}`)
      .join('\n')

    const profileLines = [
      age ? `Возраст: ${age}` : null,
      sexLabel ? `Пол: ${sexLabel}` : null,
      wake ? `Обычный подъём: ${wake}` : null,
      bed ? `Обычный отбой: ${bed}` : null,
    ].filter(Boolean).join('\n') || 'Профиль не заполнен — используй общие рекомендации.'

    const prompt = `Ты — фармакологически грамотный ассистент по приёму витаминов и добавок (БАД).
Составь оптимальное ДНЕВНОЕ РАСПИСАНИЕ приёма для стека пользователя.

СТЕК:
${stackList}

ПРОФИЛЬ:
${profileLines}

Учитывай:
- фармакокинетику каждой добавки (жирорастворимые — с едой; железо — натощак/отдельно; магний — вечером для сна; стимулирующие — утром);
- взаимодействия и интервалы (кальций и железо — врозь; цинк и медь; кофеин и т.п.);
- возраст и пол, если заданы;
- привязывай времена к режиму сна пользователя (подъём/отбой), а не к абстрактным часам.

Ответь СТРОГО в формате JSON (без markdown, без пояснений вне JSON):
{
  "slots": [
    { "time": "08:00", "label": "Утро, с завтраком",
      "items": [ { "supplement": "точное имя из стека", "reason": "коротко почему именно это время" } ] }
  ],
  "notes": "1-3 коротких предостережения/взаимодействия общего характера",
  "disclaimer": "Это не медицинский совет. Проконсультируйтесь с врачом."
}

Правила:
- используй ТОЛЬКО добавки из стека, имена — дословно как в стеке;
- каждая добавка должна попасть хотя бы в один слот;
- время в формате HH:MM (24ч); группируй добавки по слотам;
- reason — одна короткая фраза на русском;
- максимум 5 слотов.`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
          },
        }),
      },
    )

    if (!geminiRes.ok) throw new Error(`Gemini error: ${await geminiRes.text()}`)
    const geminiData = await geminiRes.json()
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    const tokensUsed = geminiData.usageMetadata?.totalTokenCount ?? null

    const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonStr)
    } catch (parseErr) {
      throw new Error('ИИ вернул некорректный ответ. Попробуй ещё раз.', { cause: parseErr })
    }

    if (tokensUsed) {
      await supabase.from('ai_usage').insert({ user_id: user.id, source: 'supplement-schedule', tokens_used: tokensUsed })
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'Error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
