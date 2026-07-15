import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.2'
import { checkBudget } from '../_shared/costGuard.ts'
import { isValidCronSecret } from '../_shared/auth.ts'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const CRON_SECRET = Deno.env.get('TONUS_CRON_SECRET') ?? ''

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret' }
const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null

// Машинно-проверяемое условие фокуса (зеркало validateFocusCheck из src/lib/coach.ts; Deno не импортит из src).
type DayPredicate =
  | { kind: 'steps_gte'; value: number }
  | { kind: 'sleep_hours_gte'; value: number }
  | { kind: 'bedtime_before'; time: string }
  | { kind: 'meals_gte'; value: number }
  | { kind: 'event_count_lte'; event: string; value: number }
  | { kind: 'event_absent_after'; event: string; time: string }
  | { kind: 'event_present'; event: string }
  | { kind: 'event_absent'; event: string }
  | { kind: 'wellbeing_gte'; value: number }
interface FocusCheck { predicate: DayPredicate; target?: number; label?: string }

const FOCUS_EVENT_TYPES = ['coffee', 'alcohol', 'meal', 'water', 'meds', 'workout', 'illness', 'stress', 'travel', 'custom']
function validateFocusCheck(obj: unknown): FocusCheck | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const p = o.predicate as Record<string, unknown> | null
  if (!p || typeof p !== 'object') return null
  const numOk = (v: unknown): v is number => typeof v === 'number' && isFinite(v)
  const timeOk = (v: unknown): v is string => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v)
  const evOk = (v: unknown): v is string => typeof v === 'string' && FOCUS_EVENT_TYPES.includes(v)
  let ok: boolean
  switch (p.kind) {
    case 'steps_gte': case 'sleep_hours_gte': case 'meals_gte': case 'wellbeing_gte': ok = numOk(p.value); break
    case 'bedtime_before': ok = timeOk(p.time); break
    case 'event_count_lte': ok = evOk(p.event) && numOk(p.value); break
    case 'event_absent_after': ok = evOk(p.event) && timeOk(p.time); break
    case 'event_present': case 'event_absent': ok = evOk(p.event); break
    default: ok = false
  }
  if (!ok) return null
  const out: FocusCheck = { predicate: p as unknown as DayPredicate }
  if (o.target != null) { if (!numOk(o.target) || o.target < 1 || o.target > 7) return null; out.target = Math.round(o.target) }
  if (typeof o.label === 'string') out.label = o.label
  return out
}

// Локальные типы строк с реально используемыми колонками.
type MetricRow = { date: string; resting_heart_rate: number | null; hrv: number | null; sleep_hours: number | null; steps: number | null; active_energy: number | null }
type SleepRow = { date: string; duration_hours: number | null; deep_hours: number | null; rem_hours: number | null; bedtime: string | null }
type IntakeRow = { ts: string; type: string; note: string | null }

