import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { isValidAdminSecret } from '../_shared/auth.ts'

const ADMIN_SECRET = Deno.env.get('TONUS_ADMIN_SECRET') ?? ''

serve(async (req) => {
  // Не пользовательская функция: только закрытая operational-команда (спека §3.3).
  if (!ADMIN_SECRET) return new Response('admin secret not configured', { status: 503 })
  if (!isValidAdminSecret(req, ADMIN_SECRET)) return new Response('unauthorized', { status: 401 })

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')!
  const webhookUrl = 'https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/telegram-bot'
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''

  const body = await req.json().catch(() => ({}))

  if (body.action === 'info') {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
    const data = await res.json()
    // Только безопасный минимум, не весь ответ Telegram (спека §3.3).
    const r = data?.result ?? {}
    const safe = {
      url: r.url ?? null,
      pending_update_count: r.pending_update_count ?? null,
      last_error_date: r.last_error_date ?? null,
      last_error_message: r.last_error_message ?? null,
    }
    return new Response(JSON.stringify(safe), { headers: { 'Content-Type': 'application/json' } })
  }

  if (body.action === 'commands') {
    const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'menu', description: '🏠 Главное меню' },
          { command: 'report', description: '📊 Двухнедельный отчёт' },
          { command: 'status', description: '📈 Статус за сегодня' },
          { command: 'sync', description: '📲 Дата последней синхронизации' },
          { command: 'pause', description: '⏸ Приостановить отчёты' },
          { command: 'resume', description: '▶️ Возобновить отчёты' },
        ],
      }),
    })
    const data = await res.json()
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, secret_token: secret }),
  })
  const data = await res.json()
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
})
