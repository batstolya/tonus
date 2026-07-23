import type { DailyMetrics } from '../types'

// Xiaomi/Mi Fitness CSV export parser.
// Export from account.xiaomi.com → Privacy → Manage → export zip.
// The zip typically contains files like:
//   SPORT_HEALTH_DATA.csv, HEALTH_DATA.csv, SLEEP_DATA.csv, etc.
// Column names vary by Mi Fitness version — we handle the most common variants.

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s\-()]+/g, '_')
}

function parseDate(s: string): string | null {
  // Handle YYYY-MM-DD or DD.MM.YYYY or MM/DD/YYYY
  const iso = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  const mdy = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1]}-${mdy[2]}`
  return null
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => normalizeKey(h))
  return lines.slice(1).map(line => {
    const cells = line.split(sep)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim() })
    return row
  })
}

function num(v: string | undefined): number | undefined {
  if (!v || v === '' || v === '-' || v === 'null') return undefined
  const n = parseFloat(v)
  return isNaN(n) ? undefined : n
}

// Map known Xiaomi column name variants to our field names
const DATE_COLS = ['date', 'day', 'дата']
const STEPS_COLS = ['steps', 'step_count', 'шаги', 'total_steps']
const DISTANCE_COLS = ['distance', 'distance_km', 'расстояние']
const CALORIES_COLS = ['calories', 'active_calories', 'calorie', 'калории']
const HR_AVG_COLS = ['heart_rate_avg', 'avg_heart_rate', 'average_heart_rate', 'heart_rate', 'пульс_среднее', 'average_bpm']
const HR_MIN_COLS = ['heart_rate_min', 'min_heart_rate', 'minimum_heart_rate', 'пульс_минимум']
const HR_MAX_COLS = ['heart_rate_max', 'max_heart_rate', 'maximum_heart_rate', 'пульс_максимум']
const RESTING_HR_COLS = ['resting_heart_rate', 'rest_heart_rate', 'пульс_покоя']
const SLEEP_COLS = ['sleep_duration', 'sleep_hours', 'total_sleep', 'сон_часы']
const SLEEP_DEEP_COLS = ['deep_sleep', 'deep_sleep_hours', 'глубокий_сон']
const SLEEP_LIGHT_COLS = ['light_sleep', 'light_sleep_hours', 'лёгкий_сон']
const ACTIVE_COLS = ['active_time', 'exercise_minutes', 'active_minutes', 'активность_минут']
const SPO2_COLS = ['spo2', 'blood_oxygen', 'oxygen_saturation', 'кислород']
const STRESS_COLS = ['stress', 'stress_score']

function findCol(row: Record<string, string>, candidates: string[]): string | undefined {
  for (const k of candidates) {
    if (row[k] !== undefined) return row[k]
  }
  return undefined
}

export interface XiaomiParseResult {
  daily: DailyMetrics[]
  warnings: string[]
}

export function parseXiaomiCSV(files: { name: string; text: string }[]): XiaomiParseResult {
  const byDate = new Map<string, DailyMetrics>()
  const warnings: string[] = []

  for (const { name, text } of files) {
    if (!name.toLowerCase().endsWith('.csv')) continue

    const rows = parseCSV(text)
    if (rows.length === 0) continue

    let parsedRows = 0
    for (const row of rows) {
      const rawDate = findCol(row, DATE_COLS)
      if (!rawDate) continue
      const date = parseDate(rawDate)
      if (!date) continue

      if (!byDate.has(date)) byDate.set(date, { date })
      const m = byDate.get(date)!

      const hrAvg = num(findCol(row, HR_AVG_COLS))
      const hrMin = num(findCol(row, HR_MIN_COLS))
      const hrMax = num(findCol(row, HR_MAX_COLS))
      if (hrAvg !== undefined || hrMin !== undefined || hrMax !== undefined) {
        m.heartRate = {
          avg: hrAvg ?? hrMin ?? hrMax ?? 0,
          min: hrMin ?? hrAvg ?? 0,
          max: hrMax ?? hrAvg ?? 0,
        }
      }

      const rhr = num(findCol(row, RESTING_HR_COLS))
      if (rhr !== undefined) m.restingHeartRate = rhr

      const steps = num(findCol(row, STEPS_COLS))
      if (steps !== undefined) m.steps = Math.round(steps)

      const dist = num(findCol(row, DISTANCE_COLS))
      if (dist !== undefined) m.distance = dist < 100 ? dist : dist / 1000 // handle metres vs km

      const cal = num(findCol(row, CALORIES_COLS))
      if (cal !== undefined) m.activeEnergy = cal

      const sleep = num(findCol(row, SLEEP_COLS))
      if (sleep !== undefined) m.sleepHours = sleep < 24 ? sleep : sleep / 60 // handle min vs hours

      const deep = num(findCol(row, SLEEP_DEEP_COLS))
      if (deep !== undefined) m.sleepDeep = deep < 24 ? deep : deep / 60

      const light = num(findCol(row, SLEEP_LIGHT_COLS))
      if (light !== undefined) m.sleepCore = light < 24 ? light : light / 60

      const active = num(findCol(row, ACTIVE_COLS))
      if (active !== undefined) m.exerciseMinutes = Math.round(active)

      const spo2 = num(findCol(row, SPO2_COLS))
      if (spo2 !== undefined) m.oxygenSaturation = spo2 > 1 ? spo2 / 100 : spo2

      // Stress score — no direct mapping, skip for now
      void findCol(row, STRESS_COLS)

      parsedRows++
    }

    if (parsedRows === 0 && rows.length > 0) {
      warnings.push(`${name}: не удалось найти столбец с датой — пропущен`)
    }
  }

  const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  return { daily, warnings }
}
