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
  /** Единицы, в которых приложение обязано отдавать значение. */
  units: string
}

/**
 * Суточные суммы: сервер суммирует внутри источника и берёт максимум по
 * источникам, поэтому телефон обязан отдавать их с разбивкой по устройствам.
 */
export const SUM_QUANTITIES: readonly QuantityMetric[] = [
  { hk: 'HKQuantityTypeIdentifierStepCount', hae: 'step_count', units: 'count' },
  { hk: 'HKQuantityTypeIdentifierDistanceWalkingRunning', hae: 'distance_walking_running', units: 'km' },
  { hk: 'HKQuantityTypeIdentifierActiveEnergyBurned', hae: 'active_energy', units: 'kcal' },
  { hk: 'HKQuantityTypeIdentifierAppleExerciseTime', hae: 'apple_exercise_time', units: 'min' },
  { hk: 'HKQuantityTypeIdentifierFlightsClimbed', hae: 'flights_climbed', units: 'count' },
]

/** Суточные средние: сервер усредняет все точки дня и хранит min/max. */
export const AVERAGE_QUANTITIES: readonly QuantityMetric[] = [
  { hk: 'HKQuantityTypeIdentifierHeartRate', hae: 'heart_rate', units: 'count/min' },
  { hk: 'HKQuantityTypeIdentifierRestingHeartRate', hae: 'resting_heart_rate', units: 'count/min' },
  { hk: 'HKQuantityTypeIdentifierWalkingHeartRateAverage', hae: 'walking_heart_rate_average', units: 'count/min' },
  { hk: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', hae: 'heart_rate_variability', units: 'ms' },
  // Доля, а не проценты: сервер делит на 100 всё, что больше 1.5.
  { hk: 'HKQuantityTypeIdentifierOxygenSaturation', hae: 'blood_oxygen_saturation', units: 'fraction' },
  { hk: 'HKQuantityTypeIdentifierRespiratoryRate', hae: 'respiratory_rate', units: 'count/min' },
  { hk: 'HKQuantityTypeIdentifierAppleSleepingWristTemperature', hae: 'apple_sleeping_wrist_temperature', units: 'degC' },
  { hk: 'HKQuantityTypeIdentifierVO2Max', hae: 'vo2_max', units: 'ml/(kg*min)' },
]

export const SLEEP_CATEGORY = 'HKCategoryTypeIdentifierSleepAnalysis'

/** Всё, на что приложение просит разрешение при первом запуске синка. */
export const HEALTH_READ_TYPES: readonly string[] = [
  ...SUM_QUANTITIES.map(q => q.hk),
  ...AVERAGE_QUANTITIES.map(q => q.hk),
  SLEEP_CATEGORY,
]
