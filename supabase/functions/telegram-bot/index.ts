// Telegram webhook entry point: security guards, update parsing and dispatch.
// Command routing lives in router.ts (pure, tested); handler bodies live in
// callbacks.ts / messages.ts / commands.ts / ai.ts (B3 split).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isValidTelegramSecret } from '../_shared/auth.ts'
import { withObservability } from '../_shared/observability.ts'
import { setupCommands } from './tg.ts'
import { handleCallback } from './callbacks.ts'
import { handleMessage } from './messages.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''

const handler = async (req: Request) => {
  // Fail closed: секрет обязателен в runtime (спека §3.1).
  if (!WEBHOOK_SECRET) return new Response('webhook secret not configured', { status: 503 })
  // Проверяем заголовок Telegram ДО чтения тела, setupCommands и createClient.
  if (!isValidTelegramSecret(req, WEBHOOK_SECRET)) return new Response('unauthorized', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return new Response('ok')

  // Setup commands on every request (idempotent, fast)
  setupCommands().catch(() => {})

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  if (body.callback_query) {
    await handleCallback(body.callback_query, supabase)
    return new Response('ok')
  }

  const msg = body.message ?? body.edited_message
  if (msg) await handleMessage(msg, supabase)
  return new Response('ok')
}

serve(withObservability('edge.telegram_bot', handler))
