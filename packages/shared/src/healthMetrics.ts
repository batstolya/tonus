// Соответствие «идентификатор HealthKit → имя метрики в payload'е HAE».
//
// Правая колонка — не наш выбор: это ключи METRIC_MAP из
// supabase/functions/ingest-health (через _shared/hae.ts). Опечатка здесь не
// ломает ничего заметным образом — сервер просто МОЛЧА выбросит метрику, и
// данные потеряются без единой ошибки. Поэтому в healthMetrics.test.ts стоит
// сторож, сверяющий каждое имя с серверной таблицей.
//
// Таблица живёт в shared, а не в apps/mobile: это чистые данные без нативных
// зависимостей, и только так её можно проверить тестом без телефона.

export interface QuantityMetric {
  /** Идентификатор типа в HealthKit. */
  hk: string
  /** Имя метрики в payload'е HAE. */
  hae: string
  /**
   * Единица, в которой у HealthKit ЗАПРАШИВАЕТСЯ значение. Обязана быть
   * настоящей HKUnit — иначе запрос падает в рантайме.
   */
  hkUnit: string
  /**
   * Единица, в которой значение уходит НА СЕРВЕР. Совпадает с hkUnit почти
   * везде, но не всегда: сатурацию HealthKit отдаёт в процентах, а
   * ingest-health ждёт долю.
   *
   * Разделено после того, как 'fraction' — наша серверная единица — уехало в
   * запрос к HealthKit и он ответил «Supplied invalid 'fraction' as HKUnit».
   * Поймано запуском: тесты сверяли имена метрик с сервером, а валидность
   * HKUnit проверить было нечем.
   */
  haeUnit: string
  /** Множитель hkUnit → haeUnit. Единица там, где единицы совпадают. */
  toHae?: number
}

/**
 * Суточные суммы: сервер суммирует внутри источника и берёт максимум по
 * источникам, поэтому телефон обязан отдавать их с разбивкой по устройствам.
 */
export const SUM_QUANTITIES: readonly QuantityMetric[] = [
  { hk: 'HKQuantityTypeIdentifierStepCount', hae: 'step_count', hkUnit: 'count', haeUnit: 'count' },
  { hk: 'HKQuantityTypeIdentifierDistanceWalkingRunning', hae: 'distance_walking_running', hkUnit: 'km', haeUnit: 'km' },
  { hk: 'HKQuantityTypeIdentifierActiveEnergyBurned', hae: 'active_energy', hkUnit: 'kcal', haeUnit: 'kcal' },
  { hk: 'HKQuantityTypeIdentifierAppleExerciseTime', hae: 'apple_exercise_time', hkUnit: 'min', haeUnit: 'min' },
  { hk: 'HKQuantityTypeIdentifierFlightsClimbed', hae: 'flights_climbed', hkUnit: 'count', haeUnit: 'count' },
]

/** Суточные средние: сервер усредняет все точки дня и хранит min/max. */
export const AVERAGE_QUANTITIES: readonly QuantityMetric[] = [
  { hk: 'HKQuantityTypeIdentifierHeartRate', hae: 'heart_rate', hkUnit: 'count/min', haeUnit: 'count/min' },
  { hk: 'HKQuantityTypeIdentifierRestingHeartRate', hae: 'resting_heart_rate', hkUnit: 'count/min', haeUnit: 'count/min' },
  { hk: 'HKQuantityTypeIdentifierWalkingHeartRateAverage', hae: 'walking_heart_rate_average', hkUnit: 'count/min', haeUnit: 'count/min' },
  { hk: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', hae: 'heart_rate_variability', hkUnit: 'ms', haeUnit: 'ms' },
  // Единственная метрика, где единицы расходятся: HealthKit отдаёт проценты,
  // сервер хранит долю (и сам делит на 100 всё, что больше 1.5).
  { hk: 'HKQuantityTypeIdentifierOxygenSaturation', hae: 'blood_oxygen_saturation', hkUnit: '%', haeUnit: 'fraction', toHae: 0.01 },
  { hk: 'HKQuantityTypeIdentifierRespiratoryRate', hae: 'respiratory_rate', hkUnit: 'count/min', haeUnit: 'count/min' },
  { hk: 'HKQuantityTypeIdentifierAppleSleepingWristTemperature', hae: 'apple_sleeping_wrist_temperature', hkUnit: 'degC', haeUnit: 'degC' },
  { hk: 'HKQuantityTypeIdentifierVO2Max', hae: 'vo2_max', hkUnit: 'ml/(kg*min)', haeUnit: 'ml/(kg*min)' },
]

export const SLEEP_CATEGORY = 'HKCategoryTypeIdentifierSleepAnalysis'

/** Всё, на что приложение просит разрешение при первом запуске синка. */
export const HEALTH_READ_TYPES: readonly string[] = [
  ...SUM_QUANTITIES.map(q => q.hk),
  ...AVERAGE_QUANTITIES.map(q => q.hk),
  SLEEP_CATEGORY,
]
