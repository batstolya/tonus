// Разбор payload'а Health Auto Export → строки staging. ЕДИНСТВЕННАЯ реализация:
// её импортируют и edge-функция ingest-health, и скрипт сверки источников
// (scripts/diff-ingest-sources.ts). Мобильное приложение эмитит ЭТОТ ЖЕ формат,
// поэтому его данные проходят тот же парсер и тот же дедуп — сравнивать двух
// отправителей имеет смысл только через одну реализацию.

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
}
// Метрики-суммы: дедуп = сумма внутри источника, максимум по источникам
export const SUM_METRICS = new Set(['steps', 'distance', 'activeEnergy', 'exerciseMinutes', 'flightsClimbed'])
// HAE дистанцию даёт в км или метрах в зависимости от настроек — приведём к км если похоже на метры
// "2024-01-15 00:00:00 +0000" → "2024-01-15"; не-строки (мусор в payload) → ''
export const dayOf = (s: unknown) => typeof s === 'string' ? s.slice(0, 10) : ''

export interface MetricRow { user_id: string; date: string; metric: string; avg_val?: number | null; min_val?: number | null; max_val?: number | null; sum_val?: number | null }
export interface SleepRow { user_id: string; date: string; duration_hours: number; deep_hours: number | null; rem_hours: number | null; core_hours: number | null; bedtime: string | null; wake_time: string | null }

// Структура HAE JSON — внешний формат, поля произвольны, значения проверяем в рантайме.
export interface HaePoint {
  date?: unknown; source?: string
  qty?: unknown; value?: unknown
  Avg?: unknown; avg?: unknown; Min?: unknown; min?: unknown; Max?: unknown; max?: unknown
  totalSleep?: unknown; asleep?: unknown; total?: unknown; deep?: unknown; rem?: unknown; core?: unknown
  sleepStart?: unknown; sleepEnd?: unknown; startDate?: unknown
}
export interface HaeMetric { name?: string; units?: unknown; data?: HaePoint[] }
export interface HaePayload { data?: { metrics?: HaeMetric[] }; metrics?: HaeMetric[] }

export function num(v: unknown): number | null { const n = Number(v); return isFinite(n) ? n : null }

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
        // если значения выглядят как минуты (>16) — переведём в часы
        const toH = (x: number | null) => x == null ? null : (x > 16 ? x / 60 : x)
        total = toH(total); deep = toH(deep); rem = toH(rem); core = toH(core)
        if (total == null || total <= 0 || total > 16) continue // отбрасываем мусор
        const prev = byDay[date]
        if (!prev || total > prev.duration_hours) {
          byDay[date] = {
            user_id: userId, date, duration_hours: total,
            deep_hours: deep, rem_hours: rem, core_hours: core,
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
    if (!key) continue

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
        if (key === 'steps' || key === 'flightsClimbed' || key === 'exerciseMinutes') v = Math.round(v)
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
