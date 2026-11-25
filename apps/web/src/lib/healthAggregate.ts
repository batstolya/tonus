import type { HealthRecord, DailyMetrics } from '../types'

// Day-level aggregation of parsed Apple Health records (ZIP import). Lives
// outside the worker so it can be unit-tested: the worker assigns
// self.onmessage at module level and cannot be imported under node.

// Длительность ОБЪЕДИНЕНИЯ интервалов (секунды) — перекрытия не задваиваются
function mergedSeconds(ivs: { start: Date; end: Date }[]): number {
  if (!ivs.length) return 0
  const sorted = ivs.map(i => ({ s: i.start.getTime(), e: i.end.getTime() }))
    .filter(i => i.e > i.s)
    .sort((a, b) => a.s - b.s)
  if (!sorted.length) return 0
  let total = 0, curS = sorted[0].s, curE = sorted[0].e
  for (let k = 1; k < sorted.length; k++) {
    if (sorted[k].s <= curE) curE = Math.max(curE, sorted[k].e)
    else { total += curE - curS; curS = sorted[k].s; curE = sorted[k].e }
  }
  total += curE - curS
  return total / 1000
}

function aggregateSleep(allIntervals: { start: Date; end: Date; value: number }[]): Partial<DailyMetrics> {
  if (!allIntervals.length) return {}
  // Отбрасываем явно битые записи: один интервал сна длиннее 16ч — ошибка девайса
  const intervals = allIntervals.filter(iv => (iv.end.getTime() - iv.start.getTime()) / 3600000 <= 16)
  if (!intervals.length) return {}
  // value: 1=Core/Asleep, 2=Deep, 3=REM, 0=InBed (запас, если нет фаз сна)
  const asleep = intervals.filter(iv => iv.value === 1 || iv.value === 2 || iv.value === 3)
  const base = asleep.length ? asleep : intervals // если только InBed — берём его

  const total = mergedSeconds(base)
  const deep = mergedSeconds(intervals.filter(iv => iv.value === 2))
  const rem = mergedSeconds(intervals.filter(iv => iv.value === 3))
  const core = mergedSeconds(intervals.filter(iv => iv.value === 1))

  const bedtime = new Date(Math.min(...base.map(iv => iv.start.getTime())))
  const wakeTime = new Date(Math.max(...base.map(iv => iv.end.getTime())))

  return {
    sleepHours: total / 3600,
    sleepBedtime: bedtime.toISOString(),
    sleepWakeTime: wakeTime.toISOString(),
    sleepDeep: deep / 3600 || undefined,
    sleepREM: rem / 3600 || undefined,
    sleepCore: core / 3600 || undefined,
  }
}

