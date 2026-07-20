import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isValidCronSecret } from '../_shared/auth.ts'
import { withObservability } from '../_shared/observability.ts'
import type { Ctx } from './ctx.ts'
import { runDoseCreation } from './doses.ts'
import { runDelivery, runMarkMissed } from './delivery.ts'
import { runDailyNotes } from './dailyNote.ts'
import { runBiweeklyReports, runMorningSummaries } from './digests.ts'
import { runProactiveAlerts, runCoachNudges, runFollowupResolver } from './coach.ts'
import { runGeneralReminders, runWorkoutNotices } from './reminders.ts'
import { runExperimentVerdicts } from './experiments.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('TONUS_CRON_SECRET') ?? Deno.env.get('CRON_SECRET') ?? ''

const handler = async (req: Request) => {
  // Fail closed: без корректного cron-секрета не читаем таблицы и не шлём (спека §3.2).
  if (!isValidCronSecret(req, CRON_SECRET)) return new Response('unauthorized', { status: 401 })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const nowMs = Date.now()
  const runId = crypto.randomUUID()
  const ctx: Ctx = { supabase, nowMs }

  const created = await runDoseCreation(ctx)

  const deliveryRes = await runDelivery(ctx)
  if (!deliveryRes.ok) {
    // Ошибка конфигурации/схемы — job обязан упасть видимо, а не вернуть 200 (§4.1).
    return new Response(JSON.stringify({ runId, error: deliveryRes.error }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
  await runMarkMissed(ctx)

  const notesSent = await runDailyNotes(ctx)

  const reportsSent = await runBiweeklyReports(ctx)

  const morningsSent = await runMorningSummaries(ctx)

  const alertsSent = await runProactiveAlerts(ctx)
  const nudgesSent = await runCoachNudges(ctx)
  const followupsSent = await runFollowupResolver(ctx)

  const generalRemindersSent = await runGeneralReminders(ctx)
  const workoutNoticesSent = await runWorkoutNotices(ctx)

  const verdictsSent = await runExperimentVerdicts(ctx)

  // Structured execution result (§4.1) + backlog signal (§4.2)
  return new Response(JSON.stringify({
    runId,
    claimed: deliveryRes.claimed,
    sent: deliveryRes.sent,
    skipped: deliveryRes.skipped,
    retried: deliveryRes.retried,
    failed: deliveryRes.failed,
    deliveryUnknown: deliveryRes.deliveryUnknown,
    remaining: deliveryRes.remaining,
    durationMs: Date.now() - nowMs,
    created, notesSent, reportsSent, morningsSent, alertsSent, nudgesSent, followupsSent, generalRemindersSent,
    workoutNoticesSent, verdictsSent,
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(withObservability('edge.send_reminders', handler))
