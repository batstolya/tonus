// Function-calling инструменты чата (design doc, раздел 9.1): модель сама
// запрашивает точные диапазоны данных сверх базового 30-дневного контекста.
// Каждый инструмент — обычный Supabase-запрос с eq('user_id', userId), те же
// RLS-гарантии, что и у остального контекста.

import { computeLagCorrelations, type CorrDailyRow, type EnvDay } from './correlations.ts'

export const CHAT_TOOL_DECLARATIONS = [
  {
    name: 'get_metrics_range',
    description: 'Вернуть ежедневные метрики (пульс покоя, HRV, сон, шаги, ккал, SpO2) за произвольный диапазон дат, максимум 60 дней. Результат содержит rows (по дням) и summary.averages — уже посчитанные на сервере средние. Для любого «среднее …» бери число из summary.averages, НЕ считай сам.',
    parameters: {
      type: 'OBJECT',
      properties: {
        start_date: { type: 'STRING', description: 'Начало диапазона, YYYY-MM-DD' },
        end_date: { type: 'STRING', description: 'Конец диапазона, YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_sleep_range',
    description: 'Вернуть данные сна (время засыпания/пробуждения и фазы) за произвольный диапазон дат, максимум 60 дней. Результат содержит rows (по ночам) и summary.averages — уже посчитанные на сервере средние (duration_hours, deep_hours, rem_hours, core_hours). Для любого «средний сон / средний глубокий …» бери число из summary.averages, НЕ считай сам.',
    parameters: {
      type: 'OBJECT',
      properties: {
        start_date: { type: 'STRING', description: 'Начало диапазона, YYYY-MM-DD' },
        end_date: { type: 'STRING', description: 'Конец диапазона, YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_lab_history',
    description: 'Вернуть всю историю значений одного лабораторного маркера (не только последнее значение и дельту), максимум 50 точек.',
    parameters: {
      type: 'OBJECT',
      properties: {
        marker: { type: 'STRING', description: 'Точное название маркера, как оно упомянуто в контексте (например "Ферритин")' },
      },
      required: ['marker'],
    },
  },
  {
    name: 'get_correlations',
    description: 'Вернуть реальные статистически посчитанные лаг-корреляции между образом жизни (кофе, алкоголь, физактивность, шаги, время засыпания, погода) и метриками (сон, HRV, пульс покоя, готовность) за последние 30 дней. Использовать для любого вопроса «с чем связано» / «почему изменилось» вместо предположений.',
    parameters: {
      type: 'OBJECT',
      properties: {
        outcome: { type: 'STRING', enum: ['sleepHours', 'hrv', 'restingHeartRate', 'readiness'], description: 'Опционально — ограничить результат корреляциями только с этим исходом' },
      },
      required: [],
    },
  },
]

// Минимальная форма Supabase-клиента, которой пользуются эти инструменты:
// цепочка билдера (from().select().eq()...), в конце awaited в { data, error }.
// Достаточно для типобезопасности без зависимости от сгенерированных типов БД.
interface QueryResult {
  data: Record<string, unknown>[] | null
  error: { message?: string } | null
}
interface QueryBuilder extends PromiseLike<QueryResult> {
  select: (cols: string) => QueryBuilder
  eq: (col: string, val: unknown) => QueryBuilder
  gte: (col: string, val: unknown) => QueryBuilder
  lte: (col: string, val: unknown) => QueryBuilder
  in: (col: string, vals: unknown[]) => QueryBuilder
  order: (col: string, opts: { ascending: boolean }) => QueryBuilder
  limit: (n: number) => QueryBuilder
}
export interface SupabaseLike {
  from: (table: string) => QueryBuilder
}

const MAX_RANGE_DAYS = 60

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000)
}

// Битый wake_time (Apple Health присылает кривой sleepEnd — напр. 13.06.2026,
// пробуждение «на сутки позже»): если время в постели невозможно (≤0, >16 ч
// или меньше самой длительности сна), выводим wake = отбой + длительность.
// Зеркало src/lib/sleepFormat.ts::effectiveWake.
export function effectiveWakeIso(
  bedtimeIso: string | null | undefined,
  wakeIso: string | null | undefined,
  durationHours: number | null | undefined,
): string | null | undefined {
  const bed = bedtimeIso ? new Date(bedtimeIso) : null
  if (!bed || isNaN(bed.getTime())) return wakeIso
  const wake = wakeIso ? new Date(wakeIso) : null
  const inBedH = wake && !isNaN(wake.getTime()) ? (wake.getTime() - bed.getTime()) / 3600000 : null
  const plausible = inBedH != null && inBedH > 0 && inBedH <= 16
    && (durationHours == null || inBedH >= durationHours - 0.05)
  if (plausible) return wakeIso
  if (durationHours != null) return new Date(bed.getTime() + durationHours * 3600000).toISOString()
  return wakeIso
}

// Серверные средние по числовым колонкам (пропуская null). Модель считает
// среднее «в уме» с ошибками (7.78 вместо 7.835), поэтому отдаём готовые
// значения — их она и должна называть на вопросы «средний …».
export function numericAverages(
  rows: Record<string, unknown>[],
  keys: string[],
): Record<string, { avg: number; n: number }> {
  const out: Record<string, { avg: number; n: number }> = {}
  for (const k of keys) {
    let sum = 0, n = 0
    for (const r of rows) {
      const v = r[k]
      if (typeof v === 'number' && !isNaN(v)) { sum += v; n++ }
    }
    if (n) out[k] = { avg: Math.round((sum / n) * 1000) / 1000, n }
  }
  return out
}

// UTC ISO → локальное «YYYY-MM-DD HH:MM» в поясе tz. hourCycle h23 держит
// полночь как 00:00 (а не 24:00). Битый/пустой вход → null.
export function toLocalDateTime(iso: string | null | undefined, tz: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}

export async function executeChatTool(
  supabase: SupabaseLike,
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name === 'get_metrics_range' || name === 'get_sleep_range') {
    const start_date = args.start_date as string | undefined
    const end_date = args.end_date as string | undefined
    if (!start_date || !end_date) return { error: 'start_date и end_date обязательны' }
    if (daysBetween(start_date, end_date) > MAX_RANGE_DAYS) {
      return { error: `Диапазон слишком большой, максимум ${MAX_RANGE_DAYS} дней` }
    }
    const table = name === 'get_metrics_range' ? 'daily_metrics' : 'sleep_sessions'
    const cols = name === 'get_metrics_range'
      ? 'date, resting_heart_rate, hrv, sleep_hours, steps, active_energy, oxygen_saturation'
      : 'date, bedtime, wake_time, duration_hours, deep_hours, rem_hours, core_hours'
    const { data, error } = await supabase.from(table).select(cols)
      .eq('user_id', userId).gte('date', start_date).lte('date', end_date)
      .order('date', { ascending: true })
    // Ошибку запроса (напр. невалидная дата от модели) не глотаем в пустой
    // список — иначе модель скажет «нет данных» вместо «не смог получить»
    if (error) return { error: error.message ?? 'Ошибка запроса данных' }

    // Сон: bedtime/wake_time хранятся в UTC. Модель должна отдавать время в
    // поясе пользователя (как таблица в приложении), иначе «отбой 23:35» вместо
    // локального 01:35. Переводим в profiles.timezone (фолбэк Europe/Kyiv).
    if (name === 'get_sleep_range') {
      const { data: tzRows } = await supabase.from('profiles').select('timezone').eq('id', userId).limit(1)
      const tz = (tzRows?.[0] as { timezone?: string } | undefined)?.timezone || 'Europe/Kyiv'
      const rows = (data ?? []).map((r) => {
        const row = r as { bedtime?: string; wake_time?: string; duration_hours?: number }
        return {
          ...(r as Record<string, unknown>),
          bedtime: toLocalDateTime(row.bedtime, tz),
          wake_time: toLocalDateTime(effectiveWakeIso(row.bedtime, row.wake_time, row.duration_hours), tz),
        }
      })
      const summary = {
        nights: (data ?? []).length,
        averages: numericAverages(data ?? [], ['duration_hours', 'deep_hours', 'rem_hours', 'core_hours']),
      }
      return { rows, summary }
    }
    const summary = {
      days: (data ?? []).length,
      averages: numericAverages(data ?? [], ['sleep_hours', 'hrv', 'resting_heart_rate', 'steps', 'active_energy', 'oxygen_saturation']),
    }
    return { rows: data ?? [], summary }
  }

  if (name === 'get_lab_history') {
    const marker = args.marker as string | undefined
    if (!marker) return { error: 'marker обязателен' }
    const { data, error } = await supabase.from('lab_results')
      .select('date, value, unit, ref_range, flag')
      .eq('user_id', userId).eq('marker', marker)
      .order('date', { ascending: true }).limit(50)
    if (error) return { error: error.message ?? 'Ошибка запроса данных' }
    return { rows: data ?? [] }
  }

  if (name === 'get_correlations') {
    const since = new Date(); since.setDate(since.getDate() - 30)
    const sinceStr = since.toISOString().slice(0, 10)
    const [mRes, sRes, exRes, scoreRes, intakeRes, envRes] = await Promise.all([
      supabase.from('daily_metrics').select('date, resting_heart_rate, hrv, sleep_hours, steps').eq('user_id', userId).gte('date', sinceStr),
      supabase.from('sleep_sessions').select('date, bedtime').eq('user_id', userId).gte('date', sinceStr),
      supabase.from('metrics_daily').select('date, sum_val').eq('user_id', userId).eq('metric', 'exerciseMinutes').gte('date', sinceStr),
      supabase.from('daily_scores').select('date, readiness').eq('user_id', userId).gte('date', sinceStr),
      supabase.from('intake_events').select('ts, type').eq('user_id', userId).gte('ts', `${sinceStr}T00:00:00Z`).in('type', ['coffee', 'alcohol']),
      supabase.from('environment_daily').select('date, temp_c, pressure_hpa, daylight_minutes, precipitation_mm, kp_index').eq('user_id', userId).gte('date', sinceStr),
    ])

    // Ошибку любого из запросов не глотаем в «мало данных» — иначе модель
    // спишет сбой БД на нехватку истории (как и у диапазонных инструментов)
    if ([mRes, sRes, exRes, scoreRes, intakeRes, envRes].some((r) => r.error)) {
      return { error: 'Ошибка запроса данных для корреляций' }
    }

    const bedtimeByDate: Record<string, string> = {}
    for (const s of (sRes.data ?? [])) if (s.bedtime) bedtimeByDate[s.date as string] = s.bedtime as string
    const exerciseByDate: Record<string, number> = {}
    for (const e of (exRes.data ?? [])) exerciseByDate[e.date as string] = e.sum_val as number

    const daily: CorrDailyRow[] = (mRes.data ?? []).map((m) => ({
      date: m.date as string,
      sleepHours: (m.sleep_hours as number | null) ?? undefined,
      hrv: (m.hrv as number | null) ?? undefined,
      restingHeartRate: (m.resting_heart_rate as number | null) ?? undefined,
      steps: (m.steps as number | null) ?? undefined,
      exerciseMinutes: exerciseByDate[m.date as string],
      sleepBedtime: bedtimeByDate[m.date as string],
    }))

    const result = computeLagCorrelations({
      daily,
      scores: (scoreRes.data ?? []).map((s) => ({ date: s.date as string, readiness: s.readiness as number })),
      intake: (intakeRes.data ?? []).map((i) => ({ ts: i.ts as string, type: i.type as string })),
      environment: (envRes.data ?? []) as unknown as EnvDay[],
    })

    if ('needMoreDays' in result) {
      return { error: `Недостаточно данных для корреляций, нужно ещё примерно ${result.needMoreDays} дней с обеими метриками` }
    }
    const outcome = args.outcome as string | undefined
    const correlations = outcome ? result.correlations.filter(c => c.outcome === outcome) : result.correlations
    return { correlations }
  }

  return { error: `Неизвестный инструмент: ${name}` }
}
