import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'
import { getPrompt } from '../_shared/prompts.ts'
import { buildHealthContext, healthContextToText } from '../_shared/healthContext.ts'
import { localNow } from '../_shared/time.ts'
import { runChatLoop, type ChatLoopMessage, type GeminiPart } from '../_shared/chatToolLoop.ts'
import { CHAT_TOOL_DECLARATIONS, executeChatTool } from '../_shared/chatTools.ts'
import { parseDebugReply, formatToolTrace } from '../_shared/chatDebug.ts'
import {
  findOwnedChatSession,
  isValidChatSessionId,
  loadOwnedChatHistory,
  type ChatHistoryClient,
  type SessionLookupClient,
} from '../_shared/chatSessionOwnership.ts'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const MAX_HISTORY = 12 // last N messages to include verbatim
const MAX_MESSAGE_LENGTH = 4096

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `Ты — персональный ассистент по здоровью.
Твоя роль: помогать пользователю понять его данные здоровья простым языком.
Строгие правила:
- Никаких медицинских диагнозов. Только наблюдения на основе данных.
- Если в данных есть тревожные значения — мягко рекомендуй обратиться к врачу.
- Не выдумывай данные, которых нет в контексте.
- Отвечай кратко и конкретно (2-4 предложения, если не просят подробнее).
- Опирайся на личные тренды пользователя, а не на абсолютные нормы.
- Если вопрос требует данных за пределами контекста (период старше ~30 дней,
  диапазон, не совпадающий с «последние/предыдущие 7 дней», или полная
  история одного анализа) — используй инструменты get_metrics_range/
  get_sleep_range/get_lab_history вместо отказа или предположений.
- Вопросы про «лучшие/худшие дни», «рекорд», «когда был максимум/минимум»
  метрики — это про ВСЮ историю, а не про последние 2 недели из контекста.
  Всегда используй get_extreme_days (иначе ответишь по свежему окну и
  пропустишь настоящие рекорды). Даты в ответе давай в одном формате.
- Если пользователь спрашивает «с чем связано» / «почему изменилось» —
  используй get_correlations вместо предположений. Это реально посчитанная
  статистика (Пирсон), не гипотеза; если корреляций не нашлось, так и скажи,
  не придумывай объяснение взамен.
- Если инструмент вернул ошибку или пустой результат — сообщи об этом прямо,
  не выдумывай значения взамен.`

const DEBUG = Deno.env.get('CHAT_DEBUG_REASON') === '1'
const DEBUG_INSTRUCTION = `\n\nВАЖНО (диагностический режим): итоговый ответ верни СТРОГО как JSON-объект без markdown-ограждения и без текста вокруг: {"answer": "<твой обычный ответ пользователю>", "reason": "<на каких именно данных/инструментах построен ответ, 1-2 предложения>"}. Промежуточные вызовы инструментов делай как обычно — JSON нужен только в самом последнем, текстовом ответе.`

