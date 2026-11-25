// Разбор payload'а Health Auto Export → строки staging. ЕДИНСТВЕННАЯ реализация:
// её импортируют и edge-функция ingest-health, и скрипт сверки источников
// (scripts/diff-ingest-sources.ts). Мобильное приложение эмитит ЭТОТ ЖЕ формат,
// поэтому его данные проходят тот же парсер и тот же дедуп — сравнивать двух
// отправителей имеет смысл только через одну реализацию.

import { CATALOG_BY_HAE, CATALOG_BY_KEY, aggregateDay, haeValue, isCatalogSum } from './metricCatalog.ts'

// Имена метрик HAE → наши ключи (camelCase, как в боевой metrics_daily)
export const METRIC_MAP: Record<string, string> = {
  step_count: 'steps',
  distance_walking_running: 'distance',
  walking_running_distance: 'distance',
  active_energy: 'activeEnergy',
  apple_exercise_time: 'exerciseMinutes',
  flights_climbed: 'flightsClimbed',
  heart_rate: 'heartRate',
  resting_heart_rate: 'restingHeartRate',
  walking_heart_rate_average: 'walkingHeartRate',
  heart_rate_variability: 'hrv',
  blood_oxygen_saturation: 'oxygenSaturation',
  respiratory_rate: 'respiratoryRate',
  apple_sleeping_wrist_temperature: 'wristTemperature',
  vo2_max: 'vo2max',
  // Per-night value (events/hour), dated in the early morning of the wake-up day.
  breathing_disturbances: 'breathingDisturbances',
  // Per-minute points with qty 0..1 (fraction of the minute in daylight).
  time_in_daylight: 'daylightMinutes',
}
// Метрики-суммы: дедуп = сумма внутри источника, максимум по источникам
export const SUM_METRICS = new Set(['steps', 'distance', 'activeEnergy', 'exerciseMinutes', 'flightsClimbed', 'daylightMinutes'])
// HAE дистанцию даёт в км или метрах в зависимости от настроек — приведём к км если похоже на метры
// "2024-01-15 00:00:00 +0000" → "2024-01-15"; не-строки (мусор в payload) → ''
export const dayOf = (s: unknown) => typeof s === 'string' ? s.slice(0, 10) : ''

export interface MetricRow { user_id: string; date: string; metric: string; avg_val?: number | null; min_val?: number | null; max_val?: number | null; sum_val?: number | null }
export interface SleepRow { user_id: string; date: string; duration_hours: number; deep_hours: number | null; rem_hours: number | null; core_hours: number | null; awake_hours: number | null; bedtime: string | null; wake_time: string | null }

// Структура HAE JSON — внешний формат, поля произвольны, значения проверяем в рантайме.
export interface HaePoint {
  date?: unknown; source?: string
  qty?: unknown; value?: unknown
  Avg?: unknown; avg?: unknown; Min?: unknown; min?: unknown; Max?: unknown; max?: unknown
  totalSleep?: unknown; asleep?: unknown; total?: unknown; deep?: unknown; rem?: unknown; core?: unknown; awake?: unknown
  sleepStart?: unknown; sleepEnd?: unknown; startDate?: unknown
}
export interface HaeMetric { name?: string; units?: unknown; data?: HaePoint[] }
// Heart-rate notifications and ECG arrive through their own HAE automations
// (one data type per automation) — spec 2026-11-25-heart-events-ecg-design.
export interface HaeHeartNotification {
  heartNotification?: unknown; start?: unknown; end?: unknown; threshold?: unknown
  source?: { name?: unknown } | unknown
  heartRateData?: { qty?: unknown }[]
}
export interface HaeEcg {
  start?: unknown; end?: unknown; classification?: unknown; averageHeartRate?: unknown; source?: unknown
  [k: string]: unknown
}
export interface HaePayload {
  data?: { metrics?: HaeMetric[]; heartRateNotifications?: HaeHeartNotification[]; ecg?: HaeEcg[] }
  metrics?: HaeMetric[]
}

/**
 * `Number(null)` is 0 and `Number('')` is 0, so the plain coercion stored a
 * field the source explicitly reported as absent as a measured zero — a sleep
 * phase of 0 h, or a resting heart rate whose minimum touched 0 bpm (the
 * `?? avg` fallback below never fired, because `??` does not treat 0 as
 * missing). Absence has to be rejected before the coercion, not after it.
 * A real zero still passes: that distinction is the whole point.
 */
