import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget } from '../_shared/costGuard.ts'
import { daysSinceFreshData } from '../_shared/staleness.ts'
import { plannedDaysInRange, attendance, scheduleWeekdays, type DayTimes } from '../_shared/workoutPlan.ts'
import { isValidInternalSecret } from '../_shared/auth.ts'
import { sendTelegram as sendTelegramWithToken } from '../_shared/telegram.ts'
import { aiConsentRequiredResponse, fetchGeminiWithConsent, isAiConsentRequired } from '../_shared/aiConsent.ts'
import { corsHeadersFor } from '../_shared/cors.ts'
import { loadUserTimezone } from '../_shared/userTimezone.ts'
import { coverage, lateBedtimes, lateComparisonLine, lowHrvDays, median } from './digest.ts'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INTERNAL_SECRET = Deno.env.get('TONUS_INTERNAL_SECRET') ?? ''
const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''

const ALLOWED_ORIGINS = Deno.env.get('TONUS_ALLOWED_ORIGINS') ?? ''

function avg(vals: number[]) { return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null }

// Строки из daily_summary / sleep_sessions / intake_events — локальные типы
// с реально используемыми колонками (клиентский database.types.ts в Deno не тянем).
interface DailyRow {
  date: string
  resting_heart_rate: number | null
  hrv: number | null
  sleep_hours: number | null
  steps: number | null
  oxygen_saturation: number | null
}
interface SleepSessionRow {
  date: string
  bedtime: string | null
  wake_time: string | null
  duration_hours: number | null
  deep_hours: number | null
  rem_hours: number | null
  core_hours: number | null
}
interface IntakeRow { ts: string; type: string; amount: number | null; unit: string | null; note: string | null }
interface LabRow { marker: string; value: number; unit: string | null; date: string }

// .filter(Boolean) не сужает (number | null)[] → number[]; нужен type guard.
const nums = (vals: (number | null | undefined)[]): number[] =>
  vals.filter((v): v is number => v != null)

const PERIOD_DAYS = 14

function buildDigest(
  rows: DailyRow[],
  label: string,
  sleep: SleepSessionRow[],
  tz: string,
  hrvBaseline: number | null,
): string {
  if (!rows.length) return `${label}: нет данных`
  const lines = [`=== ${label} (${rows[0].date} — ${rows[rows.length-1].date}) ===`]
  const rhr = nums(rows.map(r => r.resting_heart_rate))
  const hrv = nums(rows.map(r => r.hrv))
  const sleepHours = nums(rows.map(r => r.sleep_hours))
  const steps = nums(rows.map(r => r.steps))
  lines.push(coverage(PERIOD_DAYS, rows.length, sleepHours.length))
  if (rhr.length) lines.push(`ЧСС покоя: ${avg(rhr)!.toFixed(0)} уд/мин`)
  if (hrv.length) {
    lines.push(`HRV: среднее ${avg(hrv)!.toFixed(0)} мс`)
    if (hrvBaseline != null) {
      const low = lowHrvDays(rows, hrvBaseline)
      if (low.length) {
        lines.push(`HRV ниже 80% личной 4-недельной медианы (${hrvBaseline.toFixed(0)} мс): ${low.map(r => `${r.date} (${r.hrv.toFixed(0)}мс)`).join(', ')}`)
      }
    }
  }
  if (sleepHours.length) lines.push(`Сон: ${avg(sleepHours)!.toFixed(1)} ч, ночей ≥7ч: ${sleepHours.filter(v => v >= 7).length}/${sleepHours.length}`)
  if (steps.length) lines.push(`Шаги: ${Math.round(avg(steps)!).toLocaleString()}/день`)

  const lateBeds = lateBedtimes(sleep, tz)
  if (lateBeds.length) {
    lines.push(`Позднее засыпание: ${lateBeds.map(s => `${s.date} (${s.local})`).join(', ')}`)
  }

  return lines.join('\n')
}