async function callGemini(contents: ChatLoopMessage[], withTools: boolean): Promise<{ parts: GeminiPart[]; tokensUsed: number }> {
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      // thinking-токены входят в maxOutputTokens (Gemini 2.5), поэтому лимит
      // должен вмещать бюджет мышления + видимый ответ; краткость ответа
      // обеспечивает системный промпт, не токен-лимит.
      // Финальный ход (withTools=false) — форматирование ответа из уже
      // полученных данных: мышление почти не нужно, зато перечисление всех
      // значений может быть длинным. Урезаем thinkingBudget и поднимаем лимит,
      // иначе мышление съедает бюджет и видимый текст выходит пустым →
      // «Не удалось получить ответ.» (Gemini 2.5 thinking-token gotcha).
      maxOutputTokens: 3072,
      temperature: 0.5,
      thinkingConfig: { thinkingBudget: withTools ? 1024 : 256 },
    },
  }
  if (withTools) body.tools = [{ functionDeclarations: CHAT_TOOL_DECLARATIONS }]

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  )
  if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`)
  const data = await res.json()
  return {
    parts: data.candidates?.[0]?.content?.parts ?? [],
    tokensUsed: data.usageMetadata?.totalTokenCount ?? 0,
  }
}

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
    if (typeof message !== 'string' || !message.trim()) {
      return new Response('Missing message', { status: 400, headers: CORS })
    }
    if (sessionId !== null && sessionId !== undefined && !isValidChatSessionId(sessionId)) {
      return new Response('Invalid session', { status: 400, headers: CORS })
    }
    // Язык ответа = язык интерфейса пользователя (данные в контексте всегда на русском)
    const LANG_NAMES: Record<string, string> = { ru: 'русском', uk: 'украинском', en: 'английском' }
    const replyLang = LANG_NAMES[lang as string] ?? 'русском'

    // Resolve caller-supplied sessions before budget or health-data access. The
    // service-role client bypasses RLS, so both IDs are mandatory here.
    let session: { id: string } | null = null
    if (sessionId) {
      const { data, error } = await findOwnedChatSession(
        supabase as unknown as SessionLookupClient,
        sessionId,
        user.id,
      )
      if (error) throw new Error('Session lookup failed')
      if (!data) return new Response('Session not found', { status: 404, headers: CORS })
      session = data
    }

    // Legitimate abuse boundary and a deterministic no-egress positive control:
    // ownership is proven first, then oversized input stops before budget,
    // health-data reads, message writes, tools, or Gemini.
    if (message.length > MAX_MESSAGE_LENGTH) {
      return new Response('Message too long', { status: 413, headers: CORS })
    }

    // AI Cost Guard — не вызываем Gemini при превышении месячного бюджета
    const budget = await checkBudget(supabase, user.id)
    if (!budget.ok) {
      return new Response(JSON.stringify({ error: 'budget_exceeded', message: budgetExceededMessage(budget) }), {
        status: 402, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Create a new session only when the caller did not supply one. A foreign
    // or missing supplied ID must never silently fall back to a fresh session.
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
    const { data: history, error: historyErr } = await loadOwnedChatHistory(
      supabase as unknown as ChatHistoryClient,
      session.id,
      user.id,
      MAX_HISTORY,
    )
    if (historyErr) throw new Error('Chat history lookup failed')

    const recentMessages = (history ?? []).reverse()

    // Save user message
    const { error: messageInsertErr } = await supabase.from('chat_messages').insert({
      user_id: user.id,
      session_id: session.id,
      role: 'user',
      content: message,
    })
    if (messageInsertErr) throw new Error('Chat message insert failed')

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

    const geminiContents: ChatLoopMessage[] = [
      // System context as first user message (Gemini pattern)
      {
        role: 'user',
        parts: [{ text: `${sys.text}\nОтвечай на ${replyLang} языке.${metaLine}${contextText}\n\nПользователь задаёт вопрос о своих данных здоровья.${DEBUG ? DEBUG_INSTRUCTION : ''}` }],
      },
      { role: 'model', parts: [{ text: 'Понял, буду отвечать на основе твоих данных.' }] },
      // Recent conversation history
      ...recentMessages.map(m => ({
        role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
        parts: [{ text: m.content }],
      })),
      // New message
      { role: 'user', parts: [{ text: message }] },
    ]

    const executeTool = (name: string, args: Record<string, unknown>) => executeChatTool(supabase, user.id, name, args)
    const { reply: rawReply, totalTokens: tokensUsed, toolCalls } = await runChatLoop(geminiContents, callGemini, executeTool)
    const { answer, reason } = DEBUG ? parseDebugReply(rawReply) : { answer: rawReply, reason: '' }
    const debug = DEBUG ? { reason, tools: formatToolTrace(toolCalls) } : undefined

    // Save assistant reply
    await supabase.from('chat_messages').insert({
      user_id: user.id,
      session_id: session.id,
      role: 'assistant',
      content: answer,
      tokens_used: tokensUsed,
    })

    // Track usage
    if (tokensUsed) {
      await supabase.from('ai_usage').insert({ user_id: user.id, source: 'chat', tokens_used: tokensUsed, prompt_version: sys.version })
    }

    // Update session updated_at
    const { error: updateErr } = await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', session.id)
      .eq('user_id', user.id)
    if (updateErr) throw new Error('Session update failed')

    return new Response(JSON.stringify({ reply: answer, sessionId: session.id, ...(debug ? { debug } : {}) }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response('Internal error', { status: 500, headers: CORS })
  }
})
