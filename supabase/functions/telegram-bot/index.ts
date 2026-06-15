import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''

async function tgSend(chatId: string | number, text: string, extra: Record<string, any> = {}) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
  })
}

serve(async (req) => {
  // Verify secret header set during webhook registration
  if (WEBHOOK_SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return new Response('ok')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
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

    // Validate link token from telegram_link_tokens table
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

    await tgSend(chatId, '✅ Telegram успешно подключён к Tonus!\n\nДоступные команды:\n/report — получить отчёт прямо сейчас\n/last — последний сохранённый отчёт\n/pause — приостановить автоотчёты\n/resume — возобновить автоотчёты')
    return new Response('ok')
  }

  // Find user by telegram chat id
  const { data: link } = await supabase
    .from('telegram_links')
    .select('user_id, status')
    .eq('telegram_chat_id', String(chatId))
    .single()

  if (!link) {
    await tgSend(chatId, '❓ Аккаунт не найден. Подключи Telegram в настройках Tonus (/start).')
    return new Response('ok')
  }

  const userId = link.user_id

  // /report — generate fresh biweekly report
  if (text === '/report') {
    await tgSend(chatId, '⏳ Генерирую отчёт, подожди немного…')

    const { data: { session } } = await supabase.auth.admin.getUserById(userId)
    const reportRes = await fetch(`${SUPABASE_URL}/functions/v1/biweekly-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'x-user-id': userId,
      },
    })

    if (!reportRes.ok) {
      await tgSend(chatId, '❌ Не удалось сгенерировать отчёт. Попробуй позже.')
    }
    return new Response('ok')
  }

  // /last — send last saved report
  if (text === '/last') {
    const { data: rep } = await supabase
      .from('scheduled_reports')
      .select('content, period_start, period_end, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!rep) {
      await tgSend(chatId, '📭 Отчётов пока нет. Используй /report чтобы сгенерировать первый.')
    } else {
      await tgSend(chatId, `📊 <b>Отчёт ${rep.period_start} — ${rep.period_end}</b>\n\n${rep.content}`)
    }
    return new Response('ok')
  }

  // /pause — pause auto-reports
  if (text === '/pause') {
    await supabase.from('report_settings').upsert({ user_id: userId, paused: true }, { onConflict: 'user_id' })
    await tgSend(chatId, '⏸ Автоотчёты приостановлены. Используй /resume чтобы возобновить.')
    return new Response('ok')
  }

  // /resume — resume auto-reports
  if (text === '/resume') {
    await supabase.from('report_settings').upsert({ user_id: userId, paused: false }, { onConflict: 'user_id' })
    await tgSend(chatId, '▶️ Автоотчёты возобновлены.')
    return new Response('ok')
  }

  // /status — quick health snapshot
  if (text === '/status') {
    const today = new Date().toISOString().slice(0, 10)
    const week = new Date(); week.setDate(week.getDate() - 7)
    const { data: rows } = await supabase
      .from('daily_metrics')
      .select('date, resting_heart_rate, hrv, sleep_hours, steps')
      .eq('user_id', userId)
      .gte('date', week.toISOString().slice(0, 10))
      .order('date', { ascending: false })

    if (!rows?.length) {
      await tgSend(chatId, '📭 Нет данных за последнюю неделю.')
      return new Response('ok')
    }

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
    const rhr = rows.map((r: any) => r.resting_heart_rate).filter(Boolean)
    const hrv = rows.map((r: any) => r.hrv).filter(Boolean)
    const sleep = rows.map((r: any) => r.sleep_hours).filter(Boolean)
    const steps = rows.map((r: any) => r.steps).filter(Boolean)

    const lines = [`📈 <b>Статус за 7 дней</b>`, '']
    if (rhr.length) lines.push(`❤️ ЧСС покоя: ${avg(rhr)!.toFixed(0)} уд/мин`)
    if (hrv.length) lines.push(`💚 HRV: ${avg(hrv)!.toFixed(0)} мс`)
    if (sleep.length) lines.push(`😴 Сон: ${avg(sleep)!.toFixed(1)} ч/ночь`)
    if (steps.length) lines.push(`👟 Шаги: ${Math.round(avg(steps)!).toLocaleString()}/день`)
    lines.push('', `Данных за период: ${rows.length} дн.`)

    await tgSend(chatId, lines.join('\n'))
    return new Response('ok')
  }

  // Unknown command
  await tgSend(chatId,
    '🤖 Команды:\n/report — новый отчёт\n/last — последний отчёт\n/status — статус за 7 дней\n/pause — пауза\n/resume — возобновить'
  )
  return new Response('ok')
})
