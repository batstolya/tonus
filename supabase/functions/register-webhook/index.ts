import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')!
  const webhookUrl = 'https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/telegram-bot'
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''

  const body = await req.json().catch(() => ({}))

  if (body.action === 'info') {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
    const data = await res.json()
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
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
