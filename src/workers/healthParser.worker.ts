import JSZip from 'jszip'
import type { HealthRecord, HeartRateSample, DailyMetrics, ParseProgress } from '../types'

const PRIORITY_SOURCE = /apple watch/i

type WorkerMessage =
  | { type: 'parseFile'; payload: File }

type WorkerResponse =
  | { type: 'progress'; payload: ParseProgress }
  | { type: 'done'; payload: { daily: DailyMetrics[]; heartRateSamples: HeartRateSample[] } }
  | { type: 'error'; payload: string }

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === 'parseFile') {
    try {
      await parseHealthFile(e.data.payload)
    } catch (err) {
      self.postMessage({ type: 'error', payload: String(err) } satisfies WorkerResponse)
    }
  }
}

async function parseHealthFile(file: File) {
  post({ phase: 'reading', percent: 0, message: 'Читаем файл…' })

  let xmlText: string

  if (file.name.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file)
    const xmlFile = zip.file('apple_health_export/export.xml') ?? zip.file('export.xml')
    if (!xmlFile) throw new Error('export.xml не найден в архиве')
    post({ phase: 'reading', percent: 30, message: 'Извлекаем export.xml…' })
    xmlText = await xmlFile.async('string')
  } else {
    xmlText = await file.text()
  }

  post({ phase: 'parsing', percent: 40, message: 'Разбираем данные…' })

  const { records, heartRateSamples } = parseXML(xmlText)

  post({ phase: 'parsing', percent: 80, message: 'Агрегируем по дням…' })

  const daily = aggregateByDay(records)

  post({ phase: 'done', percent: 100 })
  self.postMessage({ type: 'done', payload: { daily, heartRateSamples } } satisfies WorkerResponse)
}

function post(payload: ParseProgress) {
  self.postMessage({ type: 'progress', payload } satisfies WorkerResponse)
}

function attr(tag: string, name: string): string {
  const re = new RegExp(`${name}="([^"]*)"`)
  return re.exec(tag)?.[1] ?? ''
}

function parseXML(xml: string): { records: HealthRecord[]; heartRateSamples: HeartRateSample[] } {
  const records: HealthRecord[] = []
  const heartRateSamples: HeartRateSample[] = []

  // Match every <Record ... /> or <Record ...> tag
  const recordRe = /<Record\s([^>]*?)\/?>(?:<\/Record>)?/g
  let m: RegExpExecArray | null

  while ((m = recordRe.exec(xml)) !== null) {
    const tag = m[1]
    const type = attr(tag, 'type')
    const valueStr = attr(tag, 'value')
    const unit = attr(tag, 'unit')
    const startDate = attr(tag, 'startDate')
    const endDate = attr(tag, 'endDate')
    const sourceName = attr(tag, 'sourceName')

    if (!valueStr || !startDate) continue

    // Sleep analysis values are strings, not numbers
    let value: number
    if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      const sleepMap: Record<string, number> = {
        HKCategoryValueSleepAnalysisInBed: 0,
        HKCategoryValueSleepAnalysisAsleep: 1,
        HKCategoryValueSleepAnalysisAsleepCore: 1,
        HKCategoryValueSleepAnalysisAsleepDeep: 2,
        HKCategoryValueSleepAnalysisAsleepREM: 3,
        HKCategoryValueSleepAnalysisAwake: 4,
      }
      const mapped = sleepMap[valueStr]
      if (mapped === undefined) continue
      value = mapped
    } else {
      value = parseFloat(valueStr)
      if (isNaN(value)) continue
    }

    const record: HealthRecord = {
      type,
      value,
      unit,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      sourceName,
    }
    records.push(record)

    if (type === 'HKQuantityTypeIdentifierHeartRate') {
      heartRateSamples.push({ time: new Date(startDate), value, sourceName })
    }
  }

  return { records, heartRateSamples }
}

function aggregateSleep(intervals: { start: Date; end: Date; value: number }[]): Partial<import('../types').DailyMetrics> {
  if (!intervals.length) return {}
  // value: 1=Core/Asleep, 2=Deep, 3=REM (0=InBed used as fallback total)
  const durSec = (iv: { start: Date; end: Date }) =>
    (iv.end.getTime() - iv.start.getTime()) / 1000

  let total = 0, deep = 0, rem = 0, core = 0
  for (const iv of intervals) {
    const d = durSec(iv)
    total += d
    if (iv.value === 2) deep += d
    else if (iv.value === 3) rem += d
    else if (iv.value === 1) core += d
    else core += d // InBed (0) counted as core if no phases
  }

  const bedtime = new Date(Math.min(...intervals.map(iv => iv.start.getTime())))
  const wakeTime = new Date(Math.max(...intervals.map(iv => iv.end.getTime())))

  return {
    sleepHours: total / 3600,
    sleepBedtime: bedtime.toISOString(),
    sleepWakeTime: wakeTime.toISOString(),
    sleepDeep: deep / 3600 || undefined,
    sleepREM: rem / 3600 || undefined,
    sleepCore: core / 3600 || undefined,
  }
}

function aggregateByDay(records: HealthRecord[]): DailyMetrics[] {
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
        energy: [], exerciseMin: [], flights: [],
      })
    }
    return days.get(key)!
  }

  for (const r of records) {
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
    }
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : undefined
  const sum = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) : undefined

  // Deduplicate sources: prefer Apple Watch
  function dedupeSum(items: { v: number; src: string }[]): number | undefined {
    if (!items.length) return undefined
    const watchItems = items.filter(i => PRIORITY_SOURCE.test(i.src))
    const chosen = watchItems.length ? watchItems : items
    return chosen.reduce((a, b) => a + b.v, 0)
  }

  const result: DailyMetrics[] = []

  for (const [date, b] of [...days.entries()].sort()) {
    const hrVals = b.hrValues.map(x => x.v)
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
    })
  }

  return result
}
