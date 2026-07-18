import { fetchWithTimeout } from '../_shared/http.ts'
import { localNow, timeDue } from './time.ts'
import { tgSend } from './tg.ts'
import type { Ctx } from './ctx.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const INTERNAL_SECRET = Deno.env.get('TONUS_INTERNAL_SECRET') ?? ''

// ── 5. Автоматический двухнедельный отчёт (раз в 14 дней, утром ~09:00) ──────
export async function runBiweeklyReports({ supabase, nowMs }: Ctx): Promise<number> {
  let reportsSent = 0
  const { hhmm } = localNow('Europe/Kyiv')
  if (timeDue('09:00', hhmm)) {
    const { data: links } = await supabase
      .from('telegram_links')
      .select('user_id, telegram_chat_id')
      .eq('status', 'active')
    for (const l of links ?? []) {
      // настройки отчёта (частота)
      const { data: rs } = await supabase
        .from('report_settings').select('paused, frequency_days').eq('user_id', l.user_id).maybeSingle()
      if (rs?.paused) continue
      const freqDays = rs?.frequency_days ?? 14
      // последний доставленный отчёт
      const { data: last } = await supabase
        .from('scheduled_reports')
        .select('delivered_at')
        .eq('user_id', l.user_id)
        .not('delivered_at', 'is', null)
        .order('delivered_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const daysSince = last?.delivered_at
        ? (nowMs - new Date(last.delivered_at).getTime()) / 86400000
        : 999
      if (daysSince < freqDays) continue
      // сгенерировать отчёт через biweekly-report (service-role + x-user-id)
      try {
        // Report generation includes a Gemini round-trip — allow well past the 10 s default.
        const reportRes = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/biweekly-report`, {
          method: 'POST',
          timeoutMs: 60_000,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, // gateway only; authority is x-internal-secret
            'x-internal-secret': INTERNAL_SECRET,
            'x-user-id': l.user_id,
          },
        })
        if (reportRes.ok) {
          reportsSent++
        } else if (reportRes.status === 403) {
          const body = await reportRes.json().catch(() => null)
          if (body?.error === 'ai_consent_required' && l.telegram_chat_id) {
            await tgSend(String(l.telegram_chat_id), '🔒 Чтобы получать ИИ-отчёты, открой Tonus → Настройки → Обработка данных ИИ и дай согласие.')
          }
        }
      } catch (_e) { /* пропускаем сбойного юзера */ }
    }
  }
  return reportsSent
}

// ── 6. Утренняя сводка (B4) ─────────────────────────────────────────────────
export async function runMorningSummaries({ supabase, nowMs }: Ctx): Promise<number> {
  let morningsSent = 0
  const { data: morn } = await supabase
    .from('report_settings')
    .select('user_id, morning_time, timezone, morning_last_sent')
    .eq('morning_summary', true)
  for (const m of morn ?? []) {
    const tz = m.timezone || 'Europe/Kyiv'
    const { hhmm, dateStr } = localNow(tz)
    if (!timeDue(m.morning_time || '09:00', hhmm)) continue
    if (m.morning_last_sent === dateStr) continue
    const { data: link } = await supabase
      .from('telegram_links').select('telegram_chat_id').eq('user_id', m.user_id).eq('status', 'active').maybeSingle()
    if (!link?.telegram_chat_id) continue

    // короткая сводка по последним 7 дням
    const since = new Date(nowMs - 7 * 86400000).toISOString().slice(0, 10)
    const { data: rows } = await supabase
      .from('daily_metrics')
      .select('resting_heart_rate, hrv, sleep_hours')
      .eq('user_id', m.user_id).gte('date', since)
    const avgF = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
    const mRows: { resting_heart_rate: number | null; hrv: number | null; sleep_hours: number | null }[] = rows ?? []
    const numsOf = (vals: (number | null)[]) => vals.filter((v): v is number => v != null)
    const rhr = numsOf(mRows.map(r => r.resting_heart_rate))
    const hrv = numsOf(mRows.map(r => r.hrv))
    const sl = numsOf(mRows.map(r => r.sleep_hours))
    const parts = ['☀️ <b>Доброе утро!</b> Сводка за неделю:']
    if (sl.length) parts.push(`😴 Сон: ${avgF(sl)!.toFixed(1)} ч/ночь`)
    if (rhr.length) parts.push(`❤️ ЧСС покоя: ${avgF(rhr)!.toFixed(0)} уд/мин`)
    if (hrv.length) parts.push(`💚 HRV: ${avgF(hrv)!.toFixed(0)} мс`)
    parts.push('\nХорошего дня! 💪')
    await tgSend(link.telegram_chat_id, parts.join('\n'))
    await supabase.from('report_settings').update({ morning_last_sent: dateStr }).eq('user_id', m.user_id)
    morningsSent++
  }
  return morningsSent
}
