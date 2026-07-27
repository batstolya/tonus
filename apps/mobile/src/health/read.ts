import {
  isHealthDataAvailable,
  requestAuthorization,
  queryStatisticsCollectionForQuantity,
  queryStatisticsCollectionForQuantitySeparateBySource,
  queryCategorySamples,
} from '@kingstinct/react-native-healthkit'
import type { QuantityTypeIdentifier } from '@kingstinct/react-native-healthkit'
import {
  SUM_QUANTITIES,
  AVERAGE_QUANTITIES,
  SLEEP_CATEGORY,
  HEALTH_READ_TYPES,
  type HealthReadings,
  type DailySumReading,
  type DailyAverageReading,
  type SleepReading,
} from '@tonus/shared'

// Чтение Apple Health. Возвращает ровно ту структуру, которую ест
// buildHaePayload из @tonus/shared, — то есть этот модуль и сборщик payload
// стыкуются без переходников: прочитали → собрали → отправили.
//
// Значения фаз сна из HealthKit (CategoryValueSleepAnalysis):
// 0 inBed, 1 asleepUnspecified, 2 awake, 3 asleepCore, 4 asleepDeep, 5 asleepREM.
const SLEEP_ASLEEP = new Set([1, 3, 4, 5])
const SLEEP_CORE = 3
const SLEEP_DEEP = 4
const SLEEP_REM = 5

const MS_PER_HOUR = 3_600_000

/** Локальная дата в формате YYYY-MM-DD: день считается по часам пользователя, а не по UTC. */
function localDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfLocalDay(daysAgo: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return d
}

export interface HealthAvailability {
  available: boolean
  reason?: string
}

/** Есть ли на устройстве Здоровье вообще (на iPad и части устройств его нет). */
export function checkAvailability(): HealthAvailability {
  return isHealthDataAvailable()
    ? { available: true }
    : { available: false, reason: 'На этом устройстве нет Apple Health.' }
}

/** Показывает системный запрос доступа ко всем типам, которые мы читаем. */
export async function requestHealthAccess(): Promise<boolean> {
  return requestAuthorization({ toRead: HEALTH_READ_TYPES as never })
}

/**
 * Суточные суммы С РАЗБИВКОЙ ПО ИСТОЧНИКАМ. Разбивка обязательна: сервер
 * суммирует внутри источника и берёт максимум по источникам, поэтому слить
 * iPhone и часы в одну цифру здесь — значит потерять день, где часы насчитали
 * больше телефона.
 */
async function readSums(from: Date, to: Date): Promise<DailySumReading[]> {
  const out: DailySumReading[] = []
  for (const metric of SUM_QUANTITIES) {
    const buckets = await queryStatisticsCollectionForQuantitySeparateBySource(
      metric.hk as QuantityTypeIdentifier,
      ['cumulativeSum'],
      from,
      { day: 1 },
      { filter: { date: { startDate: from, endDate: to } }, unit: metric.hkUnit } as never,
    )
    for (const bucket of buckets) {
      const value = bucket.sumQuantity?.quantity
      if (value == null || !bucket.startDate) continue
      out.push({
        hae: metric.hae,
        date: localDay(bucket.startDate),
        device: bucket.source?.name ?? 'iPhone',
        // Запрашиваем в единицах HealthKit, отдаём в единицах сервера.
        value: value * (metric.toHae ?? 1),
        units: metric.haeUnit,
      })
    }
  }
  return out
}

/** Суточные средние с разбросом. Источник тут не важен: сервер усредняет все точки дня. */
async function readAverages(from: Date, to: Date): Promise<DailyAverageReading[]> {
  const out: DailyAverageReading[] = []
  for (const metric of AVERAGE_QUANTITIES) {
    const buckets = await queryStatisticsCollectionForQuantity(
      metric.hk as QuantityTypeIdentifier,
      ['discreteAverage', 'discreteMin', 'discreteMax'],
      from,
      { day: 1 },
      { filter: { date: { startDate: from, endDate: to } }, unit: metric.hkUnit } as never,
    )
    for (const bucket of buckets) {
      const avg = bucket.averageQuantity?.quantity
      if (avg == null || !bucket.startDate) continue
      const k = metric.toHae ?? 1
      out.push({
        hae: metric.hae,
        date: localDay(bucket.startDate),
        avg: avg * k,
        min: (bucket.minimumQuantity?.quantity ?? avg) * k,
        max: (bucket.maximumQuantity?.quantity ?? avg) * k,
        units: metric.haeUnit,
      })
    }
  }
  return out
}

/**
 * Сон: HealthKit отдаёт отдельные отрезки по фазам, а нам нужна одна строка на
 * ночь. Ночь относим к дню ПРОБУЖДЕНИЯ — так же, как это делает Health Auto
 * Export, иначе сон уедет на сутки назад относительно остальных метрик.
 */
async function readSleep(from: Date, to: Date): Promise<SleepReading[]> {
  const samples = await queryCategorySamples(SLEEP_CATEGORY as 'HKCategoryTypeIdentifierSleepAnalysis', {
    filter: { date: { startDate: from, endDate: to } },
    ascending: true,
    // 0 = без ограничения. Ночь распадается на десятки отрезков по фазам, и
    // срезать их лимитом значит недосчитать сон.
    limit: 0,
  })

  const byNight = new Map<string, SleepReading>()
  for (const sample of samples) {
    const value = Number(sample.value)
    if (!SLEEP_ASLEEP.has(value)) continue

    const start = new Date(sample.startDate)
    const end = new Date(sample.endDate)
    const hours = (end.getTime() - start.getTime()) / MS_PER_HOUR
    if (!(hours > 0)) continue

    const night = localDay(end)
    const row = byNight.get(night) ?? {
      date: night,
      totalHours: 0,
      deepHours: null,
      remHours: null,
      coreHours: null,
      bedtime: null,
      wakeTime: null,
    }

    row.totalHours += hours
    if (value === SLEEP_DEEP) row.deepHours = (row.deepHours ?? 0) + hours
    if (value === SLEEP_REM) row.remHours = (row.remHours ?? 0) + hours
    if (value === SLEEP_CORE) row.coreHours = (row.coreHours ?? 0) + hours
    // Границы ночи — самый ранний засып и самое позднее пробуждение.
    if (!row.bedtime || start.toISOString() < row.bedtime) row.bedtime = start.toISOString()
    if (!row.wakeTime || end.toISOString() > row.wakeTime) row.wakeTime = end.toISOString()

    byNight.set(night, row)
  }

  return [...byNight.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Читает всё, что мы умеем отправлять, за последние `days` суток. */
export async function readHealthReadings(days: number): Promise<HealthReadings> {
  const from = startOfLocalDay(days)
  const to = new Date()
  const [sums, averages, sleep] = await Promise.all([
    readSums(from, to),
    readAverages(from, to),
    readSleep(from, to),
  ])
  return { sums, averages, sleep }
}
