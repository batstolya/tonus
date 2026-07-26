// Сборка payload'а в формате Health Auto Export из показаний HealthKit.
//
// Мобильное приложение НЕ получает своего эндпоинта: оно говорит на диалекте
// HAE, и тогда весь серверный разбор, дедуп и детектор аномалий работают без
// единой правки (supabase/functions/_shared/hae.ts). Отсюда и странные на вид
// имена полей — это внешний формат, а не наш выбор.
//
// Модуль чистый: на вход простые массивы, на выход JSON. Слой HealthKit
// передаёт сюда уже прочитанные значения, поэтому всё это тестируется без
// телефона — и проверяется прогоном через настоящий серверный парсер.

/** Префикс источника, по которому сверка отличает телефон от HAE. */
export const MOBILE_SOURCE_PREFIX = 'Tonus iOS'

/** Суточная сумма по одному устройству (шаги, дистанция, энергия…). */
export interface DailySumReading {
  /** Имя метрики в формате HAE, например 'step_count'. */
  hae: string
  /** Локальный день, YYYY-MM-DD. */
  date: string
  /** Устройство-источник: iPhone, Apple Watch… */
  device: string
  value: number
  units: string
}

/** Суточное среднее с разбросом (пульс, ВСР, сатурация…). */
export interface DailyAverageReading {
  hae: string
  date: string
  avg: number
  min: number
  max: number
  units: string
}

/** Одна ночь сна: часы по фазам плюс границы. */
export interface SleepReading {
  date: string
  totalHours: number
  deepHours: number | null
  remHours: number | null
  coreHours: number | null
  bedtime: string | null
  wakeTime: string | null
}

export interface HealthReadings {
  sums?: DailySumReading[]
  averages?: DailyAverageReading[]
  sleep?: SleepReading[]
}

interface PayloadPoint {
  date: string
  source?: string
  qty?: number
  Avg?: number
  Min?: number
  Max?: number
  totalSleep?: number
  deep?: number | null
  rem?: number | null
  core?: number | null
  sleepStart?: string | null
  sleepEnd?: string | null
}

interface PayloadMetric {
  name: string
  units: string
  data: PayloadPoint[]
}

export interface HaeOutboundPayload {
  data: { metrics: PayloadMetric[] }
}

// Сервер берёт от даты первые 10 символов, поэтому формат обязан начинаться с
// YYYY-MM-DD; остальное — для читаемости архива в ingest_raw.
const asHaeDate = (day: string) => `${day} 00:00:00 +0000`

// Источник помечается и приложением, и устройством: приложение — чтобы сверка
// отличила телефон от HAE, устройство — потому что сервер суммирует внутри
// источника и берёт МАКСИМУМ по источникам. Слить iPhone и Watch в один
// источник значит потерять день, где часы насчитали больше телефона.
const asSource = (device: string) => `${MOBILE_SOURCE_PREFIX} · ${device}`

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const bucket = out.get(k)
    if (bucket) bucket.push(item)
    else out.set(k, [item])
  }
  return out
}

export function buildHaePayload(readings: HealthReadings): HaeOutboundPayload {
  const metrics: PayloadMetric[] = []

  for (const [name, group] of groupBy(readings.sums ?? [], r => r.hae)) {
    metrics.push({
      name,
      units: group[0].units,
      data: group.map(r => ({
        date: asHaeDate(r.date),
        source: asSource(r.device),
        qty: r.value,
      })),
    })
  }

  for (const [name, group] of groupBy(readings.averages ?? [], r => r.hae)) {
    metrics.push({
      name,
      units: group[0].units,
      data: group.map(r => ({
        date: asHaeDate(r.date),
        // У средних устройство не указываем: сервер усредняет все точки дня
        // независимо от источника, а разделение по устройствам только
        // размыло бы среднее.
        source: MOBILE_SOURCE_PREFIX,
        Avg: r.avg,
        Min: r.min,
        Max: r.max,
      })),
    })
  }

  const sleep = readings.sleep ?? []
  if (sleep.length) {
    metrics.push({
      name: 'sleep_analysis',
      units: 'hr',
      data: sleep.map(s => ({
        date: asHaeDate(s.date),
        source: MOBILE_SOURCE_PREFIX,
        totalSleep: s.totalHours,
        deep: s.deepHours,
        rem: s.remHours,
        core: s.coreHours,
        sleepStart: s.bedtime,
        sleepEnd: s.wakeTime,
      })),
    })
  }

  return { data: { metrics } }
}
