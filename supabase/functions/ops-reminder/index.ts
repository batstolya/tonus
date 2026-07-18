// Monthly ops reminder to the owner's alert chat. Triggered by pg_cron
// (job ops-backup-reminder-monthly, see the schedule_backup_reminder helper
// migration); gated by x-cron-secret like fetch-environment. Fail-closed:
// no secret match → 401, nothing sent.
//
// Spec: docs/superpowers/specs/2026-07-17-monthly-backup-reminder-design.md

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { isValidCronSecret } from '../_shared/auth.ts'
import { sendTelegram } from '../_shared/telegram.ts'
import { backupReminderMessage } from './message.ts'

const CRON_SECRET = Deno.env.get('OPS_CRON_SECRET') ?? Deno.env.get('TONUS_CRON_SECRET') ?? ''
const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const ALERT_CHAT_ID = Deno.env.get('TONUS_ALERT_CHAT_ID') ?? ''

serve(async (req) => {
  if (!isValidCronSecret(req, CRON_SECRET)) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!TG_TOKEN || !ALERT_CHAT_ID) {
    return new Response(JSON.stringify({ error: 'alert channel not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  await sendTelegram(TG_TOKEN, ALERT_CHAT_ID, backupReminderMessage())
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
