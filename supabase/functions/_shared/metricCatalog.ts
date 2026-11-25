// Catalog of the Apple Health metrics added after PR #258. One entry per
// metric drives the HAE parser, the ZIP importer, sync load/save, the metrics
// screen labels and the backfill. The 16 older metrics keep their own paths.
// Spec: docs/superpowers/specs/2026-11-25-metric-catalog-design.md
//
// Lives in _shared because Deno cannot import from apps/web, while the web app
// already imports _shared modules by relative path.

/**
 * How one day is reduced:
 * - sum: sum within a source, max across sources (iPhone + Watch not doubled)
 * - count: number of points per source, max across sources (events per day)
 * - avg: mean of all points, with min and max
 * - energyAvg: decibel mean computed on sound energy, with min and max
 */
export type CatalogAgg = 'sum' | 'count' | 'avg' | 'energyAvg'

export interface CatalogEntry {
  key: string
  /** Metric name in a Health Auto Export payload; absent when HAE does not offer it (ZIP import only). */
  hae?: string
  /** HealthKit type in an Apple Health export.xml. */
  hk: string
  agg: CatalogAgg
  /** Russian i18n key; uk/en live in apps/web/src/lib/translations/metrics.ts. */
  label: string
  /** export.xml stores these as fractions where HAE sends percent. */
  zipScale?: number
  /** Category types: the export.xml string value → number. */
  zipCategory?: Record<string, number>
}

export const METRIC_CATALOG = [
  { key: 'physicalEffort', hae: 'physical_effort', hk: 'HKQuantityTypeIdentifierPhysicalEffort', agg: 'avg', label: 'Интенсивность нагрузки (MET)' },
  { key: 'basalEnergy', hae: 'basal_energy_burned', hk: 'HKQuantityTypeIdentifierBasalEnergyBurned', agg: 'sum', label: 'Энергия покоя (ккал)' },
  {
    key: 'standHours', hae: 'apple_stand_hour', hk: 'HKCategoryTypeIdentifierAppleStandHour', agg: 'sum', label: 'Часы стояния',
    zipCategory: { HKCategoryValueAppleStandHourStood: 1, HKCategoryValueAppleStandHourIdle: 0 },
  },
  { key: 'standMinutes', hae: 'apple_stand_time', hk: 'HKQuantityTypeIdentifierAppleStandTime', agg: 'sum', label: 'Минуты стояния' },
  { key: 'environmentalAudio', hae: 'environmental_audio_exposure', hk: 'HKQuantityTypeIdentifierEnvironmentalAudioExposure', agg: 'energyAvg', label: 'Шум вокруг (дБ)' },
  { key: 'headphoneAudio', hae: 'headphone_audio_exposure', hk: 'HKQuantityTypeIdentifierHeadphoneAudioExposure', agg: 'energyAvg', label: 'Громкость в наушниках (дБ)' },
  { key: 'walkingSpeed', hae: 'walking_speed', hk: 'HKQuantityTypeIdentifierWalkingSpeed', agg: 'avg', label: 'Скорость ходьбы (км/ч)' },
  { key: 'walkingStepLength', hae: 'walking_step_length', hk: 'HKQuantityTypeIdentifierWalkingStepLength', agg: 'avg', label: 'Длина шага (см)' },
  { key: 'walkingAsymmetry', hae: 'walking_asymmetry_percentage', hk: 'HKQuantityTypeIdentifierWalkingAsymmetryPercentage', agg: 'avg', label: 'Асимметрия ходьбы (%)', zipScale: 100 },
  { key: 'walkingDoubleSupport', hae: 'walking_double_support_percentage', hk: 'HKQuantityTypeIdentifierWalkingDoubleSupportPercentage', agg: 'avg', label: 'Двойная опора (%)', zipScale: 100 },
  { key: 'stairSpeedUp', hae: 'stair_speed_up', hk: 'HKQuantityTypeIdentifierStairAscentSpeed', agg: 'avg', label: 'Скорость подъёма по лестнице (м/с)' },
  { key: 'stairSpeedDown', hae: 'stair_speed_down', hk: 'HKQuantityTypeIdentifierStairDescentSpeed', agg: 'avg', label: 'Скорость спуска по лестнице (м/с)' },
  { key: 'sixMinuteWalk', hae: 'six_minute_walking_test_distance', hk: 'HKQuantityTypeIdentifierSixMinuteWalkTestDistance', agg: 'avg', label: 'Тест 6-минутной ходьбы (м)' },
  { key: 'cyclingDistance', hae: 'cycling_distance', hk: 'HKQuantityTypeIdentifierDistanceCycling', agg: 'sum', label: 'Велосипед (км)' },
  {
    key: 'handwashing', hae: 'handwashing', hk: 'HKCategoryTypeIdentifierHandwashingEvent', agg: 'count', label: 'Мытьё рук (раз)',
    zipCategory: { HKCategoryValueNotApplicable: 1 },
  },
  // Not offered by Health Auto Export — arrives only through the ZIP import.
  // Weekly iPhone estimate stored as a fraction; 100% = OK.
  { key: 'walkingSteadiness', hk: 'HKQuantityTypeIdentifierAppleWalkingSteadiness', agg: 'avg', label: 'Устойчивость ходьбы (%)', zipScale: 100 },
] as const satisfies readonly CatalogEntry[]

export type CatalogKey = typeof METRIC_CATALOG[number]['key']

export const CATALOG_BY_HAE: ReadonlyMap<string, CatalogEntry> = new Map(
  METRIC_CATALOG.flatMap((e): [string, CatalogEntry][] => ('hae' in e && e.hae ? [[e.hae, e]] : [])),
)
export const CATALOG_BY_HK: ReadonlyMap<string, CatalogEntry> = new Map(METRIC_CATALOG.map(e => [e.hk, e]))
export const CATALOG_BY_KEY: ReadonlyMap<string, CatalogEntry> = new Map(METRIC_CATALOG.map(e => [e.key, e]))

/** HAE value → canonical unit. Driven by the declared unit, never by the value. */
export function haeValue(entry: CatalogEntry, value: number, units: string): number {
  const u = units.toLowerCase()
  if (entry.key === 'basalEnergy' && (u.includes('kj') || u.includes('кдж'))) return value / 4.184
  return value
}

export type DayAggregate =
  | { avg_val: number; min_val: number; max_val: number }
  | { sum_val: number }

/** Reduce one day's points of one metric. No points → null (unknown, not 0). */
export function aggregateDay(entry: CatalogEntry, points: { v: number; src: string }[]): DayAggregate | null {
  if (!points.length) return null
  if (entry.agg === 'sum' || entry.agg === 'count') {
    const bySrc = new Map<string, number>()
    for (const p of points) bySrc.set(p.src, (bySrc.get(p.src) ?? 0) + (entry.agg === 'count' ? 1 : p.v))
    return { sum_val: Math.max(...bySrc.values()) }
  }
  const vs = points.map(p => p.v)
  const min_val = Math.min(...vs), max_val = Math.max(...vs)
  const avg_val = entry.agg === 'energyAvg'
    ? 10 * Math.log10(vs.reduce((a, v) => a + 10 ** (v / 10), 0) / vs.length)
    : vs.reduce((a, v) => a + v, 0) / vs.length
  return { avg_val, min_val, max_val }
}

/** True for metrics stored as sum_val (sum and count). */
export function isCatalogSum(entry: CatalogEntry): boolean {
  return entry.agg === 'sum' || entry.agg === 'count'
}
