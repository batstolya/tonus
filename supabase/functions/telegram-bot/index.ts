import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildHealthContext, healthContextToText } from '../_shared/healthContext.ts'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'
import { getPrompt } from '../_shared/prompts.ts'
import { localToIso, localDate } from '../_shared/time.ts'
import { buildClassifyPrompt } from '../_shared/classifyPrompt.ts'

const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''

// ── Telegram API helpers ──────────────────────────────────────────────────────

async function tgCall(method: string, body: Record<string, any>) {
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function tgSend(chatId: number | string, text: string, extra: Record<string, any> = {}) {
  return tgCall('sendMessage', { chat_id: chatId, text, ...extra })
}

// Конвертирует markdown ответа ИИ (Gemini пишет **жирным**, * списками) в Telegram-HTML.
// Только парные **…** / __…__ → <b> (нет незакрытых тегов → нет ошибок 400 от Telegram).
function mdToTgHtml(s: string): string {
  let t = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')   // экранируем спецсимволы
  t = t.replace(/^[ \t]*[*-] +/gm, '• ')                                          // пункты "* " / "- " → "• "
  t = t.replace(/^#{1,6}[ \t]+(.+)$/gm, '<b>$1</b>')                              // заголовки # → жирная строка
  t = t.replace(/\*\*([^\n]+?)\*\*/g, '<b>$1</b>').replace(/__([^\n]+?)__/g, '<b>$1</b>') // жирный (парный)
  t = t.replace(/`([^`\n]+?)`/g, '<code>$1</code>')                              // инлайн-код
  return t
}

async function tgEdit(chatId: number | string, messageId: number, text: string, extra: Record<string, any> = {}) {
  return tgCall('editMessageText', { chat_id: chatId, message_id: messageId, text, ...extra })
}

async function tgAnswerCallback(callbackQueryId: string, text?: string) {
  return tgCall('answerCallbackQuery', { callback_query_id: callbackQueryId, text })
}

async function tgTyping(chatId: number | string) {
  return tgCall('sendChatAction', { chat_id: chatId, action: 'typing' })
}

// ── Keyboard builders ─────────────────────────────────────────────────────────

const MAIN_MENU = {
  inline_keyboard: [
    [{ text: '📊 Отчёт за 2 недели', callback_data: 'report' }, { text: '📈 Статус сегодня', callback_data: 'status' }],
    [{ text: '💊 Препараты', callback_data: 'supplements' }, { text: '🎯 Цели', callback_data: 'goals' }],
    [{ text: '⚙️ Настройки', callback_data: 'settings' }],
  ],
}

const REPORT_ACTIONS = {
  inline_keyboard: [
    [{ text: '🔄 Обновить отчёт', callback_data: 'report' }, { text: '📈 Статус сегодня', callback_data: 'status' }],
    [{ text: '🏠 Главное меню', callback_data: 'menu' }],
  ],
}

const STATUS_ACTIONS = {
  inline_keyboard: [
    [{ text: '📊 Полный отчёт', callback_data: 'report' }],
    [{ text: '🏠 Главное меню', callback_data: 'menu' }],
  ],
}

const BACK_MENU = {
  inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'menu' }]],
}

// ── Setup bot commands (called once on startup) ───────────────────────────────

async function setupCommands() {
  await tgCall('setMyCommands', {
    commands: [
      { command: 'menu', description: '🏠 Главное меню' },
      { command: 'report', description: '📊 Двухнедельный отчёт' },
      { command: 'status', description: '📈 Статус за сегодня' },
      { command: 'sync', description: '📲 Дата последней синхронизации' },
      { command: 'pause', description: '⏸ Приостановить отчёты' },
      { command: 'resume', description: '▶️ Возобновить отчёты' },
      { command: 'usage', description: '🤖 Лимиты Claude' },
      { command: 'tokens', description: '✨ Токены Gemini' },
      { command: 'idea', description: '💡 Записать идею' },
      { command: 'ideas', description: '💡 Список идей' },
    ],
  })
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleReport(chatId: number | string, userId: string, supabase: any, msgId?: number) {
  await tgTyping(chatId)
  const reportRes = await fetch(`${SUPABASE_URL}/functions/v1/biweekly-report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'x-user-id': userId,
    },
  })
  if (!reportRes.ok) {
    await tgSend(chatId, '❌ Не удалось сгенерировать отчёт. Попробуй позже.', { reply_markup: BACK_MENU })
  }
  // biweekly-report sends the Telegram message itself with content
  // We just add action buttons in a follow-up
  if (reportRes.ok) {
    await tgSend(chatId, '↑ Что хочешь сделать дальше?', { reply_markup: REPORT_ACTIONS })
  }
}

