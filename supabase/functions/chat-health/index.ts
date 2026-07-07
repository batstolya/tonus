import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'
import { getPrompt } from '../_shared/prompts.ts'
import { buildHealthContext, healthContextToText } from '../_shared/healthContext.ts'
import { localNow } from '../_shared/time.ts'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const MAX_HISTORY = 12 // last N messages to include verbatim

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const SYSTEM_PROMPT = `Ты — персональный ассистент по здоровью.
Твоя роль: помогать пользователю понять его данные здоровья простым языком.
Строгие правила:
- Никаких медицинских диагнозов. Только наблюдения на основе данных.
- Если в данных есть тревожные значения — мягко рекомендуй обратиться к врачу.
- Не выдумывай данные, которых нет в контексте.
- Отвечай кратко и конкретно (2-4 предложения, если не просят подробнее).
- Опирайся на личные тренды пользователя, а не на абсолютные нормы.`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

    // contextSnapshot от клиента больше не принимаем: контекст строится на
    // сервере из БД (единый билдер _shared/healthContext, F2 smart-tonus) —
    // клиент и сервер не дрейфуют, цели/эксперименты внутри.
    const { sessionId, message, lang } = await req.json()
    if (!message) return new Response('Missing message', { status: 400, headers: CORS })
    // Язык ответа = язык интерфейса пользователя (данные в контексте всегда на русском)
    const LANG_NAMES: Record<string, string> = { ru: 'русском', uk: 'украинском', en: 'английском' }
    const replyLang = LANG_NAMES[lang as string] ?? 'русском'

    // AI Cost Guard — не вызываем Gemini при превышении месячного бюджета
    const budget = await checkBudget(supabase, user.id)
    if (!budget.ok) {
      return new Response(JSON.stringify({ error: 'budget_exceeded', message: budgetExceededMessage(budget) }), {
        status: 402, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Load or create session
    let session: any = null
    if (sessionId) {
      const { data } = await supabase.from('chat_sessions').select('*').eq('id', sessionId).single()
      session = data
    }
    if (!session) {
      const { data, error: insertErr } = await supabase
        .from('chat_sessions')
        .insert({ user_id: user.id })
        .select().single()
      if (insertErr) throw new Error(`Session insert failed: ${insertErr.message}`)
      session = data
    }
    if (!session) throw new Error('Failed to create session')

    // Load recent messages for rolling context
    const { data: history } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY)

    const recentMessages = (history ?? []).reverse()

    // Save user message
    await supabase.from('chat_messages').insert({
      user_id: user.id,
      session_id: session.id,
      role: 'user',
      content: message,
    })

    const { data: profile } = await supabase.from('profiles')
      .select('timezone, birth_year, sex').eq('id', user.id).maybeSingle()
    const timezone = profile?.timezone ?? 'Europe/Berlin'

    // Контекст всегда свежий, из БД (30 дней + цели/эксперименты/профиль)
    const ctx = await buildHealthContext(supabase, user.id, { periodDays: 30, includeCoachProfile: true, timezone })
    const contextText = `\n\n=== ДАННЫЕ ПОЛЬЗОВАТЕЛЯ (30 дней) ===\n${healthContextToText(ctx)}`

    // Мета: сегодняшняя дата в таймзоне пользователя + возраст/пол (ctx.timezone
    // уже провалидирован в buildHealthContext — сырое значение могло быть мусором)
    const { date: todayStr } = localNow(ctx.timezone)
    const sexTxt = profile?.sex === 'male' ? 'мужской' : profile?.sex === 'female' ? 'женский' : null
    const ageTxt = profile?.birth_year ? `~${new Date().getFullYear() - profile.birth_year} лет` : null
    const personLine = [ageTxt && `возраст ${ageTxt}`, sexTxt && `пол ${sexTxt}`].filter(Boolean).join(', ')
    const metaLine = `\nСегодня: ${todayStr} (таймзона ${ctx.timezone}).${personLine ? ` Пользователь: ${personLine}.` : ''}`

    const sys = await getPrompt(supabase, 'chat-health-system', SYSTEM_PROMPT)

    const geminiContents = [
      // System context as first user message (Gemini pattern)
      {
        role: 'user',
        parts: [{ text: `${sys.text}\nОтвечай на ${replyLang} языке.${metaLine}${contextText}\n\nПользователь задаёт вопрос о своих данных здоровья.` }],
      },
      { role: 'model', parts: [{ text: 'Понял, буду отвечать на основе твоих данных.' }] },
      // Recent conversation history
      ...recentMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
      // New message
      { role: 'user', parts: [{ text: message }] },
    ]

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiContents,
          generationConfig: {
            // thinking-токены входят в maxOutputTokens (Gemini 2.5), поэтому лимит
            // должен вмещать бюджет мышления + видимый ответ; краткость ответа
            // обеспечивает системный промпт, не токен-лимит
            maxOutputTokens: 2048,
            temperature: 0.5,
            thinkingConfig: { thinkingBudget: 1024 },
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      throw new Error(`Gemini error: ${err}`)
    }

    const geminiData = await geminiRes.json()
    const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Не удалось получить ответ.'
    const tokensUsed = geminiData.usageMetadata?.totalTokenCount ?? null

    // Save assistant reply
    await supabase.from('chat_messages').insert({
      user_id: user.id,
      session_id: session.id,
      role: 'assistant',
      content: reply,
      tokens_used: tokensUsed,
    })

    // Track usage
    if (tokensUsed) {
      await supabase.from('ai_usage').insert({ user_id: user.id, source: 'chat', tokens_used: tokensUsed, prompt_version: sys.version })
    }

    // Update session updated_at
    await supabase.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', session.id)

    return new Response(JSON.stringify({ reply, sessionId: session.id }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(e.message ?? 'Error', { status: 500, headers: CORS })
  }
})
