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
  if (WEBHOOK_SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

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
    .select('user_id, status')
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

  // Any other text → show main menu
  await tgSend(chatId, 'Выбери действие:', { reply_markup: MAIN_MENU })
  return new Response('ok')
})
