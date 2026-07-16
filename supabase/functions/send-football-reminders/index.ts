import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildFootballReminderText, buildFootballReminderKeyboard, type FootballReminderView } from '../_shared/football.ts'
import { isValidCronSecret } from '../_shared/auth.ts'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const CRON_SECRET = Deno.env.get('TONUS_CRON_SECRET') ?? Deno.env.get('FOOTBALL_INTERNAL_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret, x-request-id',
}

interface ClaimedReminder extends FootballReminderView {
  reminder_id: string
  match_short_id: string
  telegram_chat_id: number
  timezone: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!isValidCronSecret(req, CRON_SECRET)) {
    return json({ error: 'unauthorized' }, 401)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    const { data: reminders, error } = await supabase.rpc('claim_due_football_reminders')
    if (error) throw error

    let sent = 0
    let failed = 0

    for (const reminder of (reminders ?? []) as ClaimedReminder[]) {
      const text = buildFootballReminderText(reminder, new Date(), 'ru-RU', reminder.timezone ?? 'Europe/Berlin')
      const keyboard = buildFootballReminderKeyboard(reminder.match_short_id)

      const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: reminder.telegram_chat_id,
          text,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        }),
      })
      const tgJson = await tgRes.json().catch(() => ({}))

      if (!tgRes.ok || !tgJson.ok) {
        await supabase.rpc('mark_football_reminder_failed', {
          p_reminder_id: reminder.reminder_id,
          p_error_message: JSON.stringify(tgJson),
        })
        failed++
        continue
      }

      await supabase.rpc('mark_football_reminder_sent', {
        p_reminder_id: reminder.reminder_id,
        p_telegram_message_id: tgJson.result.message_id,
      })
      sent++
    }

    return json({ ok: true, sent, failed })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
