// AI pipeline: meal photos, voice transcription, natural-language logging and
// free-form chat (moved verbatim from index.ts in the B3 split).

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildHealthContext, healthContextToText } from '../_shared/healthContext.ts'
import { fetchWithTimeout } from '../_shared/http.ts'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'
import { getPrompt } from '../_shared/prompts.ts'
import { localToIso, localDate } from '../_shared/time.ts'
import { buildClassifyPrompt } from '../_shared/classifyPrompt.ts'
import {
  loadOwnedChatHistory,
  resolveOrCreateOwnedChatSession,
  type ChatHistoryClient,
  type SessionOwnershipClient,
} from '../_shared/chatSessionOwnership.ts'
import { fetchGeminiWithConsent, isAiConsentRequired } from '../_shared/aiConsent.ts'
import { tgCall, tgSend, tgTyping, tgFileUrl, mdToTgHtml } from './tg.ts'
import { MAIN_MENU, BACK_MENU } from './menus.ts'

export const AI_CONSENT_TELEGRAM_MESSAGE = '🔒 Чтобы использовать функции ИИ, открой Tonus → Настройки → Обработка данных ИИ и дай согласие.'

// ── AI chat (B3) ──────────────────────────────────────────────────────────────

export const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''

const CHAT_SYSTEM_PROMPT = `Ты — персональный ассистент по здоровью в Telegram. Отвечаешь на русском.
Помогаешь пользователю понять его данные здоровья простым языком.
Строгие правила:
- Никаких медицинских диагнозов. Только наблюдения по данным.
- Если есть тревожные значения — мягко советуй обратиться к врачу.
- Не выдумывай данные, которых нет в контексте.
- Ты НЕ умеешь записывать в дневник или базу. НИКОГДА не говори «записал/добавил/сохранил/зафиксировал». Если пользователь хочет что-то записать (еда, кофе, препарат, событие) — попроси написать это одной ясной фразой (напр. «съел 30 г шоколада») или прислать фото блюда; система запишет сама и пришлёт подтверждение «📸🍽 … Записал в дневник».
- Отвечай кратко (2-4 предложения), это мессенджер.
- Опирайся на личные тренды пользователя, не на абсолютные нормы.`

// ── Natural-language logging (приём препарата / событие из текста) ─────────────

// tzOffsetMin / localToIso / localDate вынесены в ../_shared/time.ts (тестируются vitest).