async function tgSend(chatId: string, text: string) {
  if (!TG_TOKEN) return
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

// Разбор для одного пользователя
async function runForUser(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const budget = await checkBudget(supabase, userId)
  if (!budget.ok) return null // превышен бюджет — пропускаем разбор
  const now = Date.now()
  const since = new Date(now - 14 * 86400000).toISOString().slice(0, 10)

  const [mRes, sRes, notesRes, intakeRes, _supLogRes, profRes] = await Promise.all([
    supabase.from('daily_metrics').select('date, resting_heart_rate, hrv, sleep_hours, steps, active_energy').eq('user_id', userId).gte('date', since).order('date'),
    supabase.from('sleep_sessions').select('date, duration_hours, deep_hours, rem_hours, bedtime').eq('user_id', userId).gte('date', since),
    supabase.from('context_notes').select('date, note').eq('user_id', userId).gte('date', since).order('date'),
    supabase.from('intake_events').select('ts, type, note').eq('user_id', userId).gte('ts', `${since}T00:00:00Z`),
    supabase.from('supplement_logs').select('date, taken, supplements(name)').eq('user_id', userId).eq('taken', true).gte('date', since),
    supabase.from('coach_profile').select('summary, focus').eq('user_id', userId).maybeSingle(),
  ])

  const m: MetricRow[] = mRes.data ?? []
  if (m.length < 5) return null // мало данных — пропускаем

  const num = (rows: Record<string, unknown>[], k: string): number[] =>
    rows.map(r => r[k]).filter((v): v is number => typeof v === 'number')
  const recent = m.slice(-7), prior = m.slice(-14, -7)
  const cmp = (k: keyof MetricRow) => {
    const r = avg(num(recent, k)), p = avg(num(prior, k))
    if (r == null) return ''
    const d = p != null ? ((r - p) / p) * 100 : 0
    return `${r.toFixed(k === 'sleep_hours' ? 1 : 0)}${p != null ? ` (${d > 0 ? '+' : ''}${d.toFixed(0)}% к прошлой неделе)` : ''}`
  }

  const intake: IntakeRow[] = intakeRes.data ?? []
  const coffee = intake.filter(e => e.type === 'coffee').length
  const alcoholDays = [...new Set(intake.filter(e => e.type === 'alcohol').map(e => e.ts.slice(0, 10)))]
  const noteRows: { date: string; note: string }[] = notesRes.data ?? []
  const notes = noteRows.map(n => `${n.date}: ${n.note}`).join('\n')

  const sleep: SleepRow[] = sRes.data ?? []
  const deep = avg(num(sleep, 'deep_hours')), rem = avg(num(sleep, 'rem_hours'))

  const prof: { summary: string | null; focus: { text?: string } | null } | null = profRes.data
  const profile = prof?.summary ? `\nПРОФИЛЬ: ${prof.summary}` : ''
  const prevFocus = prof?.focus?.text ? `\nПРОШЛЫЙ ФОКУС: «${prof.focus.text}»` : ''

  const prompt = `Ты — персональный коуч по здоровью. Напиши тёплый еженедельный разбор для пользователя в Telegram (plain text, без markdown-звёздочек, можно emoji).
${profile}${prevFocus}

НЕДЕЛЯ (среднее, в скобках динамика):
HRV: ${cmp('hrv')} мс
Пульс покоя: ${cmp('resting_heart_rate')} уд/мин
Сон: ${cmp('sleep_hours')} ч${deep != null ? ` (глубокий ~${deep.toFixed(1)}ч, REM ~${(rem ?? 0).toFixed(1)}ч)` : ''}
Шаги: ${cmp('steps')}
Кофе: ${coffee} раз, алкоголь: дни ${alcoholDays.join(', ') || 'нет'}
Заметки дня:
${notes || 'нет'}

Структура (коротко, по-человечески):
👋 Пара слов как прошла неделя (2-3 предложения, отметь прогресс/спад с цифрами)
💡 1-2 наблюдения или связи (если видно из данных/заметок)
🎯 ОДИН фокус на следующую неделю — конкретный и измеримый (напр. «лечь до 00:00 хотя бы 5 ночей»). Если прошлый фокус был — оцени его и поставь следующий.
❓ Тёплый вопрос пользователю

В конце ДВЕ ОТДЕЛЬНЫЕ строки:
FOCUS: <одна фраза фокуса для трекинга>
CHECK: <JSON условия выполнения за ОДИН день, или none>
JSON строго одной из форм (target — добавь только если цель «N раз в неделю», 1..7):
{"predicate":{"kind":"steps_gte","value":8000}}
{"predicate":{"kind":"sleep_hours_gte","value":7}}
{"predicate":{"kind":"bedtime_before","time":"23:00"}}
{"predicate":{"kind":"meals_gte","value":3}}
{"predicate":{"kind":"event_count_lte","event":"coffee","value":1}}
{"predicate":{"kind":"event_absent_after","event":"coffee","time":"16:00"}}
{"predicate":{"kind":"event_present","event":"workout"},"target":3}
{"predicate":{"kind":"event_absent","event":"alcohol"}}
{"predicate":{"kind":"wellbeing_gte","value":4}}
event ∈ coffee|alcohol|meal|water|meds|workout|illness|stress|travel. ВСЕГДА привязывай CHECK, если фокус хоть как-то выразим этими формами — цели про еду/сон/шаги/время отбоя/кофе/алкоголь/тренировки/самочувствие почти всегда выразимы. CHECK: none — только когда измерить действительно невозможно. Не выдумывай поля.
Без диагнозов. Опирайся на цифры, не выдумывай. На русском.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } }),
    }
  )
  if (!res.ok) return null
  const data = await res.json()
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const tokens = data.usageMetadata?.totalTokenCount ?? null
  if (tokens) await supabase.from('ai_usage').insert({ user_id: userId, source: 'coach-weekly', tokens_used: tokens })

  // вытащить фокус
  const focusMatch = text.match(/FOCUS:\s*(.+)$/m)
  const focusText = focusMatch ? focusMatch[1].trim() : null
  text = text.replace(/\n?FOCUS:.*$/m, '').trim()

  // вытащить машинное условие выполнения
  const checkMatch = text.match(/CHECK:\s*(.+)$/m)
  let focusCheck: FocusCheck | null = null
  if (checkMatch) {
    const raw = checkMatch[1].trim()
    if (raw.toLowerCase() !== 'none') { try { focusCheck = validateFocusCheck(JSON.parse(raw)) } catch { focusCheck = null } }
  }
  text = text.replace(/\n?CHECK:.*$/m, '').trim()

  // сохранить фокус в профиль + событие
  if (focusText) {
    await supabase.from('coach_profile').upsert(
      { user_id: userId, focus: { text: focusText, set_at: new Date().toISOString(), check: focusCheck }, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  }
  await supabase.from('coach_events').insert({ user_id: userId, type: 'weekly', payload: { focus: focusText, text } })

  return text
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const authHeader = req.headers.get('Authorization') ?? ''
    const body: { userId?: unknown } = await req.json().catch(() => ({}))
    // Явные пути (спека §3.2): cron-секрет → массовый режим; JWT → свой юзер; иначе 401.
    // Отсутствие Authorization больше НЕ означает доверие, и service key не является маркером.
    const cronMode = isValidCronSecret(req, CRON_SECRET)
    if (!cronMode && !authHeader) {
      return new Response('unauthorized', { status: 401, headers: CORS })
    }

    let sent = 0
    if (cronMode && !body.userId) {
      // cron: всем активным, у кого не было разбора за 6 дней
      const { data: links } = await supabase.from('telegram_links').select('user_id, telegram_chat_id').eq('status', 'active')
      for (const l of links ?? []) {
        const { data: rs } = await supabase.from('report_settings').select('paused').eq('user_id', l.user_id).maybeSingle()
        if (rs?.paused) continue
        const { data: last } = await supabase.from('coach_events').select('created_at').eq('user_id', l.user_id).eq('type', 'weekly').order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (last && (Date.now() - new Date(last.created_at).getTime()) < 6 * 86400000) continue
        const text = await runForUser(supabase, l.user_id)
        if (text && l.telegram_chat_id) { await tgSend(l.telegram_chat_id, `🧭 Разбор недели\n\n${text}`); sent++ }
      }
      return new Response(JSON.stringify({ sent }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // ручной вызов с токеном пользователя — вернуть текст (для кнопки на сайте)
    const { data, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (error || !data.user) return new Response('Unauthorized', { status: 401, headers: CORS })
    const text = await runForUser(supabase, data.user.id)
    return new Response(JSON.stringify({ text }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'Error' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
