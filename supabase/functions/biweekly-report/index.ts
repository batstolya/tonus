import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

function avg(vals: number[]) { return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null }

function fmtBedtime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
}

function buildDigest(rows: any[], label: string, sleep: any[]): string {
  if (!rows.length) return `${label}: нет данных`
  const lines = [`=== ${label} (${rows[0].date} — ${rows[rows.length-1].date}) ===`]
  const rhr = rows.map((r: any) => r.resting_heart_rate).filter(Boolean)
  const hrv = rows.map((r: any) => r.hrv).filter(Boolean)
  const sleepHours = rows.map((r: any) => r.sleep_hours).filter(Boolean)
  const steps = rows.map((r: any) => r.steps).filter(Boolean)
  if (rhr.length) lines.push(`ЧСС покоя: ${avg(rhr)!.toFixed(0)} уд/мин`)
  if (hrv.length) {
    lines.push(`HRV: среднее ${avg(hrv)!.toFixed(0)} мс`)
    // Days with low HRV (stress) = below 75% of average
    const avgHrv = avg(hrv)!
    const lowHrvDays = rows.filter((r: any) => r.hrv && r.hrv < avgHrv * 0.8)
    if (lowHrvDays.length) {
      lines.push(`Высокий стресс (низкий HRV): ${lowHrvDays.map((r: any) => `${r.date} (${r.hrv.toFixed(0)}мс)`).join(', ')}`)
    }
  }
  if (sleepHours.length) lines.push(`Сон: ${avg(sleepHours)!.toFixed(1)} ч, ночей ≥7ч: ${sleepHours.filter((v: number) => v >= 7).length}/${sleepHours.length}`)
  if (steps.length) lines.push(`Шаги: ${Math.round(avg(steps)!).toLocaleString()}/день`)

  // Bedtime analysis
  const lateBeds = sleep.filter((s: any) => {
    if (!s.bedtime) return false
    const d = new Date(s.bedtime)
    const h = d.getUTCHours()
    // Late = after 01:00 local (rough: UTC+3 → after 22:00 UTC)
    return h >= 22 || h < 6
  })
  if (lateBeds.length) {
    lines.push(`Позднее засыпание: ${lateBeds.map((s: any) => `${s.date} (${fmtBedtime(s.bedtime)})`).join(', ')}`)
  }

  return lines.join('\n')
}

async function sendTelegram(chatId: string, text: string) {
  if (!TG_TOKEN) return
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Allow service-role calls (from telegram-bot) with x-user-id header
    const serviceUserId = req.headers.get('x-user-id')
    let user: any = null
    if (serviceUserId && authHeader.includes(SUPABASE_SERVICE_KEY.slice(0, 20))) {
      const { data } = await supabase.auth.admin.getUserById(serviceUserId)
      user = data.user
    } else {
      const { data, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      if (authErr || !data.user) return new Response('Unauthorized', { status: 401, headers: CORS })
      user = data.user
    }
    if (!user) return new Response('Unauthorized', { status: 401, headers: CORS })

    // Date ranges
    const now = new Date()
    const p1End = new Date(now); p1End.setDate(p1End.getDate() - 1)
    const p1Start = new Date(p1End); p1Start.setDate(p1Start.getDate() - 13)
    const p2End = new Date(p1Start); p2End.setDate(p2End.getDate() - 1)
    const p2Start = new Date(p2End); p2Start.setDate(p2Start.getDate() - 13)

    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    // Check data freshness
    const { data: lastImport } = await supabase
      .from('imports')
      .select('imported_at')
      .eq('user_id', user.id)
      .order('imported_at', { ascending: false })
      .limit(1)
      .single()

    const daysSinceSync = lastImport
      ? Math.floor((Date.now() - new Date(lastImport.imported_at).getTime()) / 86400000)
      : null

    const { data: tgLinkEarly } = await supabase
      .from('telegram_links')
      .select('telegram_chat_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (daysSinceSync !== null && daysSinceSync >= 7 && tgLinkEarly?.telegram_chat_id) {
      await sendTelegram(
        tgLinkEarly.telegram_chat_id,
        `⚠️ Данные с Apple Watch не обновлялись ${daysSinceSync} дн.\n\nДля точного отчёта:\n1. Открой Здоровье на iPhone\n2. Фото профиля → Экспорт данных\n3. Загрузи export.zip в Tonus\n\nОтчёт сформирован по имеющимся данным:`
      )
    }

    // Load metrics + sleep sessions for both periods
    const [r1, r2, s1, s2] = await Promise.all([
      supabase.from('daily_summary').select('*').eq('user_id', user.id).gte('date', fmt(p1Start)).lte('date', fmt(p1End)),
      supabase.from('daily_summary').select('*').eq('user_id', user.id).gte('date', fmt(p2Start)).lte('date', fmt(p2End)),
      supabase.from('sleep_sessions').select('date, bedtime, wake_time, duration_hours').eq('user_id', user.id).gte('date', fmt(p1Start)).lte('date', fmt(p1End)).order('date'),
      supabase.from('sleep_sessions').select('date, bedtime, wake_time, duration_hours').eq('user_id', user.id).gte('date', fmt(p2Start)).lte('date', fmt(p2End)).order('date'),
    ])

    const digest1 = buildDigest(r1.data ?? [], 'Последние 2 недели', s1.data ?? [])
    const digest2 = buildDigest(r2.data ?? [], 'Предыдущие 2 недели', s2.data ?? [])

    const prompt = `Сравни два периода здоровья и напиши отчёт для Telegram.

${digest1}

${digest2}

Требования:
- Только plain text, никакого markdown, никаких звёздочек или решёток
- Emoji разрешены
- Максимум 800 символов итогового текста
- Структура:
  1 строка — общий вывод
  ✅ что улучшилось (с конкретными цифрами)
  📉 что просело — если есть данные о позднем засыпании или стрессовых днях, упомяни конкретные даты
  💡 1-2 совета исходя из слабых мест
- Конкретно по датам и цифрам из данных, без общих фраз
- Без диагнозов, на русском`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
        }),
      }
    )
    if (!geminiRes.ok) throw new Error(`Gemini error: ${await geminiRes.text()}`)
    const geminiData = await geminiRes.json()
    const report = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Не удалось сгенерировать отчёт.'
    const tokensUsed = geminiData.usageMetadata?.totalTokenCount ?? null

    // Save report
    const { data: saved } = await supabase.from('scheduled_reports').insert({
      user_id: user.id,
      period_start: fmt(p1Start),
      period_end: fmt(p1End),
      content: report,
    }).select().single()

    if (tokensUsed) {
      await supabase.from('ai_usage').insert({ user_id: user.id, source: 'biweekly-report', tokens_used: tokensUsed })
    }

    // Send to Telegram if linked
    const { data: tgLink } = await supabase.from('telegram_links').select('telegram_chat_id').eq('user_id', user.id).eq('status', 'active').single()
    if (tgLink?.telegram_chat_id) {
      const tgReport = report.replace(/[*_`#]/g, '')
      const header = `📊 Двухнедельный отчёт\n${fmt(p1Start)} — ${fmt(p1End)}\n\n`
      await sendTelegram(tgLink.telegram_chat_id, (header + tgReport).slice(0, 4096))
      await supabase.from('scheduled_reports').update({ delivered_at: new Date().toISOString(), channel: 'telegram' }).eq('id', saved?.id)
    }

    return new Response(JSON.stringify({ report, saved }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(e.message ?? 'Error', { status: 500, headers: CORS })
  }
})