// Классифицирует свободный текст: это действие-лог или вопрос?
// Возвращает действие, либо null если это обычный вопрос (→ чат).
// Фото еды → оценка блюда, калорий и БЖУ через Gemini vision
interface MealEstimate {
  dish?: string | null; calories?: number | null
  protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null
  is_food?: boolean
}
export async function classifyMealPhoto(userId: string, supabase: SupabaseClient, base64: string, mime: string, caption: string): Promise<{ parsed: MealEstimate; tokens: number | null } | null> {
  if (!GEMINI_KEY) return null
  const prompt = `На фото — еда. Оцени блюдо и его пищевую ценность по виду и типичным порциям.${caption ? ` Подпись пользователя: "${caption}".` : ''}
Верни ТОЛЬКО JSON:
{
  "dish": "краткое название блюда на русском (напр. 'Паста с курицей')",
  "calories": целое число — оценка калорий,
  "protein_g": белки в граммах (число),
  "carbs_g": углеводы в граммах (число),
  "fat_g": жиры в граммах (число),
  "is_food": true если на фото действительно еда, иначе false
}
Если еды нет — is_food=false и остальное null. Не выдумывай точность, давай разумную оценку.`
  try {
    const res = await fetchGeminiWithConsent(
      supabase,
      userId,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 512, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const tokens = data.usageMetadata?.totalTokenCount ?? null
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    return { parsed: JSON.parse(raw), tokens }
  } catch (e) {
    if (isAiConsentRequired(e)) throw e
    return null
  }
}

// Голосовое/аудио → текст через Gemini (inline-аудио). Возвращает распознанную речь.
export async function transcribeVoice(userId: string, supabase: SupabaseClient, base64: string, mime: string): Promise<{ text: string; tokens: number | null } | null> {
  if (!GEMINI_KEY) return null
  const prompt = `Это голосовое сообщение пользователя приложения о здоровье (еда, самочувствие, привычки, вопросы). Точно транскрибируй речь в текст на языке оригинала (русский или украинский). Верни ТОЛЬКО распознанный текст — без пояснений, без кавычек.`
  try {
    const res = await fetchGeminiWithConsent(
      supabase,
      userId,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const tokens = data.usageMetadata?.totalTokenCount ?? null
    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    return { text: raw, tokens }
  } catch (e) {
    if (isAiConsentRequired(e)) throw e
    return null
  }
}

export async function handleMealPhoto(chatId: number | string, userId: string, fileId: string, caption: string, tz: string, supabase: SupabaseClient): Promise<void> {
  await tgTyping(chatId)
  // получить ссылку на файл и скачать
  const fileRes = await tgCall('getFile', { file_id: fileId })
  const filePath = fileRes?.result?.file_path
  if (!filePath) { await tgSend(chatId, 'Не удалось загрузить фото, попробуй ещё раз.'); return }
  const dl = await fetchWithTimeout(tgFileUrl(filePath), { retryOn5xx: true, timeoutMs: 30_000 })
  const buf = new Uint8Array(await dl.arrayBuffer())
  let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  const base64 = btoa(bin)
  const mime = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  let out: Awaited<ReturnType<typeof classifyMealPhoto>>
  try {
    out = await classifyMealPhoto(userId, supabase, base64, mime, caption)
  } catch (e) {
    if (!isAiConsentRequired(e)) throw e
    await tgSend(chatId, AI_CONSENT_TELEGRAM_MESSAGE, { reply_markup: BACK_MENU })
    return
  }
  if (out?.tokens) await supabase.from('ai_usage').insert({ user_id: userId, source: 'meal-photo', tokens_used: out.tokens })
  const r = out?.parsed
  if (!r || r.is_food === false) { await tgSend(chatId, '🤔 Не вижу еду на фото. Пришли фото блюда — оценю калории.'); return }

  const ts = localToIso(tz, null, null)
  const base = { user_id: userId, ts, type: 'meal', note: r.dish ?? (caption || 'Еда') }
  const withNutr = { ...base, calories: r.calories ?? null, protein_g: r.protein_g ?? null, carbs_g: r.carbs_g ?? null, fat_g: r.fat_g ?? null }
  const ins = await supabase.from('intake_events').insert(withNutr)
  if (ins.error) await supabase.from('intake_events').insert(base)

  const macros = [r.protein_g ? `Б ${Math.round(r.protein_g)}` : '', r.carbs_g ? `У ${Math.round(r.carbs_g)}` : '', r.fat_g ? `Ж ${Math.round(r.fat_g)}` : ''].filter(Boolean).join(' · ')
  await tgSend(chatId, `📸🍽 <b>${r.dish ?? 'Еда'}</b>\n≈ ${r.calories ?? '?'} ккал${macros ? ` (${macros} г)` : ''}\nЗаписал в дневник.`, { parse_mode: 'HTML', reply_markup: BACK_MENU })
}

// Разобранное действие-лог из свободного текста (форму диктует buildClassifyPrompt).
export interface ClassifiedAction {
  action: string
  supplement?: string | null; dose?: string | null
  date?: string | null; time?: string | null; minutes_ago?: number | null
  intake_type?: string | null; amount?: number | null; unit?: string | null; note?: string | null
  calories?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null
  coffee_in_meal?: boolean | null
}
export async function classifyLog(userId: string, supabase: SupabaseClient, text: string, supplementNames: string[], now: Date, tz: string): Promise<ClassifiedAction | null> {
  if (!GEMINI_KEY) return null
  const prompt = buildClassifyPrompt(text, supplementNames, now, tz)

  try {
    const res = await fetchGeminiWithConsent(
      supabase,
      userId,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 512, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    const parsed = JSON.parse(raw)
    return parsed?.action && parsed.action !== 'chat' ? parsed : null
  } catch (e) {
    if (isAiConsentRequired(e)) throw e
    return null
  }
}

// Выполняет распознанное действие. Возвращает текст подтверждения или null.
export async function execLog(chatId: number | string, userId: string, act: ClassifiedAction, tz: string, supabase: SupabaseClient, now: Date = new Date()): Promise<string | null> {
  if (act.action === 'supplement') {
    // нестрогий матч: точное ilike, иначе по началу слова
    // select без stock_count — колонка может отсутствовать в БД (иначе запрос падает)
    let sup: { id: string; name: string } | null = null
    if (act.supplement) {
      const { data: exact } = await supabase
        .from('supplements').select('id, name')
        .eq('user_id', userId).ilike('name', act.supplement).maybeSingle()
      sup = exact
      if (!sup) {
        const { data: like } = await supabase
          .from('supplements').select('id, name')
          .eq('user_id', userId).ilike('name', `${act.supplement.slice(0, 5)}%`).maybeSingle()
        sup = like
      }
    }
    if (!sup) {
      return `🤔 Не нашёл препарат «${act.supplement ?? '?'}» в твоём списке. Добавь его на сайте или проверь название.`
    }
    const today = localDate(tz)
    const date = (act.date && /^\d{4}-\d{2}-\d{2}$/.test(act.date)) ? act.date : today
    // уже отмечен в этот день?
    const { data: existing } = await supabase
      .from('supplement_logs')
      .select('taken').eq('user_id', userId).eq('supplement_id', sup.id).eq('date', date).maybeSingle()
    await supabase.from('supplement_logs').upsert(
      { user_id: userId, supplement_id: sup.id, date, taken: true, dose: act.dose ?? null },
      { onConflict: 'user_id,supplement_id,date' }
    )
    // списать из запаса — best-effort (колонки stock_count может не быть)
    let stockMsg = ''
    if (!existing?.taken) {
      try {
        const { data: cur } = await supabase
          .from('supplements').select('stock_count').eq('id', sup.id).maybeSingle()
        if (cur && typeof cur.stock_count === 'number') {
          const next = Math.max(0, cur.stock_count - 1)
          await supabase.from('supplements').update({ stock_count: next }).eq('id', sup.id)
          stockMsg = `\nОсталось в запасе: ${next} шт`
          if (next <= 7) stockMsg += ' ⚠️'
        }
      } catch { /* колонки нет — пропускаем списание */ }
    }
    const when = date === today ? 'на сегодня' : `за ${new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
    return `✅ <b>${sup.name}</b>${act.dose ? ` ${act.dose}` : ''} отмечен ${when}.${stockMsg}`
  }

  if (act.action === 'intake' && act.intake_type) {
    const labels: Record<string, string> = { coffee: '☕ Кофе', alcohol: '🍷 Алкоголь', meal: '🍽 Еда', water: '💧 Вода', meds: '💊 Лекарства', custom: '📝 Заметка' }
    const ts = localToIso(tz, act.time ?? null, act.date ?? null, { now, minutesAgo: act.minutes_ago })
    const isMeal = act.intake_type === 'meal'
    const base = { user_id: userId, ts, type: act.intake_type, amount: act.amount ?? null, unit: act.unit ?? null, note: act.note ?? null }
    const withNutr = { ...base, calories: isMeal ? act.calories ?? null : null, protein_g: isMeal ? act.protein_g ?? null : null, carbs_g: isMeal ? act.carbs_g ?? null : null, fat_g: isMeal ? act.fat_g ?? null : null }
    const ins = await supabase.from('intake_events').insert(withNutr)
    if (ins.error) await supabase.from('intake_events').insert(base) // фолбэк, если колонок ещё нет
    // кофе внутри еды → отдельная запись coffee (для модели кофеина)
    let coffeeNote = ''
    if (isMeal && act.coffee_in_meal) {
      await supabase.from('intake_events').insert({ user_id: userId, ts, type: 'coffee' })
      coffeeNote = '\n☕ Кофе записал отдельно.'
    }
    const timeStr = new Date(ts).toLocaleTimeString('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
    const extra = [act.amount ? `${act.amount}${act.unit ?? ''}` : '', act.note ?? ''].filter(Boolean).join(', ')
    let nutr = ''
    if (isMeal && act.calories) {
      const macros = [act.protein_g ? `Б ${Math.round(act.protein_g)}` : '', act.carbs_g ? `У ${Math.round(act.carbs_g)}` : '', act.fat_g ? `Ж ${Math.round(act.fat_g)}` : ''].filter(Boolean).join(' · ')
      nutr = `\n≈ ${act.calories} ккал${macros ? ` (${macros} г)` : ''}`
    }
    return `📝 Записал: ${labels[act.intake_type] ?? act.intake_type}${extra ? ` (${extra})` : ''} в ${timeStr}${nutr}${coffeeNote}`
  }

  return null
}

export async function buildBotContext(userId: string, supabase: SupabaseClient): Promise<string> {
  const ctx = await buildHealthContext(supabase, userId, { periodDays: 14, includeCoachProfile: true })
  return healthContextToText(ctx)
}

export async function handleAiChat(chatId: number | string, userId: string, text: string, sessionId: string | null, supabase: SupabaseClient): Promise<string | null> {
  // Resolve the untrusted link state before any early return. This lets a
  // budget-exceeded request repair a foreign/stale session without touching
  // health context or Gemini, and gives the production smoke a no-egress path.
  const { id: sid } = await resolveOrCreateOwnedChatSession(
    supabase as unknown as SessionOwnershipClient,
    sessionId,
    userId,
  )
  if (!GEMINI_KEY) {
    await tgSend(chatId, 'Выбери действие:', { reply_markup: MAIN_MENU })
    return sid
  }
  const budget = await checkBudget(supabase, userId)
  if (!budget.ok) {
    await tgSend(chatId, budgetExceededMessage(budget))
    return sid
  }
  await tgTyping(chatId)

  // Save user message
  await supabase.from('chat_messages').insert({ user_id: userId, session_id: sid, role: 'user', content: text })

  // Recent history (last 6)
  const { data: hist, error: historyErr } = await loadOwnedChatHistory(
    supabase as unknown as ChatHistoryClient,
    sid,
    userId,
    6,
  )
  if (historyErr) throw new Error('Chat history lookup failed')
  const recent = ((hist ?? []) as { role: string; content: string }[]).reverse()

  const context = await buildBotContext(userId, supabase)
  const sys = await getPrompt(supabase, 'telegram-chat-system', CHAT_SYSTEM_PROMPT)

  const contents = [
    { role: 'user', parts: [{ text: `${sys.text}\n\n${context}` }] },
    { role: 'model', parts: [{ text: 'Понял, готов отвечать по данным.' }] },
    ...recent.slice(0, -1).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text }] },
  ]

  try {
    const res = await fetchGeminiWithConsent(
      supabase,
      userId,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: 2048, temperature: 0.5, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    )
    if (!res.ok) {
      await tgSend(chatId, '❌ Не удалось получить ответ от ИИ. Попробуй позже.', { reply_markup: BACK_MENU })
      return sid
    }
    const data = await res.json()
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Не удалось сформулировать ответ.'
    const tokens = data.usageMetadata?.totalTokenCount ?? null

    await supabase.from('chat_messages').insert({ user_id: userId, session_id: sid, role: 'assistant', content: reply, tokens_used: tokens })
    if (tokens) {
      await supabase.from('ai_usage').insert({ user_id: userId, source: 'chat', tokens_used: tokens, prompt_version: sys.version })
    }

    await tgSend(chatId, mdToTgHtml(reply), { parse_mode: 'HTML', reply_markup: BACK_MENU })
  } catch (e) {
    if (isAiConsentRequired(e)) {
      await tgSend(chatId, AI_CONSENT_TELEGRAM_MESSAGE, { reply_markup: BACK_MENU })
      return sid
    }
    await tgSend(chatId, '❌ Ошибка ИИ. Попробуй позже.', { reply_markup: BACK_MENU })
  }
  return sid
}