async function handleStatus(chatId: number | string, userId: string, supabase: any) {
  await tgTyping(chatId)
  const week = new Date(); week.setDate(week.getDate() - 7)
  const { data: rows } = await supabase
    .from('daily_metrics')
    .select('date, resting_heart_rate, hrv, sleep_hours, steps')
    .eq('user_id', userId)
    .gte('date', week.toISOString().slice(0, 10))
    .order('date', { ascending: false })

  if (!rows?.length) {
    await tgSend(chatId, '📭 Нет данных за последнюю неделю.', { reply_markup: BACK_MENU })
    return
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  const rhr = rows.map((r: any) => r.resting_heart_rate).filter(Boolean)
  const hrv = rows.map((r: any) => r.hrv).filter(Boolean)
  const sleep = rows.map((r: any) => r.sleep_hours).filter(Boolean)
  const steps = rows.map((r: any) => r.steps).filter(Boolean)

  const lines = ['📈 Статус за 7 дней', '']
  if (rhr.length) lines.push(`❤️ ЧСС покоя: ${avg(rhr)!.toFixed(0)} уд/мин`)
  if (hrv.length) lines.push(`💚 HRV: ${avg(hrv)!.toFixed(0)} мс`)
  if (sleep.length) lines.push(`😴 Сон: ${avg(sleep)!.toFixed(1)} ч/ночь`)
  if (steps.length) lines.push(`👟 Шаги: ${Math.round(avg(steps)!).toLocaleString()}/день`)
  lines.push('', `Данных за период: ${rows.length} дн.`)

  await tgSend(chatId, lines.join('\n'), { reply_markup: STATUS_ACTIONS })
}

// ── AI chat (B3) ──────────────────────────────────────────────────────────────

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''

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
async function classifyMealPhoto(base64: string, mime: string, caption: string): Promise<any | null> {
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
    const res = await fetch(
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
  } catch { return null }
}

async function handleMealPhoto(chatId: number | string, userId: string, fileId: string, caption: string, tz: string, supabase: any): Promise<void> {
  await tgTyping(chatId)
  // получить ссылку на файл и скачать
  const fileRes = await tgCall('getFile', { file_id: fileId })
  const filePath = fileRes?.result?.file_path
  if (!filePath) { await tgSend(chatId, 'Не удалось загрузить фото, попробуй ещё раз.'); return }
  const dl = await fetch(`https://api.telegram.org/file/bot${TG_TOKEN}/${filePath}`)
  const buf = new Uint8Array(await dl.arrayBuffer())
  let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  const base64 = btoa(bin)
  const mime = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  const out = await classifyMealPhoto(base64, mime, caption)
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

async function classifyLog(text: string, supplementNames: string[], now: Date, tz: string): Promise<any | null> {
  if (!GEMINI_KEY) return null
  const prompt = buildClassifyPrompt(text, supplementNames, now, tz)

  try {
    const res = await fetch(
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
  } catch { return null }
}

// Выполняет распознанное действие. Возвращает текст подтверждения или null.
async function execLog(chatId: number | string, userId: string, act: any, tz: string, supabase: any, now: Date = new Date()): Promise<string | null> {
  if (act.action === 'supplement') {
    // нестрогий матч: точное ilike, иначе по началу слова
    // select без stock_count — колонка может отсутствовать в БД (иначе запрос падает)
    let sup: any = null
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
    const ts = localToIso(tz, act.time, act.date, { now, minutesAgo: act.minutes_ago })
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

async function buildBotContext(userId: string, supabase: any): Promise<string> {
  const ctx = await buildHealthContext(supabase, userId, { periodDays: 14, includeCoachProfile: true })
  return healthContextToText(ctx)
}

async function handleAiChat(chatId: number | string, userId: string, text: string, sessionId: string | null, supabase: any): Promise<string | null> {
  if (!GEMINI_KEY) {
    await tgSend(chatId, 'Выбери действие:', { reply_markup: MAIN_MENU })
    return sessionId
  }
  const budget = await checkBudget(supabase, userId)
  if (!budget.ok) {
    await tgSend(chatId, budgetExceededMessage(budget))
    return sessionId
  }
  await tgTyping(chatId)

  // Ensure a session exists
  let sid = sessionId
  if (!sid) {
    const { data: sess } = await supabase
      .from('chat_sessions')
      .insert({ user_id: userId })
      .select('id')
      .single()
    sid = sess?.id ?? null
  }

  // Save user message
  if (sid) {
    await supabase.from('chat_messages').insert({ user_id: userId, session_id: sid, role: 'user', content: text })
  }

  // Recent history (last 6)
  const { data: hist } = sid ? await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sid)
    .order('created_at', { ascending: false })
    .limit(6) : { data: [] }
  const recent = (hist ?? []).reverse()

  const context = await buildBotContext(userId, supabase)
  const sys = await getPrompt(supabase, 'telegram-chat-system', CHAT_SYSTEM_PROMPT)

  const contents = [
    { role: 'user', parts: [{ text: `${sys.text}\n\n${context}` }] },
    { role: 'model', parts: [{ text: 'Понял, готов отвечать по данным.' }] },
    ...recent.slice(0, -1).map((m: any) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text }] },
  ]

  try {
    const res = await fetch(
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

    if (sid) {
      await supabase.from('chat_messages').insert({ user_id: userId, session_id: sid, role: 'assistant', content: reply, tokens_used: tokens })
    }
    if (tokens) {
      await supabase.from('ai_usage').insert({ user_id: userId, source: 'chat', tokens_used: tokens, prompt_version: sys.version })
    }

    await tgSend(chatId, mdToTgHtml(reply), { parse_mode: 'HTML', reply_markup: BACK_MENU })
  } catch (_e) {
    await tgSend(chatId, '❌ Ошибка ИИ. Попробуй позже.', { reply_markup: BACK_MENU })
  }
  return sid
}

async function handleSupplements(chatId: number | string, userId: string, supabase: any) {
  await tgTyping(chatId)
  const today = new Date().toISOString().slice(0, 10)
  const { data: sups } = await supabase
    .from('supplements')
    .select('id, name, default_dose, unit')
    .eq('user_id', userId)
    .eq('active', true)

  if (!sups?.length) {
    await tgSend(chatId, '💊 Препараты не добавлены. Добавь их в разделе Препараты на сайте.', { reply_markup: BACK_MENU })
    return
  }

  const { data: logs } = await supabase
    .from('supplement_logs')
    .select('supplement_id, taken')
    .eq('user_id', userId)
    .eq('date', today)

  const takenSet = new Set((logs ?? []).filter((l: any) => l.taken).map((l: any) => l.supplement_id))

  const lines = [`💊 Препараты на сегодня (${today})`, '']
  for (const s of sups) {
    const taken = takenSet.has(s.id)
    const dose = s.default_dose ? ` ${s.default_dose}${s.unit ? ' ' + s.unit : ''}` : ''
    lines.push(`${taken ? '✅' : '⬜'} ${s.name}${dose}`)
  }

  const notTaken = sups.filter((s: any) => !takenSet.has(s.id))
  const keyboard = {
    inline_keyboard: [
      ...notTaken.map((s: any) => [{
        text: `✓ Принял ${s.name}`,
        callback_data: `take_${s.id}`,
      }]),
      [{ text: '🏠 Главное меню', callback_data: 'menu' }],
    ],
  }

  await tgSend(chatId, lines.join('\n'), { reply_markup: keyboard })
}

async function handleGoals(chatId: number | string, userId: string, supabase: any) {
  await tgTyping(chatId)
  const { data: goals } = await supabase
    .from('goals')
    .select('id, title, metric, target_value, end_date, status')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (!goals?.length) {
    await tgSend(chatId, '🎯 Активных целей нет. Создай их на сайте в разделе Коуч → Цели.', { reply_markup: BACK_MENU })
    return
  }

  const lines = ['🎯 Активные цели', '']
  for (const g of goals) {
    lines.push(`• ${g.title} → ${g.target_value} (до ${g.end_date})`)
  }

  await tgSend(chatId, lines.join('\n'), { reply_markup: BACK_MENU })
}

async function handleSettings(chatId: number | string, userId: string, supabase: any) {
  const { data: settings } = await supabase
    .from('report_settings')
    .select('paused, frequency_days')
    .eq('user_id', userId)
    .single()

  const paused = settings?.paused ?? false
  const freq = settings?.frequency_days ?? 14

  const keyboard = {
    inline_keyboard: [
      [{ text: paused ? '▶️ Включить автоотчёты' : '⏸ Приостановить автоотчёты', callback_data: paused ? 'resume' : 'pause' }],
      [{ text: '🔌 Отключить Telegram', callback_data: 'disconnect' }],
      [{ text: '🏠 Главное меню', callback_data: 'menu' }],
    ],
  }

  await tgSend(chatId,
    `⚙️ Настройки\n\nАвтоотчёты: ${paused ? '⏸ на паузе' : '▶️ активны'}\nЧастота: каждые ${freq} дней\n\n⚠️ Сообщения в Telegram не end-to-end зашифрованы.`,
    { reply_markup: keyboard }
  )
}

async function checkStaleness(chatId: number | string, userId: string, supabase: any) {
  const { data: lastImport } = await supabase
    .from('imports')
    .select('imported_at')
    .eq('user_id', userId)
    .order('imported_at', { ascending: false })
    .limit(1)
    .single()
  if (lastImport) {
    const days = Math.floor((Date.now() - new Date(lastImport.imported_at).getTime()) / 86400000)
    if (days >= 7) {
      await tgSend(chatId, `📲 Данные не обновлялись ${days} дн. Для точных данных загрузи свежий экспорт в Tonus (/sync — подробнее).`)
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {

  const body = await req.json().catch(() => null)
  if (!body) return new Response('ok')

  // Setup commands on every request (idempotent, fast)
  setupCommands().catch(() => {})

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // ── Handle callback_query (button presses) ──────────────────────────────────
  if (body.callback_query) {
    const cq = body.callback_query
    const chatId = cq.message.chat.id
    const data = cq.data as string

    await tgAnswerCallback(cq.id)

    const { data: link } = await supabase
      .from('telegram_links')
      .select('user_id')
      .eq('telegram_chat_id', String(chatId))
      .single()

    if (!link) {
      await tgSend(chatId, '❓ Аккаунт не найден. Подключи Telegram в настройках Tonus.')
      return new Response('ok')
    }

    const userId = link.user_id

    if (data === 'menu') {
      await tgSend(chatId, '🏠 Главное меню', { reply_markup: MAIN_MENU })
    } else if (data === 'report') {
      await tgSend(chatId, '⏳ Генерирую отчёт, подожди немного…')
      await handleReport(chatId, userId, supabase)
    } else if (data === 'status') {
      await handleStatus(chatId, userId, supabase)
    } else if (data === 'supplements') {
      await handleSupplements(chatId, userId, supabase)
    } else if (data === 'goals') {
      await handleGoals(chatId, userId, supabase)
    } else if (data === 'settings') {
      await handleSettings(chatId, userId, supabase)
    } else if (data === 'pause') {
      await supabase.from('report_settings').upsert({ user_id: userId, paused: true }, { onConflict: 'user_id' })
      await tgSend(chatId, '⏸ Автоотчёты приостановлены.', { reply_markup: BACK_MENU })
    } else if (data === 'resume') {
      await supabase.from('report_settings').upsert({ user_id: userId, paused: false }, { onConflict: 'user_id' })
      await tgSend(chatId, '▶️ Автоотчёты возобновлены.', { reply_markup: BACK_MENU })
    } else if (data === 'disconnect') {
      await supabase.from('telegram_links').update({ status: 'paused' }).eq('user_id', userId)
      await tgSend(chatId, '🔌 Telegram отключён от Tonus. Для повторного подключения зайди в настройки приложения.')
    } else if (data.startsWith('wb:')) {
      const [, date, scoreStr] = data.split(':')
      const score = Number(scoreStr)
      if (date && score >= 1 && score <= 5) {
        await supabase.from('context_notes').upsert(
          { user_id: userId, date, wellbeing: score, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,date' }
        )
        await tgSend(chatId, `🙂 Записал самочувствие: ${score}/5 за ${date}.`)
      }
    } else if (data.startsWith('take_')) {
      const supId = data.replace('take_', '')
      const today = new Date().toISOString().slice(0, 10)
      await supabase.from('supplement_logs').upsert(
        { user_id: userId, supplement_id: supId, date: today, taken: true },
        { onConflict: 'user_id,supplement_id,date' }
      )
      const { data: sup } = await supabase.from('supplements').select('name').eq('id', supId).single()
      await tgSend(chatId, `✅ ${sup?.name ?? 'Препарат'} отмечен как принятый сегодня.`, { reply_markup: BACK_MENU })
    } else if (data.startsWith('rem_take_') || data.startsWith('rem_snz_') || data.startsWith('rem_skip_')) {
      // ── Напоминание о приёме: принял / отложить / пропустить ──
      // Во всех ветках РЕДАКТИРУЕМ исходное сообщение (без reply_markup → кнопки
      // убираются), чтобы его нельзя было нажать повторно и плодить дубли ответов.
      const msgId = cq.message.message_id as number
      const resolve = (text: string) => tgEdit(chatId, msgId, text, { parse_mode: 'HTML' })

      let action: 'take' | 'snz' | 'skip' = 'take'
      let evId = ''
      let mins = 60
      if (data.startsWith('rem_skip_')) { action = 'skip'; evId = data.replace('rem_skip_', '') }
      else if (data.startsWith('rem_snz_')) {
        action = 'snz'
        const rest = data.replace('rem_snz_', '')
        const idx = rest.lastIndexOf('_')
        evId = rest.slice(0, idx)
        mins = parseInt(rest.slice(idx + 1), 10) || 60
      } else { evId = data.replace('rem_take_', '') }

      const { data: ev } = await supabase
        .from('reminder_events')
        .select('status, supplement_id, due_at, supplements(name)')
        .eq('id', evId).eq('user_id', userId).maybeSingle()
      const name = (ev?.supplements as any)?.name ?? 'Препарат'
      const now = new Date().toISOString()

      if (!ev) {
        await resolve('⚠️ Напоминание не найдено.')
      } else if (ev.status === 'taken' || ev.status === 'skipped') {
        // уже обработано (повторное нажатие) — просто убираем кнопки, без новых записей
        await resolve(`${ev.status === 'taken' ? '✅' : '⏭'} <b>${name}</b> — уже отмечено сегодня.`)
      } else if (action === 'take') {
        const today = now.slice(0, 10)
        await supabase.from('supplement_logs').upsert(
          { user_id: userId, supplement_id: ev.supplement_id, date: today, taken: true },
          { onConflict: 'user_id,supplement_id,date' }
        )
        await supabase.from('reminder_events').update({ status: 'taken', responded_at: now }).eq('id', evId)
        await resolve(`✅ <b>${name}</b> — принято. Молодец!`)
      } else if (action === 'snz') {
        // R4: предел переносов — не дальше 4ч от исходной дозы
        const until = new Date(Date.now() + mins * 60000)
        const deadline = ev.due_at ? new Date(ev.due_at).getTime() + 4 * 3600 * 1000 : Infinity
        if (until.getTime() > deadline) {
          await supabase.from('reminder_events').update({ status: 'skipped', responded_at: now }).eq('id', evId)
          await resolve(`⏭ <b>${name}</b> — лимит переносов исчерпан, пропущено на сегодня.`)
        } else {
          await supabase.from('reminder_events').update({ status: 'snoozed', snooze_until: until.toISOString() }).eq('id', evId)
          await resolve(`⏰ <b>${name}</b> — напомню через ${mins >= 120 ? '2 часа' : '1 час'}.`)
        }
      } else {
        await supabase.from('reminder_events').update({ status: 'skipped', responded_at: now }).eq('id', evId)
        await resolve(`⏭ <b>${name}</b> — пропущено на сегодня.`)
      }
    } else if (data.startsWith('nudge_acc:')) {
      // Коуч: пользователь берёт совет в работу → ставим follow-up через 5 дней
      const subtype = data.replace('nudge_acc:', '')
      const metric = subtype === 'late_coffee' ? 'sleep_hours' : 'hrv' // что отслеживаем
      const { data: score } = await supabase
        .from('daily_scores').select('hrv_baseline, sleep_baseline')
        .eq('user_id', userId).order('date', { ascending: false }).limit(1).maybeSingle()
      const baseline = metric === 'sleep_hours' ? score?.sleep_baseline ?? null : score?.hrv_baseline ?? null
      await supabase.from('coach_events').insert({
        user_id: userId, type: 'followup', status: 'open',
        payload: { subtype, metric, baseline, due: new Date(Date.now() + 5 * 86400000).toISOString() },
      })
      await tgSend(chatId, '👍 Беру на заметку — проверю через несколько дней, как отзовётся, и вернусь с результатом.')
    } else if (data === 'nudge_no') {
      await tgSend(chatId, 'Окей, без давления 🙂')
    }

    return new Response('ok')
  }

  // ── Handle regular messages ─────────────────────────────────────────────────
  const msg = body.message ?? body.edited_message
  if (!msg) return new Response('ok')

  const chatId = msg.chat.id
  const text = (msg.text ?? '').trim()
  const username = msg.from?.username ?? null

  // /start <token> — link account
  if (text.startsWith('/start')) {
    const token = text.split(' ')[1] ?? ''

    if (!token) {
      await tgSend(chatId,
        '👋 Привет! Чтобы подключить Telegram к Tonus, открой настройки в приложении и нажми «Подключить Telegram».'
      )
      return new Response('ok')
    }

    const { data: lt } = await supabase
      .from('telegram_link_tokens')
      .select('user_id, expires_at')
      .eq('token', token)
      .single()

    if (!lt || new Date(lt.expires_at) < new Date()) {
      await tgSend(chatId, '❌ Ссылка недействительна или устарела. Попробуй снова в настройках приложения.')
      return new Response('ok')
    }

    await supabase.from('telegram_links').upsert({
      user_id: lt.user_id,
      telegram_chat_id: String(chatId),
      telegram_username: username,
      status: 'active',
    }, { onConflict: 'user_id' })

    await supabase.from('telegram_link_tokens').delete().eq('token', token)

    await tgSend(chatId,
      '✅ Telegram успешно подключён к Tonus!\n\nВыбери что тебя интересует:',
      { reply_markup: MAIN_MENU }
    )
    return new Response('ok')
  }

  // Find user by telegram chat id
  const { data: link } = await supabase
    .from('telegram_links')
    .select('user_id, status, tg_session_id, awaiting_note_date')
    .eq('telegram_chat_id', String(chatId))
    .single()

  if (!link) {
    await tgSend(chatId, '❓ Аккаунт не найден. Подключи Telegram в настройках Tonus.')
    return new Response('ok')
  }

  const userId = link.user_id

  // Фото еды → оценка калорий
  if (Array.isArray(msg.photo) && msg.photo.length) {
    const budget = await checkBudget(supabase, userId)
    if (!budget.ok) { await tgSend(chatId, budgetExceededMessage(budget)); return new Response('ok') }
    const largest = msg.photo[msg.photo.length - 1] // самое большое разрешение
    const { data: noteSet } = await supabase.from('daily_note_settings').select('timezone').eq('user_id', userId).maybeSingle()
    const tz = noteSet?.timezone || 'Europe/Kyiv'
    await handleMealPhoto(chatId, userId, largest.file_id, msg.caption ?? '', tz, supabase)
    return new Response('ok')
  }

  // /menu
  if (text === '/menu' || text === '/start') {
    await tgSend(chatId, '🏠 Главное меню', { reply_markup: MAIN_MENU })
    return new Response('ok')
  }

  // /report
  if (text === '/report') {
    await checkStaleness(chatId, userId, supabase)
    await tgSend(chatId, '⏳ Генерирую отчёт, подожди немного…')
    await handleReport(chatId, userId, supabase)
    return new Response('ok')
  }

  // /status
  if (text === '/status') {
    await checkStaleness(chatId, userId, supabase)
    await handleStatus(chatId, userId, supabase)
    return new Response('ok')
  }

  // /last
  if (text === '/last') {
    const { data: rep } = await supabase
      .from('scheduled_reports')
      .select('content, period_start, period_end')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!rep) {
      await tgSend(chatId, '📭 Отчётов пока нет. Используй /report чтобы сгенерировать первый.', { reply_markup: BACK_MENU })
    } else {
      await tgSend(chatId, `📊 Отчёт ${rep.period_start} — ${rep.period_end}\n\n${rep.content}`, { reply_markup: REPORT_ACTIONS })
    }
    return new Response('ok')
  }

  // /sync
  if (text === '/sync') {
    const { data: lastImport } = await supabase
      .from('imports')
      .select('imported_at')
      .eq('user_id', userId)
      .order('imported_at', { ascending: false })
      .limit(1)
      .single()

    if (!lastImport) {
      await tgSend(chatId, '📭 Данные ещё не загружались.\n\nЧтобы загрузить:\n1. Открой Здоровье на iPhone\n2. Фото профиля → Экспорт данных\n3. Загрузи export.zip в Tonus', { reply_markup: BACK_MENU })
    } else {
      const d = new Date(lastImport.imported_at)
      const days = Math.floor((Date.now() - d.getTime()) / 86400000)
      const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
      const freshness = days === 0 ? '✅ данные актуальны' : days < 7 ? `✅ ${days} дн. назад` : `⚠️ ${days} дн. назад — стоит обновить`
      await tgSend(chatId,
        `📲 Последняя синхронизация: ${dateStr}\n${freshness}\n\nЧтобы обновить:\n1. Здоровье → Фото профиля → Экспорт данных\n2. Загрузи export.zip в Tonus`,
        { reply_markup: BACK_MENU }
      )
    }
    return new Response('ok')
  }

  // /pause / /resume
  if (text === '/pause') {
    await supabase.from('report_settings').upsert({ user_id: userId, paused: true }, { onConflict: 'user_id' })
    await tgSend(chatId, '⏸ Автоотчёты приостановлены.', { reply_markup: BACK_MENU })
    return new Response('ok')
  }
  if (text === '/resume') {
    await supabase.from('report_settings').upsert({ user_id: userId, paused: false }, { onConflict: 'user_id' })
    await tgSend(chatId, '▶️ Автоотчёты возобновлены.', { reply_markup: BACK_MENU })
    return new Response('ok')
  }

  // /tokens — Gemini token usage this month
  if (text === '/tokens') {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { data: rows } = await supabase
      .from('ai_usage')
      .select('source, tokens_used')
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString())

    if (!rows || rows.length === 0) {
      await tgSend(chatId, '📭 В этом месяце токены ещё не использовались.', { reply_markup: BACK_MENU })
      return new Response('ok')
    }

    const SOURCE_LABELS: Record<string, string> = {
      chat: '💬 Чат',
      analyze: '🔍 Анализ',
      'extract-lab': '🔬 OCR анализов',
      'biweekly-report': '📊 Отчёты',
    }
    const COST_PER_1M = 0.30

    const bySource: Record<string, number> = {}
    let total = 0
    for (const r of rows) {
      const t = r.tokens_used ?? 0
      bySource[r.source] = (bySource[r.source] ?? 0) + t
      total += t
    }
    const cost = (total / 1_000_000) * COST_PER_1M

    function bar(pct: number, width = 6): string {
      const filled = Math.round(pct / 100 * width)
      return '🟦'.repeat(filled) + '⬜'.repeat(width - filled)
    }

    const monthName = new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    const lines = Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .map(([src, t]) => {
        const pct = total > 0 ? (t / total) * 100 : 0
        return `${SOURCE_LABELS[src] ?? src}\n${bar(pct)} ${pct.toFixed(0)}% · ${t.toLocaleString('ru-RU')}`
      })
      .join('\n\n')

    await tgSend(chatId,
      `✨ *Gemini — ${monthName}*\n\n` +
      `${lines}\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `*Всего:* ${total.toLocaleString('ru-RU')} токенов · *$${cost.toFixed(3)}*`,
      { parse_mode: 'Markdown', reply_markup: BACK_MENU }
    )
    return new Response('ok')
  }

  // /usage — Claude usage stats
  if (text === '/usage') {
    // Read cached usage data written by local monitor
    const { data: usageRow, error: usageErr } = await supabase
      .from('claude_usage')
      .select('*')
      .eq('id', 1)
      .single()

    if (usageErr || !usageRow) {
      await tgSend(chatId, '❌ Нет данных. Убедись что monitor.py запущен локально.', { reply_markup: BACK_MENU })
      return new Response('ok')
    }

    function bar(pct: number, width = 10): string {
      const filled = Math.round(pct / 100 * width)
      return '█'.repeat(filled) + '░'.repeat(width - filled)
    }
    function fmtTime(iso: string): string {
      const secs = Math.floor((new Date(iso).getTime() - Date.now()) / 1000)
      if (secs <= 0) return 'истёк (вероятно сброшен)'
      const h = Math.floor(secs / 3600)
      const m = Math.floor((secs % 3600) / 60)
      return h > 0 ? `${h}ч ${String(m).padStart(2, '0')}м` : `${m}м`
    }

    const sPct: number = usageRow.session_pct ?? 0
    const wPct: number = usageRow.weekly_pct ?? 0
    const sLine = usageRow.session_resets_at
      ? `${bar(sPct)} ${sPct.toFixed(0)}% · сброс через *${fmtTime(usageRow.session_resets_at)}*`
      : `${bar(sPct)} ${sPct.toFixed(0)}%`
    const wLine = usageRow.weekly_resets_at
      ? `${bar(wPct)} ${wPct.toFixed(0)}% · сброс через *${fmtTime(usageRow.weekly_resets_at)}*`
      : `${bar(wPct)} ${wPct.toFixed(0)}%`

    const ageMin = Math.floor((Date.now() - new Date(usageRow.updated_at).getTime()) / 60000)
    const ageStr = ageMin === 0 ? 'только что' : ageMin < 60 ? `${ageMin} мин назад` : `${Math.floor(ageMin / 60)}ч ${ageMin % 60}м назад`
    // монитор обновляет раз в минуту; >15 мин = он не запущен и цифры могут быть неактуальны
    const stale = ageMin > 15
    const header = stale
      ? `⚠️ *Данные неактуальны* (обновлено ${ageStr}).\nЛокальный монитор не запущен — это последний снимок. Запусти monitor.py для свежих цифр.\n\n`
      : ''
    const footer = stale ? '' : `\n\n_обновлено ${ageStr}_`
    await tgSend(chatId,
      header +
      `🤖 *Лимиты Claude*\n\n` +
      `*Сессия (5ч)*\n${sLine}\n\n` +
      `*Неделя*\n${wLine}` +
      footer,
      { parse_mode: 'Markdown', reply_markup: BACK_MENU }
    )
    return new Response('ok')
  }

  // Идеи: личный «ящик» заметок по проекту (не показывается на сайте)
  if (text === '/ideas') {
    const { data: ideas } = await supabase
      .from('ideas')
      .select('text, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (!ideas || ideas.length === 0) {
      await tgSend(chatId, '💡 Идей пока нет. Добавь: /idea твоя идея', { reply_markup: BACK_MENU })
      return new Response('ok')
    }
    const fmt = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    const lines = ideas.map((it: any, i: number) => `${i + 1}. ${it.text}  (${fmt(it.created_at)})`)
    await tgSend(chatId, `💡 Твои идеи (${ideas.length}):\n\n${lines.join('\n')}`, { reply_markup: BACK_MENU })
    return new Response('ok')
  }
  if (text === '/idea' || text.startsWith('/idea ')) {
    const idea = text.slice('/idea'.length).trim()
    if (!idea) {
      await tgSend(chatId, '✍️ Напиши текст после команды, например:\n/idea добавить график веса')
      return new Response('ok')
    }
    const { error } = await supabase.from('ideas').insert({ user_id: userId, text: idea })
    await tgSend(chatId, error ? '❌ Не удалось сохранить, попробуй ещё раз.' : '💡 Записал. Все идеи — /ideas', { reply_markup: BACK_MENU })
    return new Response('ok')
  }

  // Commands start with "/" but unknown → show menu
  if (text.startsWith('/')) {
    await tgSend(chatId, 'Выбери действие:', { reply_markup: MAIN_MENU })
    return new Response('ok')
  }

  // Естественный ввод идеи: «идея ...», «запиши идею ...», «добавь в идею ...»
  // (команда /idea обрабатывается выше; здесь — свободный текст, чтобы идея реально сохранялась,
  //  а не «терялась» в ИИ-чате, который раньше выдумывал подтверждение «📝 Записал»).
  // Без \b: в JS он только по ASCII и для кириллицы не работает — опираемся на [ияю] и якорь ^.
  const ideaMatch = text.match(/^\s*(?:(?:запиши|сохрани|добавь|добавить|как|в|новая|новую)\s+){0,3}иде[ияю]\s*[:;,.\-—]?\s*([\s\S]*)$/i)
  if (ideaMatch) {
    const ideaText = ideaMatch[1].trim()
    if (!ideaText) {
      await tgSend(chatId, '✍️ Что записать? Напиши: идея <текст>')
      return new Response('ok')
    }
    const { error } = await supabase.from('ideas').insert({ user_id: userId, text: ideaText })
    await tgSend(chatId, error ? '❌ Не удалось сохранить, попробуй ещё раз.' : '💡 Записал. Все идеи — /ideas', { reply_markup: BACK_MENU })
    return new Response('ok')
  }

  // Классифицируем КАЖДОЕ свободное сообщение единым роутером. Классификатор распознаёт
  // даже голые названия продуктов («груша», «творог»), которые прежний keyword-фильтр
  // пропускал — и они утекали в ИИ-чат, а flash выдумывал «📝 Записал», ничего не сохраняя
  // (промпт это запрещает, но модель правило игнорит — поэтому фикс структурный, не в промпте).
  // act != null → это лог (еда/приём/препарат); null → вопрос/чат.
  // Классификатор — это AI-вызов, поэтому за бюджетом: при превышении не классифицируем,
  // сообщение уйдёт в ИИ-чат, который сам покажет сообщение о лимите.
  // Таймзона нужна для срока годности заметки и для лога. Якорь «сейчас» — время отправки
  // сообщения (msg.date, сек UTC), чтобы относительное время («час назад») считалось от него.
  const { data: noteSet } = await supabase
    .from('daily_note_settings').select('timezone').eq('user_id', userId).maybeSingle()
  const tz = noteSet?.timezone || 'Europe/Kyiv'
  const now = msg.date ? new Date(msg.date * 1000) : new Date()

  const budget = await checkBudget(supabase, userId)
  let act: any = null
  if (budget.ok) {
    const { data: supList } = await supabase
      .from('supplements').select('name').eq('user_id', userId).eq('active', true)
    const supNames = (supList ?? []).map((s: any) => s.name)
    act = await classifyLog(text, supNames, now, tz)
  }

  // Ответ на вечерний вопрос → заметка дня (N2 + N4, SPEC-DAILY-NOTE)
  // Фикс: (1) флаг протухает к следующим суткам; (2) лог еды/приёма НЕ съедается как заметка.
  if (link.awaiting_note_date) {
    const noteDate = link.awaiting_note_date
    const stale = noteDate < localDate(tz)
    if (stale || act) {
      // протухший вопрос ИЛИ это лог → не заметка: сбрасываем флаг, обрабатываем как обычно
      await supabase.from('telegram_links')
        .update({ awaiting_note_date: null })
        .eq('telegram_chat_id', String(chatId))
    } else {
      // обычный ответ → заметка дня (дополняем существующую, не затираем)
      const { data: existing } = await supabase
        .from('context_notes')
        .select('note')
        .eq('user_id', userId)
        .eq('date', noteDate)
        .maybeSingle()
      const merged = existing?.note ? `${existing.note}\n${text}` : text
      await supabase.from('context_notes').upsert(
        { user_id: userId, date: noteDate, note: merged, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date' }
      )
      await supabase.from('telegram_links')
        .update({ awaiting_note_date: null })
        .eq('telegram_chat_id', String(chatId))
      await tgSend(chatId, '📝 Записал в заметку дня. Спасибо!\n\nТеперь можешь задать любой вопрос — отвечу по твоим данным.')
      return new Response('ok')
    }
  }

  // Лог еды/приёма/препарата (распознан классификатором): "груша", "съел макдак",
  // "принял финастерид 1мг", "пил кофе в 14:00"
  if (act) {
    const confirm = await execLog(chatId, userId, act, tz, supabase, now)
    if (confirm) {
      await tgSend(chatId, confirm, { reply_markup: BACK_MENU })
      return new Response('ok')
    }
  }

  // Any other text → AI chat (B3)
  const newSid = await handleAiChat(chatId, userId, text, link.tg_session_id ?? null, supabase)
  if (newSid && newSid !== link.tg_session_id) {
    await supabase.from('telegram_links').update({ tg_session_id: newSid }).eq('telegram_chat_id', String(chatId))
  }
  return new Response('ok')
})