const sendTelegram = (chatId: string, text: string) => sendTelegramWithToken(TG_TOKEN, chatId, text)

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
  const CORS = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Allow internal calls (from telegram-bot) with x-user-id + x-internal-secret
    const serviceUserId = req.headers.get('x-user-id')
    let user: User | null = null
    if (serviceUserId && isValidInternalSecret(req, INTERNAL_SECRET)) {
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

    // Check data freshness по самому недавнему из путей: ручной экспорт (imports)
    // или автосинк Apple Health (ingest_tokens.last_ingest_at).
    const [{ data: lastImport }, { data: ingestTok }] = await Promise.all([
      supabase.from('imports').select('imported_at')
        .eq('user_id', user.id).order('imported_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('ingest_tokens').select('last_ingest_at').eq('user_id', user.id).maybeSingle(),
    ])

    const daysSinceSync = daysSinceFreshData(Date.now(), lastImport?.imported_at, ingestTok?.last_ingest_at)

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
    const [r1, r2, s1, s2, intake, supLogs, supList, labs, noteRowsRes, wsRes, exminRes] = await Promise.all([
      supabase.from('daily_summary').select('*').eq('user_id', user.id).gte('date', fmt(p1Start)).lte('date', fmt(p1End)),
      supabase.from('daily_summary').select('*').eq('user_id', user.id).gte('date', fmt(p2Start)).lte('date', fmt(p2End)),
      supabase.from('sleep_sessions').select('date, bedtime, wake_time, duration_hours, deep_hours, rem_hours, core_hours').eq('user_id', user.id).gte('date', fmt(p1Start)).lte('date', fmt(p1End)).order('date'),
      supabase.from('sleep_sessions').select('date, bedtime, wake_time, duration_hours, deep_hours, rem_hours, core_hours').eq('user_id', user.id).gte('date', fmt(p2Start)).lte('date', fmt(p2End)).order('date'),
      supabase.from('intake_events').select('ts, type, amount, unit, note').eq('user_id', user.id).gte('ts', `${fmt(p1Start)}T00:00:00Z`).lte('ts', `${fmt(p1End)}T23:59:59Z`).order('ts'),
      supabase.from('supplement_logs').select('date, taken, supplements(name)').eq('user_id', user.id).eq('taken', true).gte('date', fmt(p1Start)).lte('date', fmt(p1End)),
      supabase.from('supplements').select('id, name').eq('user_id', user.id).eq('active', true),
      supabase.from('lab_results').select('marker, value, unit, date').eq('user_id', user.id).order('date', { ascending: false }).limit(60),
      supabase.from('context_notes').select('date, note').eq('user_id', user.id).gte('date', fmt(p1Start)).lte('date', fmt(p1End)).order('date'),
      supabase.from('workout_schedule').select('day_times, enabled').eq('user_id', user.id).maybeSingle(),
      // exerciseMinutes есть только в EAV (нет в daily_summary/daily_metrics view)
      supabase.from('metrics_daily').select('date, sum_val').eq('user_id', user.id).eq('metric', 'exerciseMinutes').gte('date', fmt(p1Start)).lte('date', fmt(p1End)),
    ])

    const rows1: DailyRow[] = r1.data ?? []
    const rows2: DailyRow[] = r2.data ?? []
    const sleep1: SleepSessionRow[] = s1.data ?? []
    const sleep2: SleepSessionRow[] = s2.data ?? []
    const intakeRows: IntakeRow[] = intake.data ?? []

    // Один источник таймзоны для всех локальных времён (profiles.timezone).
    const tz = await loadUserTimezone(supabase, user.id)
    // Личный baseline HRV = медиана по обоим периодам (~4 недели данных уже в памяти).
    const hrvBaseline = median(nums([...rows1, ...rows2].map(r => r.hrv)))

    const digest1 = buildDigest(rows1, 'Последние 2 недели', sleep1, tz, hrvBaseline)
    const digest2 = buildDigest(rows2, 'Предыдущие 2 недели', sleep2, tz, hrvBaseline)
    // Межпериодные сравнения считаем кодом — модель не должна выводить их сама.
    const lateFact = lateComparisonLine(lateBedtimes(sleep1, tz).length, lateBedtimes(sleep2, tz).length)

    // SpO2 — хранится как доля (0.96 = 96%), переводим в проценты
    const spo2Block = (() => {
      const vals = nums(rows1.map(r => r.oxygen_saturation)).map(v => v * 100)
      if (!vals.length) return ''
      const lows = rows1.flatMap(r =>
        r.oxygen_saturation != null && r.oxygen_saturation * 100 < 94
          ? [{ date: r.date, oxygen_saturation: r.oxygen_saturation }] : [])
      return `\nКислород (SpO2): средн ${avg(vals)!.toFixed(0)}%, мин ${Math.min(...vals).toFixed(0)}%` +
        (lows.length ? `, дни <94%: ${lows.map(r => `${r.date} (${(r.oxygen_saturation * 100).toFixed(0)}%)`).join(', ')}` : '')
    })()

    // Фазы сна
    const sleepStagesBlock = (() => {
      const d = nums(sleep1.map(s => s.deep_hours))
      const r = nums(sleep1.map(s => s.rem_hours))
      const c = nums(sleep1.map(s => s.core_hours))
      if (!d.length && !r.length) return ''
      const lines = ['\nФазы сна (средн/ночь):']
      if (d.length) lines.push(`глубокий ${avg(d)!.toFixed(1)}ч`)
      if (r.length) lines.push(`REM ${avg(r)!.toFixed(1)}ч`)
      if (c.length) lines.push(`лёгкий ${avg(c)!.toFixed(1)}ч`)
      return lines.join(' ')
    })()

    // Питание / события
    const nutritionBlock = (() => {
      const ev = intakeRows
      if (!ev.length) return ''
      const cnt = (t: string) => ev.filter(e => e.type === t).length
      const coffee = cnt('coffee'), alcohol = cnt('alcohol'), meals = cnt('meal'), water = cnt('water')
      const alcoholDays = [...new Set(ev.filter(e => e.type === 'alcohol').map(e => e.ts.slice(0, 10)))]
      const lines = ['\nПитание/события за 2 недели:']
      if (coffee) lines.push(`☕ кофе: ${coffee} раз`)
      if (alcohol) lines.push(`🍷 алкоголь: ${alcohol} раз (дни: ${alcoholDays.join(', ')})`)
      if (meals) lines.push(`🍽 приёмов еды записано: ${meals}`)
      if (water) lines.push(`💧 вода: ${water} записей`)
      const notes = ev.filter(e => e.note).map(e => `${e.ts.slice(5, 10)} ${e.note}`)
      if (notes.length) lines.push(`заметки еды: ${notes.join('; ')}`)
      return lines.join('\n')
    })()

    // Приём препаратов (соблюдение)
    const adherenceBlock = (() => {
      const sups: { id: string; name: string }[] = supList.data ?? []
      if (!sups.length) return ''
      // join supplements(name): рантайм для to-one отдаёт объект, но untyped-клиент
      // выводит массив — принимаем обе формы
      type SupJoin = { name: string } | { name: string }[] | null
      const supName = (s: SupJoin) => Array.isArray(s) ? s[0]?.name : s?.name
      const taken: { date: string; taken: boolean; supplements: SupJoin }[] = supLogs.data ?? []
      const days = 14
      const lines = ['\nПриём препаратов (за 14 дней):']
      for (const sup of sups) {
        const n = taken.filter(t => supName(t.supplements) === sup.name).length
        lines.push(`${sup.name}: ${n}/${days} дней (${Math.round(n / days * 100)}%)`)
      }
      return lines.join('\n')
    })()

    // Анализы
    const labsBlock = (() => {
      const rows: LabRow[] = labs.data ?? []
      if (!rows.length) return ''
      const byMarker: Record<string, LabRow[]> = {}
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

    // Тренировки: соблюдение плана (спека workout-schedule §4)
    const workoutBlock = (() => {
      const ws: { day_times: DayTimes | null; enabled: boolean } | null = wsRes.data
      if (!ws?.enabled) return ''
      const days = scheduleWeekdays(ws.day_times ?? {})
      if (!days.length) return ''
      const planned = plannedDaysInRange(days, fmt(p1Start), fmt(p1End))
      if (!planned.length) return ''
      const done = new Set<string>()
      const exmin: { date: string; sum_val: number | null }[] = exminRes.data ?? []
      for (const r of exmin) if ((r.sum_val ?? 0) >= 30) done.add(r.date)
      for (const e of intakeRows) if (e.type === 'workout') done.add(e.ts.slice(0, 10))
      const a = attendance(planned, done)
      return `\n🏋️ Тренировки: ${a.done} из ${a.total} по плану (${days.length}×/нед)`
    })()

    const noteRows: { date: string; note: string }[] = noteRowsRes.data ?? []
    const notesBlock = noteRows.length
      ? `\nЗаметки дня (со слов пользователя — объясняют всплески и просадки):\n${noteRows.map(n => `${n.date}: ${n.note}`).join('\n')}`
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
${spo2Block}${sleepStagesBlock}${nutritionBlock}${workoutBlock}${safeAdherenceBlock}${safeLabsBlock}${notesBlock}

ДЛЯ СРАВНЕНИЯ — предыдущий период:
${digest2}

ГОТОВЫЕ ФАКТЫ СРАВНЕНИЯ (используй как есть, не пересчитывай):
${lateFact}

${detailSpec}

Общие требования:
- Plain text, без markdown (никаких *, #, _). Emoji для заголовков разделов желательны.
- Опирайся на личные тренды пользователя, сравнивай с его же прошлым периодом, не с абсолютными нормами.
- Конкретика по датам и цифрам, без воды и общих фраз.
- Межпериодные сравнения бери ТОЛЬКО из готовых фактов и дайджестов — сам ничего не пересчитывай и не сравнивай количества.
- В кратком итоге укажи покрытие данных (строки «Покрытие данных» из дайджеста).
- Разделяй формулировки: факт из данных / возможная связь / предположение — и помечай предположения словами «возможно», «нельзя исключить».
- Физиологию трактуй осторожно: низкая ЧСС покоя или изменение HRV — это тренд относительно личной нормы, а не «хорошо/плохо» само по себе.
- Без медицинских диагнозов и догадок о причинах болезни (не пиши «вирус», «отравление» и т.п.) — опиши симптомы из заметок и отметь, что причину по данным установить нельзя. При тревожных значениях мягко советуй врача.
- На русском.`

    const geminiRes = await fetchGeminiWithConsent(
      supabase,
      user.id,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
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
  } catch (e) {
    if (isAiConsentRequired(e)) return aiConsentRequiredResponse(CORS)
    return new Response((e as Error).message ?? 'Error', { status: 500, headers: CORS })
  }
})
