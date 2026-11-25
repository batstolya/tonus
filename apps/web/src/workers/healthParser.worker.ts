import JSZip from 'jszip'
import type { HealthRecord, HeartRateSample, DailyMetrics, ParseProgress } from '../types'
import { aggregateByDay } from '../lib/healthAggregate'


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
