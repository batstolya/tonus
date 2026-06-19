import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget } from '../_shared/costGuard.ts'

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

// Разбивает длинный текст на части ≤4000 символов по границам абзацев
function splitForTelegram(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text]
  const parts: string[] = []
  let buf = ''
  for (const para of text.split('\n')) {
    if ((buf + '\n' + para).length > limit) {
      if (buf) parts.push(buf)
      buf = para
    } else {
      buf = buf ? `${buf}\n${para}` : para
    }
  }
  if (buf) parts.push(buf)
  return parts
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

    // AI Cost Guard
    const budget = await checkBudget(supabase, user.id)
    if (!budget.ok) return new Response(JSON.stringify({ error: 'budget_exceeded' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } })

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

    // Load metrics + sleep + nutrition + supplements + labs for both periods
    const [r1, r2, s1, s2, intake, supLogs, supList, labs, noteRowsRes] = await Promise.all([
      supabase.from('daily_summary').select('*').eq('user_id', user.id).gte('date', fmt(p1Start)).lte('date', fmt(p1End)),
      supabase.from('daily_summary').select('*').eq('user_id', user.id).gte('date', fmt(p2Start)).lte('date', fmt(p2End)),
      supabase.from('sleep_sessions').select('date, bedtime, wake_time, duration_hours, deep_hours, rem_hours, core_hours').eq('user_id', user.id).gte('date', fmt(p1Start)).lte('date', fmt(p1End)).order('date'),
      supabase.from('sleep_sessions').select('date, bedtime, wake_time, duration_hours, deep_hours, rem_hours, core_hours').eq('user_id', user.id).gte('date', fmt(p2Start)).lte('date', fmt(p2End)).order('date'),
      supabase.from('intake_events').select('ts, type, amount, unit, note').eq('user_id', user.id).gte('ts', `${fmt(p1Start)}T00:00:00Z`).lte('ts', `${fmt(p1End)}T23:59:59Z`).order('ts'),
      supabase.from('supplement_logs').select('date, taken, supplements(name)').eq('user_id', user.id).eq('taken', true).gte('date', fmt(p1Start)).lte('date', fmt(p1End)),
      supabase.from('supplements').select('id, name').eq('user_id', user.id).eq('active', true),
      supabase.from('lab_results').select('marker, value, unit, date').eq('user_id', user.id).order('date', { ascending: false }).limit(60),
      supabase.from('context_notes').select('date, note').eq('user_id', user.id).gte('date', fmt(p1Start)).lte('date', fmt(p1End)).order('date'),
    ])

    const digest1 = buildDigest(r1.data ?? [], 'Последние 2 недели', s1.data ?? [])
    const digest2 = buildDigest(r2.data ?? [], 'Предыдущие 2 недели', s2.data ?? [])

    // SpO2 — хранится как доля (0.96 = 96%), переводим в проценты
    const spo2Block = (() => {
      const vals = (r1.data ?? []).map((r: any) => r.oxygen_saturation).filter(Boolean).map((v: number) => v * 100)
      if (!vals.length) return ''
      const lows = (r1.data ?? []).filter((r: any) => r.oxygen_saturation && r.oxygen_saturation * 100 < 94)
      return `\nКислород (SpO2): средн ${avg(vals)!.toFixed(0)}%, мин ${Math.min(...vals).toFixed(0)}%` +
        (lows.length ? `, дни <94%: ${lows.map((r: any) => `${r.date} (${(r.oxygen_saturation * 100).toFixed(0)}%)`).join(', ')}` : '')
    })()

    // Фазы сна
    const sleepStagesBlock = (() => {
      const d = (s1.data ?? []).map((s: any) => s.deep_hours).filter(Boolean)
      const r = (s1.data ?? []).map((s: any) => s.rem_hours).filter(Boolean)
      const c = (s1.data ?? []).map((s: any) => s.core_hours).filter(Boolean)
      if (!d.length && !r.length) return ''
      const lines = ['\nФазы сна (средн/ночь):']
      if (d.length) lines.push(`глубокий ${avg(d)!.toFixed(1)}ч`)
      if (r.length) lines.push(`REM ${avg(r)!.toFixed(1)}ч`)
      if (c.length) lines.push(`лёгкий ${avg(c)!.toFixed(1)}ч`)
      return lines.join(' ')
    })()

    // Питание / события
    const nutritionBlock = (() => {
      const ev = intake.data ?? []
      if (!ev.length) return ''
      const cnt = (t: string) => ev.filter((e: any) => e.type === t).length
      const coffee = cnt('coffee'), alcohol = cnt('alcohol'), meals = cnt('meal'), water = cnt('water')
      const alcoholDays = [...new Set(ev.filter((e: any) => e.type === 'alcohol').map((e: any) => e.ts.slice(0, 10)))]
      const lines = ['\nПитание/события за 2 недели:']
      if (coffee) lines.push(`☕ кофе: ${coffee} раз`)
      if (alcohol) lines.push(`🍷 алкоголь: ${alcohol} раз (дни: ${alcoholDays.join(', ')})`)
      if (meals) lines.push(`🍽 приёмов еды записано: ${meals}`)
      if (water) lines.push(`💧 вода: ${water} записей`)
      const notes = ev.filter((e: any) => e.note).map((e: any) => `${e.ts.slice(5, 10)} ${e.note}`)
      if (notes.length) lines.push(`заметки еды: ${notes.join('; ')}`)
      return lines.join('\n')
    })()

    // Приём препаратов (соблюдение)
    const adherenceBlock = (() => {
      const sups = supList.data ?? []
      if (!sups.length) return ''
      const taken = supLogs.data ?? []
      const days = 14
      const lines = ['\nПриём препаратов (за 14 дней):']
      for (const sup of sups) {
        const n = taken.filter((t: any) => (t.supplements as any)?.name === sup.name).length
        lines.push(`${sup.name}: ${n}/${days} дней (${Math.round(n / days * 100)}%)`)
      }
      return lines.join('\n')
    })()

    // Анализы
    const labsBlock = (() => {
      const rows = labs.data ?? []
      if (!rows.length) return ''
      const byMarker: Record<string, any[]> = {}
      for (const r of rows) (byMarker[r.marker] ??= []).push(r)
      const lines = ['\nАнализы (последнее значение, тренд):']
      for (const [marker, entries] of Object.entries(byMarker)) {
        const latest = entries[0]
        const u = latest.unit ? ` ${latest.unit}` : ''
        if (entries.length >= 2) {
          const delta = latest.value - entries[1].value
          lines.push(`${marker}: ${latest.value}${u} (${latest.date}, ${delta > 0 ? '+' : ''}${delta.toFixed(1)} к пред.)`)
        } else lines.push(`${marker}: ${latest.value}${u} (${latest.date})`)
      }
      return lines.join('\n')
    })()

    const noteRows = noteRowsRes.data
    const notesBlock = noteRows?.length
      ? `\nЗаметки дня (со слов пользователя — объясняют всплески и просадки):\n${noteRows.map((n: any) => `${n.date}: ${n.note}`).join('\n')}`
      : ''

    // Настройки отчёта: подробность + приватность (B4)
    const { data: repSet } = await supabase
      .from('report_settings')
      .select('detail_level, send_sensitive')
      .eq('user_id', user.id)
      .maybeSingle()
    const detail = repSet?.detail_level ?? 'full'
    const sensitive = repSet?.send_sensitive ?? false
    // приватность: без согласия не включаем анализы и приём препаратов
    const safeLabsBlock = sensitive ? labsBlock : ''
    const safeAdherenceBlock = sensitive ? adherenceBlock : ''

    const periodLabel = `${Math.round((p1End.getTime() - p1Start.getTime()) / 86400000) + 1} дн.`
    const detailSpec = detail === 'short'
      ? `Формат: КРАТКО, до 800 символов. Разделы:
  📋 Итог (1-2 предложения)
  ✅ что улучшилось · 📉 что просело (с цифрами)
  💡 1-2 совета`
      : detail === 'medium'
      ? `Формат: СРЕДНЕ. Основные разделы с цифрами:
  📋 Итог · 😴 Сон · ❤️ Сердце/HRV · 🏃 Активность · 🍽 Привычки · 💡 3 совета`
      : `Формат: ПОДРОБНО, по всем разделам с цифрами и датами:
  📋 Краткий итог
  😴 Сон — длительность, фазы (глубокий/REM), позднее засыпание, динамика
  ❤️ Сердце и восстановление — ЧСС покоя, HRV, стрессовые дни
  🏃 Активность — шаги, калории, динамика
  🫁 Кислород — если есть SpO2
  🍽 Питание и привычки — кофе, алкоголь, еда; связь с самочувствием/сном
${sensitive ? '  💊 Препараты — соблюдение приёма\n  🧪 Анализы — отклонения и тренды\n' : ''}  🔗 Связи и закономерности — свяжи события из заметок с метриками по датам
  💡 Рекомендации — 3-5 конкретных советов`

    const prompt = `Ты — опытный аналитик здоровья. Напиши отчёт для пользователя за ${periodLabel}.

${digest1}
${spo2Block}${sleepStagesBlock}${nutritionBlock}${safeAdherenceBlock}${safeLabsBlock}${notesBlock}

ДЛЯ СРАВНЕНИЯ — предыдущий период:
${digest2}

${detailSpec}

Общие требования:
- Plain text, без markdown (никаких *, #, _). Emoji для заголовков разделов желательны.
- Опирайся на личные тренды пользователя, сравнивай с его же прошлым периодом, не с абсолютными нормами.
- Конкретика по датам и цифрам, без воды и общих фраз.
- Без медицинских диагнозов. При тревожных значениях мягко советуй врача.
- На русском.`

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
      const header = `📊 Подробный двухнедельный отчёт\n${fmt(p1Start)} — ${fmt(p1End)}\n\n`
      const chunks = splitForTelegram(header + tgReport)
      for (const chunk of chunks) {
        await sendTelegram(tgLink.telegram_chat_id, chunk)
        await new Promise(r => setTimeout(r, 400)) // не упереться в rate limit
      }
      await supabase.from('scheduled_reports').update({ delivered_at: new Date().toISOString(), channel: 'telegram' }).eq('id', saved?.id)
    }

    return new Response(JSON.stringify({ report, saved }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(e.message ?? 'Error', { status: 500, headers: CORS })
  }
})
