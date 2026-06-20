import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const budget = await checkBudget(supabase, user.id)
    if (!budget.ok) return new Response(JSON.stringify({ error: budgetExceededMessage(budget) }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

    const { image, text } = await req.json() as { image?: { base64: string; mime: string }; text?: string }

    let parts: unknown[]
    if (image) {
      const hint = text ? ` Подпись пользователя: "${text}".` : ''
      parts = [
        { text: `На фото — еда. Оцени блюдо и его пищевую ценность по виду и типичным порциям.${hint}\nВерни ТОЛЬКО JSON: {"dish":"название блюда на русском","calories":число,"protein_g":число,"carbs_g":число,"fat_g":число,"is_food":true|false}` },
        { inline_data: { mime_type: image.mime, data: image.base64 } },
      ]
    } else if (text?.trim()) {
      parts = [
        { text: `Пользователь написал что съел: "${text}".\nОцени калории и БЖУ по типичным порциям (напр. «бигмак и кола» ≈ 750 ккал, «овсянка 200г» ≈ 200 ккал).\nВерни ТОЛЬКО JSON: {"dish":"краткое название","calories":число,"protein_g":число,"carbs_g":число,"fat_g":число}` },
      ]
    } else {
      return new Response(JSON.stringify({ error: 'Provide image or text' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          // 256 не хватало gemini-2.5-flash: остаток «мышления» + кириллица в ответе
          // упирались в MAX_TOKENS, модель отдавала пустой parts → все поля null.
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    )
    if (!res.ok) throw new Error(`Gemini ${res.status}`)
    const data = await res.json()
    const tokens = data.usageMetadata?.totalTokenCount ?? 0
    const cand = data.candidates?.[0]
    const raw = cand?.content?.parts?.[0]?.text ?? '{}'
    const parsed = JSON.parse(raw)

    if (parsed.is_food === false) {
      return new Response(JSON.stringify({ error: 'not_food' }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Пустой/обрезанный ответ Gemini (при MAX_TOKENS parts приходит пустым) — раньше
    // это молча отдавало карточку со всеми null. Теперь возвращаем понятную ошибку.
    if (parsed.calories == null) {
      console.error('classify-meal: empty result', { finishReason: cand?.finishReason, tokens })
      return new Response(JSON.stringify({ error: 'Не удалось распознать блюдо — уточни описание и попробуй ещё раз.' }), { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    await supabase.from('ai_usage').insert({ user_id: user.id, source: 'meal-classify', tokens_used: tokens })

    return new Response(JSON.stringify({
      dish: parsed.dish ?? null,
      calories: parsed.calories ?? null,
      protein_g: parsed.protein_g ?? null,
      carbs_g: parsed.carbs_g ?? null,
      fat_g: parsed.fat_g ?? null,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? 'Error' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
