import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
- Отвечай кратко (2-4 предложения), это мессенджер.
- Опирайся на личные тренды пользователя, не на абсолютные нормы.`

// ── Natural-language logging (приём препарата / событие из текста) ─────────────

// Смещение таймзоны (минуты к востоку от UTC) на конкретный момент
function tzOffsetMin(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]))
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return (asUTC - date.getTime()) / 60000
}

// Локальные дата/время (HH:MM) в этой tz → ISO (UTC). time=null → сейчас.
function localToIso(tz: string, time: string | null, dateStr?: string | null): string {
  const now = new Date()
  if (!time && !dateStr) return now.toISOString()
  const off = tzOffsetMin(tz, now)
  let day = dateStr
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now).map(x => [x.type, x.value]))
    day = `${p.year}-${p.month}-${p.day}`
  }
  const naiveUTC = Date.parse(`${day}T${time ?? '12:00'}:00Z`)
  return new Date(naiveUTC - off * 60000).toISOString()
}

function localDate(tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

// Классифицирует свободный текст: это действие-лог или вопрос?
// Возвращает действие, либо null если это обычный вопрос (→ чат).
async function classifyLog(text: string, supplementNames: string[]): Promise<any | null> {
  if (!GEMINI_KEY) return null
  const todayStr = new Date().toISOString().slice(0, 10)
  const prompt = `Пользователь пишет сообщение боту здоровья. Определи, это ЗАПИСЬ события или ВОПРОС.
Препараты пользователя: ${supplementNames.length ? supplementNames.join(', ') : '(нет)'}
Сегодня: ${todayStr}

Сообщение: "${text}"

Верни ТОЛЬКО JSON:
{
  "action": "supplement" | "intake" | "chat",
  "supplement": название препарата ТОЧНО как в списке пользователя (исправь опечатки на ближайший из списка) или null,
  "dose": доза текстом (напр. "1мг") или null,
  "intake_type": "coffee" | "alcohol" | "meal" | "water" | "meds" | "custom" | null,
  "amount": число или null,
  "unit": "мл" или null,
  "date": "ГГГГ-ММ-ДД" если указана дата/число дня, иначе null,
  "time": "ЧЧ:ММ" если указано время, иначе null,
  "note": краткая заметка (напр. "Макдональдс") или null
}