export function num(v: unknown): number | null {
  // Only a number or a numeric string can be a measurement. Everything else —
  // null, undefined, booleans, arrays, objects — coerces to 0 or 1 and must be
  // rejected before Number() ever sees it.
  if (typeof v !== 'number' && typeof v !== 'string') return null
  if (typeof v === 'string' && v.trim() === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

// Разбор HAE JSON → строки для staging. Возвращает { metrics, sleep }.
export function parseHAE(userId: string, payload: HaePayload): { metrics: MetricRow[]; sleep: SleepRow[] } {
  const metricsArr: HaeMetric[] = payload?.data?.metrics ?? payload?.metrics ?? []
  const metrics: MetricRow[] = []
  const sleep: SleepRow[] = []

  for (const m of metricsArr) {
    const name: string = m?.name ?? ''
    const points: HaePoint[] = m?.data ?? []
    if (!points.length) continue

    if (name === 'sleep_analysis') {
      // группируем по дню; берём запись с максимальной длительностью (основной сон)
      const byDay: Record<string, SleepRow> = {}
      for (const p of points) {
        const date = dayOf(p.date ?? p.sleepStart ?? p.startDate)
        if (!date) continue
        // HAE отдаёт фазы в часах: asleep/total, deep, rem, core; иногда в минутах
        let total = num(p.totalSleep ?? p.asleep ?? p.total ?? p.value)
        let deep = num(p.deep), rem = num(p.rem), core = num(p.core)
        let awake = num(p.awake)
        // если значения выглядят как минуты (>16) — переведём в часы
        const toH = (x: number | null) => x == null ? null : (x > 16 ? x / 60 : x)
        total = toH(total); deep = toH(deep); rem = toH(rem); core = toH(core)
        // Residual ambiguity: awake is the one field whose real values can fall
        // inside this same 0..16 band (a source reporting minutes could send 5
        // or 9), so a minutes-awake value here would be silently read as hours.
        // Production is verified to send hours (0.1498 h on 2026-08-13), so this
        // is latent, not live — noted so the next reader knows it was weighed.
        awake = toH(awake)
        // Ночное бодрствование дольше 6 ч — испорченное значение. Гасим только
        // его: длительность сна в этой же записи измерена независимо и остаётся
        // годной. NULL здесь означает «не знаем», а не «ноль».
        if (awake != null && (awake < 0 || awake > 6)) awake = null
        if (total == null || total <= 0 || total > 16) continue // отбрасываем мусор
        const prev = byDay[date]
        if (!prev || total > prev.duration_hours) {
          byDay[date] = {
            user_id: userId, date, duration_hours: total,
            deep_hours: deep, rem_hours: rem, core_hours: core,
            awake_hours: awake,
            // полные дата-время (боевая колонка — timestamptz); HH:MM не подходит
            bedtime: p.sleepStart ? String(p.sleepStart) : null,
            wake_time: p.sleepEnd ? String(p.sleepEnd) : null,
          }
        }
      }
      sleep.push(...Object.values(byDay))
      continue
    }

    const key = METRIC_MAP[name]
    if (!key) {
      // Metrics added through the catalog (docs/superpowers/specs/2026-11-25-metric-catalog-design.md)
      const entry = CATALOG_BY_HAE.get(name)
      if (!entry) continue
      const units = String(m?.units ?? '')
      const perDay: Record<string, { v: number; src: string }[]> = {}
      for (const p of points) {
        const date = dayOf(p.date)
        const q = num(p.Avg ?? p.avg ?? p.qty ?? p.value)
        if (!date || q == null) continue
        ;(perDay[date] ??= []).push({ v: haeValue(entry, q, units), src: p.source ?? 'unknown' })
      }
      for (const [date, pts] of Object.entries(perDay)) {
        const agg = aggregateDay(entry, pts)
        if (agg) metrics.push({ user_id: userId, date, metric: entry.key, ...agg })
      }
      continue
    }

    if (SUM_METRICS.has(key)) {
      // сумма-внутри-источника → максимум-по-источникам (iPhone+Watch не задваиваем)
      const perDay: Record<string, Record<string, number>> = {}
      for (const p of points) {
        const date = dayOf(p.date)
        const q = num(p.qty ?? p.value)
        if (!date || q == null) continue
        const src = p.source ?? 'unknown'
        ;(perDay[date] ??= {})[src] = (perDay[date][src] ?? 0) + q
      }
      const units = String(m?.units ?? '').toLowerCase()
      for (const [date, bySrc] of Object.entries(perDay)) {
        let v = Math.max(...Object.values(bySrc))
        if (key === 'distance' && v > 100) v = v / 1000 // метры → км
        // активная энергия: HAE отдаёт в кДж, у нас в ккал
        if (key === 'activeEnergy' && (units.includes('kj') || units.includes('кдж'))) v = v / 4.184
        // целочисленные метрики округляем (HAE может слать дроби при агрегации)
        if (key === 'steps' || key === 'flightsClimbed' || key === 'exerciseMinutes' || key === 'daylightMinutes') v = Math.round(v)
        metrics.push({ user_id: userId, date, metric: key, sum_val: v })
      }
    } else {
      // усреднённые метрики: один день — берём avg/min/max
      const perDay: Record<string, { sum: number; n: number; min: number; max: number }> = {}
      for (const p of points) {
        const date = dayOf(p.date)
        const avg = num(p.Avg ?? p.avg ?? p.qty ?? p.value)
        if (!date || avg == null) continue
        const mn = num(p.Min ?? p.min) ?? avg
        const mx = num(p.Max ?? p.max) ?? avg
        const cur = perDay[date] ??= { sum: 0, n: 0, min: mn, max: mx }
        cur.sum += avg; cur.n += 1; cur.min = Math.min(cur.min, mn); cur.max = Math.max(cur.max, mx)
      }
      for (const [date, a] of Object.entries(perDay)) {
        let avg = a.sum / a.n, mn = a.min, mx = a.max
        if (key === 'oxygenSaturation') { // храним как долю (×100 при показе)
          const norm = (x: number) => x > 1.5 ? x / 100 : x
          avg = norm(avg); mn = norm(mn); mx = norm(mx)
        }
        metrics.push({ user_id: userId, date, metric: key, avg_val: avg, min_val: mn, max_val: mx })
      }
    }
  }
  return { metrics, sleep }
}

// Сырые посекундные замеры пульса для карты стресса (heart_rate_samples).
// Дедуп по ts (Apple пишет несколько в секунду). Только если пришли сэмплы.
export function parseHRSamples(userId: string, payload: HaePayload): { user_id: string; ts: string; bpm: number; source: string }[] {
  const metricsArr: HaeMetric[] = payload?.data?.metrics ?? payload?.metrics ?? []
  const hr = metricsArr.find(m => m?.name === 'heart_rate')
  if (!hr || !Array.isArray(hr.data)) return []
  const byTs = new Map<string, { user_id: string; ts: string; bpm: number; source: string }>()
  for (const p of hr.data) {
    const bpm = num(p.Avg ?? p.avg ?? p.qty ?? p.value)
    if (bpm == null || !p.date) continue
    const ts = new Date(String(p.date)).toISOString()
    byTs.set(ts, { user_id: userId, ts, bpm: Math.round(bpm), source: p.source ?? 'Apple' })
  }
  return [...byTs.values()]
}

/** Stored as sum_val (merge rule: max) — legacy sum metrics and catalog sum/count metrics. */
export function isSumMetric(key: string): boolean {
  if (SUM_METRICS.has(key)) return true
  const entry = CATALOG_BY_KEY.get(key)
  return entry ? isCatalogSum(entry) : false
}

export interface HeartEventRow {
  user_id: string
  kind: 'high_hr' | 'low_hr' | 'irregular_rhythm' | 'ecg' | 'other'
  start_ts: string
  end_ts: string | null
  threshold: number | null
  hr_min: number | null
  hr_max: number | null
  hr_avg: number | null
  classification: string | null
  source: string | null
}

/** "2026-01-29 03:10:00 +0100" → ISO UTC; anything unparsable → null. */
export function haeTimestamp(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/)
  const d = new Date(m ? `${m[1]}T${m[2]}${m[3]}:${m[4]}` : v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// HAE documents only the high value ('high_heart_rate_notification'); match by
// substring so the low and irregular-rhythm variants land correctly too.
function notificationKind(v: unknown): HeartEventRow['kind'] {
  const s = typeof v === 'string' ? v.toLowerCase() : ''
  if (s.includes('irregular')) return 'irregular_rhythm'
  if (s.includes('low')) return 'low_hr'
  if (s.includes('high')) return 'high_hr'
  return 'other'
}

/** Heart-rate notifications and ECG readings → heart_events rows. Voltage samples are dropped. */
export function parseHeartEvents(userId: string, payload: HaePayload): HeartEventRow[] {
  const out: HeartEventRow[] = []
  for (const n of payload?.data?.heartRateNotifications ?? []) {
    const start_ts = haeTimestamp(n.start)
    if (!start_ts) continue
    const hr = (n.heartRateData ?? []).map(p => num(p?.qty)).filter((v): v is number => v != null)
    const src = (n.source as { name?: unknown } | undefined)?.name
    out.push({
      user_id: userId,
      kind: notificationKind(n.heartNotification),
      start_ts,
      end_ts: haeTimestamp(n.end),
      threshold: num(n.threshold),
      hr_min: hr.length ? Math.min(...hr) : null,
      hr_max: hr.length ? Math.max(...hr) : null,
      hr_avg: hr.length ? hr.reduce((a, b) => a + b, 0) / hr.length : null,
      classification: null,
      source: typeof src === 'string' ? src : null,
    })
  }
  for (const e of payload?.data?.ecg ?? []) {
    const start_ts = haeTimestamp(e.start)
    if (!start_ts) continue
    out.push({
      user_id: userId,
      kind: 'ecg',
      start_ts,
      end_ts: haeTimestamp(e.end),
      threshold: null,
      hr_min: null,
      hr_max: null,
      hr_avg: num(e.averageHeartRate),
      classification: typeof e.classification === 'string' ? e.classification : null,
      source: typeof e.source === 'string' ? e.source : null,
    })
  }
  return out
}
