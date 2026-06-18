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
    if (spo2.length) parts.push(`SpO2: средн ${avg(spo2)!.toFixed(0)}%`)
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
      // Напоминание: snooze на N минут
      const rest = data.replace('rem_snz_', '')
      const idx = rest.lastIndexOf('_')
      const evId = rest.slice(0, idx)
      const mins = parseInt(rest.slice(idx + 1), 10) || 60
      const until = new Date(Date.now() + mins * 60000).toISOString()
      await supabase.from('reminder_events')
        .update({ status: 'snoozed', snooze_until: until })
        .eq('id', evId).eq('user_id', userId)
      const label = mins >= 120 ? '2 часа' : '1 час'
      await tgSend(chatId, `⏰ Напомню через ${label}.`)
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

    function bar(pct: number, width = 6): string {
      const filled = Math.round(pct / 100 * width)
      const fill = pct >= 90 ? '🟥' : pct >= 70 ? '🟨' : '🟩'
      return fill.repeat(filled) + '⬜'.repeat(width - filled)
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

  // Any other text → AI chat (B3)
  const newSid = await handleAiChat(chatId, userId, text, link.tg_session_id ?? null, supabase)
  if (newSid && newSid !== link.tg_session_id) {
    await supabase.from('telegram_links').update({ tg_session_id: newSid }).eq('telegram_chat_id', String(chatId))
  }
  return new Response('ok')
})