Правила:
- "принял/выпил <препарат>" → action="supplement", supplement ТОЧНО из списка (исправь опечатку: "финатерид"→"Финастерид").
- "пил кофе", "выпил вина", "съел макдак/еду", "выпил воды" → action="intake" с нужным intake_type. Макдоналдс/еда = meal с note.
- Вопрос ("как мой сон", "что ты знаешь") → action="chat".
- Число без контекста после препарата ("финастерид 18") — это ДЕНЬ месяца: date="${todayStr.slice(0,7)}-18". "1мг"/"5000" рядом с дозой — это доза, не дата.
- Время словами: "в обед"≈13:00, "утром"≈09:00, "вечером"≈20:00 → ЧЧ:ММ.`

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
async function execLog(chatId: number | string, userId: string, act: any, tz: string, supabase: any): Promise<string | null> {
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
    const ts = localToIso(tz, act.time, act.date)
    await supabase.from('intake_events').insert({
      user_id: userId,
      ts,
      type: act.intake_type,
      amount: act.amount ?? null,
      unit: act.unit ?? null,
      note: act.note ?? null,
    })
    const timeStr = new Date(ts).toLocaleTimeString('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
    const extra = [act.amount ? `${act.amount}${act.unit ?? ''}` : '', act.note ?? ''].filter(Boolean).join(', ')
    return `📝 Записал: ${labels[act.intake_type] ?? act.intake_type}${extra ? ` (${extra})` : ''} в ${timeStr}`
  }

  return null
}

async function buildBotContext(userId: string, supabase: any): Promise<string> {
  const since = new Date(); since.setDate(since.getDate() - 14)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data: rows } = await supabase
    .from('daily_metrics')
    .select('date, resting_heart_rate, hrv, sleep_hours, steps, active_energy, oxygen_saturation')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .order('date', { ascending: true })

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  const num = (r: any[], k: string) => r.map(x => x[k]).filter((v: any) => v != null && !isNaN(v))

  const parts: string[] = [`=== ДАННЫЕ ЗА 14 ДНЕЙ (${rows?.length ?? 0} дн.) ===`]
  if (rows?.length) {
    const rhr = num(rows, 'resting_heart_rate'), hrv = num(rows, 'hrv')
    const sleep = num(rows, 'sleep_hours'), steps = num(rows, 'steps')
    const energy = num(rows, 'active_energy'), spo2 = num(rows, 'oxygen_saturation')
    if (rhr.length) parts.push(`ЧСС покоя: средн ${avg(rhr)!.toFixed(0)} уд/мин (от ${Math.min(...rhr)} до ${Math.max(...rhr)})`)
    if (hrv.length) parts.push(`HRV: средн ${avg(hrv)!.toFixed(0)} мс (от ${Math.min(...hrv)} до ${Math.max(...hrv)})`)
    if (sleep.length) parts.push(`Сон: средн ${avg(sleep)!.toFixed(1)} ч/ночь (от ${Math.min(...sleep).toFixed(1)} до ${Math.max(...sleep).toFixed(1)})`)
    if (steps.length) parts.push(`Шаги: средн ${Math.round(avg(steps)!).toLocaleString('ru-RU')}/день`)
    if (energy.length) parts.push(`Активные ккал: средн ${Math.round(avg(energy)!)}/день`)
    if (spo2.length) parts.push(`SpO2: средн ${(avg(spo2)! * 100).toFixed(0)}%`)
    // per-day sleep & rhr for trend
    const daily = rows.slice(-7).map((r: any) =>
      `${r.date}: сон ${r.sleep_hours?.toFixed?.(1) ?? '—'}ч, ЧССп ${r.resting_heart_rate ?? '—'}, шаги ${r.steps ?? '—'}`
    ).join('\n')
    parts.push(`\nПоследние дни:\n${daily}`)
  } else {
    parts.push('Нет данных за период.')
  }

  // Фазы сна (глубокий/REM/ядро) из sleep_sessions
  const { data: sleep } = await supabase
    .from('sleep_sessions')
    .select('date, duration_hours, deep_hours, rem_hours, core_hours')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .order('date', { ascending: false })
  if (sleep?.length) {
    const dh = num(sleep, 'deep_hours'), rh = num(sleep, 'rem_hours'), ch = num(sleep, 'core_hours')
    parts.push('\nФазы сна (14 дней):')
    if (dh.length) parts.push(`Глубокий: средн ${avg(dh)!.toFixed(1)} ч/ночь`)
    if (rh.length) parts.push(`REM: средн ${avg(rh)!.toFixed(1)} ч/ночь`)
    if (ch.length) parts.push(`Лёгкий/ядро: средн ${avg(ch)!.toFixed(1)} ч/ночь`)
    const recent = sleep.slice(0, 7).map((s: any) =>
      `${s.date}: всего ${s.duration_hours?.toFixed?.(1) ?? '—'}ч (глуб ${s.deep_hours?.toFixed?.(1) ?? '—'}, REM ${s.rem_hours?.toFixed?.(1) ?? '—'})`
    ).join('\n')
    parts.push(`Последние ночи:\n${recent}`)
  }

  // Анализы (lab_results) — последнее значение и тренд по каждому маркеру
  const { data: labs } = await supabase
    .from('lab_results')
    .select('marker, value, unit, date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(60)
  if (labs?.length) {
    const byMarker: Record<string, any[]> = {}
    for (const r of labs) (byMarker[r.marker] ??= []).push(r)
    parts.push('\nАнализы (последние значения):')
    for (const [marker, entries] of Object.entries(byMarker)) {
      const latest = entries[0]
      const unit = latest.unit ? ` ${latest.unit}` : ''
      if (entries.length >= 2) {
        const d = latest.value - entries[1].value
        parts.push(`${marker}: ${latest.value}${unit} (${latest.date}, ${d > 0 ? '+' : ''}${d.toFixed(1)} к ${entries[1].date})`)
      } else {
        parts.push(`${marker}: ${latest.value}${unit} (${latest.date})`)
      }
    }
  }

  // Supplements taken
  const { data: sups } = await supabase
    .from('supplements').select('name').eq('user_id', userId)
  if (sups?.length) parts.push(`\nПрепараты: ${sups.map((s: any) => s.name).join(', ')}`)

  // События (кофе/алкоголь/еда/вода) за 14 дней
  const { data: intake } = await supabase
    .from('intake_events')
    .select('ts, type, amount, unit, note')
    .eq('user_id', userId)
    .gte('ts', `${sinceStr}T00:00:00Z`)
    .order('ts', { ascending: false })
    .limit(80)
  if (intake?.length) {
    const tLabels: Record<string, string> = { coffee: 'кофе', alcohol: 'алкоголь', meal: 'еда', water: 'вода', meds: 'лекарство', custom: 'заметка' }
    parts.push('\nСобытия (кофе/алкоголь/еда):')
    for (const e of intake) {
      const d = new Date(e.ts).toISOString().slice(0, 16).replace('T', ' ')
      const amt = e.amount ? ` ${e.amount}${e.unit ?? ''}` : ''
      parts.push(`${d} ${tLabels[e.type] ?? e.type}${amt}${e.note ? ` (${e.note})` : ''}`)
    }
  }

  // Отметки приёма препаратов за 14 дней
  const { data: logs } = await supabase
    .from('supplement_logs')
    .select('date, taken, supplements(name)')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .eq('taken', true)
    .order('date', { ascending: false })
    .limit(100)
  if (logs?.length) {
    const byDay: Record<string, string[]> = {}
    for (const l of logs) {
      const name = (l.supplements as any)?.name
      if (name) (byDay[l.date] ??= []).push(name)
    }
    parts.push('\nПриём препаратов (по дням):')
    for (const [date, names] of Object.entries(byDay)) parts.push(`${date}: ${names.join(', ')}`)
  }

  // Заметки дня (SPEC-DAILY-NOTE) — что пользователь сам писал про свои дни
  const { data: notes } = await supabase
    .from('context_notes')
    .select('date, note')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .order('date', { ascending: false })
  if (notes?.length) {
    parts.push('\nЗаметки дня (со слов пользователя):')
    for (const n of notes) parts.push(`${n.date}: ${n.note}`)
  }

  return parts.join('\n')
}

async function handleAiChat(chatId: number | string, userId: string, text: string, sessionId: string | null, supabase: any): Promise<string | null> {
  if (!GEMINI_KEY) {
    await tgSend(chatId, 'Выбери действие:', { reply_markup: MAIN_MENU })
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

  const contents = [
    { role: 'user', parts: [{ text: `${CHAT_SYSTEM_PROMPT}\n\n${context}` }] },
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
      await supabase.from('ai_usage').insert({ user_id: userId, source: 'chat', tokens_used: tokens })
    }

    await tgSend(chatId, reply, { reply_markup: BACK_MENU })
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
    } else if (data.startsWith('take_')) {
      const supId = data.replace('take_', '')
      const today = new Date().toISOString().slice(0, 10)
      await supabase.from('supplement_logs').upsert(
        { user_id: userId, supplement_id: supId, date: today, taken: true },
        { onConflict: 'user_id,supplement_id,date' }
      )
      const { data: sup } = await supabase.from('supplements').select('name').eq('id', supId).single()
      await tgSend(chatId, `✅ ${sup?.name ?? 'Препарат'} отмечен как принятый сегодня.`, { reply_markup: BACK_MENU })
    } else if (data.startsWith('rem_take_')) {
      // Напоминание: принял → запись в supplement_logs + статус taken
      const evId = data.replace('rem_take_', '')
      const { data: ev } = await supabase
        .from('reminder_events')
        .select('supplement_id, supplements(name)')
        .eq('id', evId).eq('user_id', userId).single()
      if (ev) {
        const today = new Date().toISOString().slice(0, 10)
        await supabase.from('supplement_logs').upsert(
          { user_id: userId, supplement_id: ev.supplement_id, date: today, taken: true },
          { onConflict: 'user_id,supplement_id,date' }
        )
        await supabase.from('reminder_events')
          .update({ status: 'taken', responded_at: new Date().toISOString() })
          .eq('id', evId)
        const name = (ev.supplements as any)?.name ?? 'Препарат'
        await tgSend(chatId, `✅ <b>${name}</b> отмечен как принятый. Молодец!`)
      }
    } else if (data.startsWith('rem_snz_')) {
      // Напоминание: snooze на N минут (R4: предел переносов — не дальше 4ч от исходной дозы)
      const rest = data.replace('rem_snz_', '')
      const idx = rest.lastIndexOf('_')
      const evId = rest.slice(0, idx)
      const mins = parseInt(rest.slice(idx + 1), 10) || 60
      const until = new Date(Date.now() + mins * 60000)
      const { data: ev } = await supabase
        .from('reminder_events').select('due_at').eq('id', evId).eq('user_id', userId).maybeSingle()
      const deadline = ev?.due_at ? new Date(ev.due_at).getTime() + 4 * 3600 * 1000 : Infinity
      if (until.getTime() > deadline) {
        // дальше переносить некуда — помечаем пропущенным, чтобы не нытьё без конца
        await supabase.from('reminder_events')
          .update({ status: 'skipped', responded_at: new Date().toISOString() })
          .eq('id', evId).eq('user_id', userId)
        await tgSend(chatId, '⏭ Лимит переносов исчерпан — отметил как пропущено на сегодня.')
      } else {
        await supabase.from('reminder_events')
          .update({ status: 'snoozed', snooze_until: until.toISOString() })
          .eq('id', evId).eq('user_id', userId)
        await tgSend(chatId, `⏰ Напомню через ${mins >= 120 ? '2 часа' : '1 час'}.`)
      }
    } else if (data.startsWith('rem_skip_')) {
      // Напоминание: пропустить сегодня
      const evId = data.replace('rem_skip_', '')
      await supabase.from('reminder_events')
        .update({ status: 'skipped', responded_at: new Date().toISOString() })
        .eq('id', evId).eq('user_id', userId)
      await tgSend(chatId, '⏭ Пропущено на сегодня.')
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
      const secs = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000))
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

    const age = Math.floor((Date.now() - new Date(usageRow.updated_at).getTime()) / 60000)
    await tgSend(chatId,
      `🤖 *Лимиты Claude*\n\n` +
      `*Сессия (5ч)*\n${sLine}\n\n` +
      `*Неделя*\n${wLine}\n\n` +
      `_обновлено ${age === 0 ? 'только что' : age + ' мин назад'}_`,
      { parse_mode: 'Markdown', reply_markup: BACK_MENU }
    )
    return new Response('ok')
  }

  // Commands start with "/" but unknown → show menu
  if (text.startsWith('/')) {
    await tgSend(chatId, 'Выбери действие:', { reply_markup: MAIN_MENU })
    return new Response('ok')
  }

  // Ответ на вечерний вопрос → заметка дня (N2 + N4, SPEC-DAILY-NOTE)
  if (link.awaiting_note_date) {
    const noteDate = link.awaiting_note_date
    // дополняем существующую заметку, не затираем
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

  // Естественный ввод: "принял финастерид 1мг", "пил кофе в 14:00", "съел макдак"
  // Дешёвый keyword-фильтр: классификатор (доп. Gemini-вызов) только если похоже на лог
  const looksLikeLog = /прин(я|и)л|выпил|пил|съел|поел|сожрал|кофе|алкогол|вин[оа]|пив[оа]|водк|воды|выпь|таблетк|капсул|\bмг\b|\bмл\b|макдак|макдональ|еду|покушал/i.test(text)
  if (looksLikeLog) {
  const { data: supList } = await supabase
    .from('supplements').select('name').eq('user_id', userId).eq('active', true)
  const supNames = (supList ?? []).map((s: any) => s.name)
  const act = await classifyLog(text, supNames)
  if (act) {
    const { data: noteSet } = await supabase
      .from('daily_note_settings').select('timezone').eq('user_id', userId).maybeSingle()
    const tz = noteSet?.timezone || 'Europe/Kyiv'
    const confirm = await execLog(chatId, userId, act, tz, supabase)
    if (confirm) {
      await tgSend(chatId, confirm, { reply_markup: BACK_MENU })
      return new Response('ok')
    }
  }
  }

  // Any other text → AI chat (B3)
  const newSid = await handleAiChat(chatId, userId, text, link.tg_session_id ?? null, supabase)
  if (newSid && newSid !== link.tg_session_id) {
    await supabase.from('telegram_links').update({ tg_session_id: newSid }).eq('telegram_chat_id', String(chatId))
  }
  return new Response('ok')
})