export function aggregateByDay(records: HealthRecord[]): DailyMetrics[] {
  type DayBucket = {
    hrValues: { v: number; src: string }[]
    restingHR: number[]
    hrv: number[]
    walkingHR: number[]
    o2: number[]
    rr: number[]
    wristTemp: number[]
    vo2max: number[]
    sleepIntervals: { start: Date; end: Date; value: number }[]
    steps: { v: number; src: string }[]
    distance: { v: number; src: string }[]
    energy: { v: number; src: string }[]
    exerciseMin: number[]
    flights: number[]
    breathing: number[]
    daylight: { v: number; src: string }[]
  }

  const days = new Map<string, DayBucket>()

  function getDay(date: Date): string {
    return date.toISOString().slice(0, 10)
  }

  function bucket(date: Date): DayBucket {
    const key = getDay(date)
    if (!days.has(key)) {
      days.set(key, {
        hrValues: [], restingHR: [], hrv: [], walkingHR: [], o2: [], rr: [],
        wristTemp: [], vo2max: [], sleepIntervals: [], steps: [], distance: [],
        energy: [], exerciseMin: [], flights: [], breathing: [], daylight: [],
      })
    }
    return days.get(key)!
  }

  for (const r of records) {
    // A per-night value: file it under the wake-up day, as sleep is, and skip
    // the start-date bucket so the evening before does not become an empty day.
    if (r.type === 'HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances') {
      bucket(r.endDate).breathing.push(r.value)
      continue
    }
    const b = bucket(r.startDate)
    const src = r.sourceName
    switch (r.type) {
      case 'HKQuantityTypeIdentifierHeartRate': b.hrValues.push({ v: r.value, src }); break
      case 'HKQuantityTypeIdentifierRestingHeartRate': b.restingHR.push(r.value); break
      case 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': b.hrv.push(r.value); break
      case 'HKQuantityTypeIdentifierWalkingHeartRateAverage': b.walkingHR.push(r.value); break
      case 'HKQuantityTypeIdentifierOxygenSaturation': b.o2.push(r.value); break
      case 'HKQuantityTypeIdentifierRespiratoryRate': b.rr.push(r.value); break
      case 'HKQuantityTypeIdentifierAppleSleepingWristTemperature': b.wristTemp.push(r.value); break
      case 'HKQuantityTypeIdentifierVO2Max': b.vo2max.push(r.value); break
      case 'HKCategoryTypeIdentifierSleepAnalysis': {
        // value: 0=InBed, 1=Asleep(Core), 2=Deep, 3=REM, 4=Awake
        if (r.value === 4) break // skip awake intervals
        const wakeDay = getDay(r.endDate)
        const wb = days.get(wakeDay) ?? (() => { const nb = bucket(r.endDate); return nb })()
        wb.sleepIntervals.push({ start: r.startDate, end: r.endDate, value: r.value })
        break
      }
      case 'HKQuantityTypeIdentifierStepCount': b.steps.push({ v: r.value, src }); break
      case 'HKQuantityTypeIdentifierDistanceWalkingRunning': b.distance.push({ v: r.value, src }); break
      case 'HKQuantityTypeIdentifierActiveEnergyBurned': b.energy.push({ v: r.value, src }); break
      case 'HKQuantityTypeIdentifierAppleExerciseTime': b.exerciseMin.push(r.value); break
      case 'HKQuantityTypeIdentifierFlightsClimbed': b.flights.push(r.value); break
      case 'HKQuantityTypeIdentifierTimeInDaylight': b.daylight.push({ v: r.value, src }); break
    }
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : undefined
  const sum = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) : undefined

  // Deduplicate sources: prefer Apple Watch
  // Кумулятивные метрики (шаги/дистанция/энергия): суммируем В ПРЕДЕЛАХ источника,
  // затем берём МАКСИМУМ по источникам. Так iPhone+Watch не задваиваются: каждый
  // источник независимо считает весь день, берём самый полный, а не их сумму.
  function dedupeSum(items: { v: number; src: string }[]): number | undefined {
    if (!items.length) return undefined
    const bySource: Record<string, number> = {}
    for (const i of items) bySource[i.src] = (bySource[i.src] ?? 0) + i.v
    return Math.max(...Object.values(bySource))
  }

  const result: DailyMetrics[] = []

  for (const [date, b] of [...days.entries()].sort()) {
    const hrVals = b.hrValues.map(x => x.v)
    const daylightTotal = dedupeSum(b.daylight)
    result.push({
      date,
      heartRate: hrVals.length ? {
        avg: avg(hrVals)!,
        min: Math.min(...hrVals),
        max: Math.max(...hrVals),
      } : undefined,
      restingHeartRate: avg(b.restingHR),
      hrv: avg(b.hrv),
      walkingHeartRate: avg(b.walkingHR),
      oxygenSaturation: avg(b.o2),
      respiratoryRate: avg(b.rr),
      wristTemperature: avg(b.wristTemp),
      vo2max: b.vo2max.at(-1),
      ...aggregateSleep(b.sleepIntervals),
      steps: dedupeSum(b.steps),
      distance: dedupeSum(b.distance),
      activeEnergy: dedupeSum(b.energy),
      exerciseMinutes: sum(b.exerciseMin),
      flightsClimbed: sum(b.flights),
      breathingDisturbances: avg(b.breathing),
      daylightMinutes: daylightTotal == null ? undefined : Math.round(daylightTotal),
    })
  }

  return result
}
