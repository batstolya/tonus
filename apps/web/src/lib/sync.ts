import { supabase } from './supabase'
import type { DailyMetrics, HeartRateSample } from '../types'
import type { Database, Json } from './database.types'

type MetricsDailyRow = Database['public']['Tables']['metrics_daily']['Row']
type SleepSessionRow = Database['public']['Tables']['sleep_sessions']['Row']

export interface SyncResult {
  daysAdded: number
  periodStart: string | null
  periodEnd: string | null
}

export async function syncMetricsToSupabase(
  userId: string,
  daily: DailyMetrics[],
  filename: string
): Promise<SyncResult> {
  if (!daily.length) return { daysAdded: 0, periodStart: null, periodEnd: null }

  // Find last known sync to count new days (for display only)
  const { data: lastImport } = await supabase
    .from('imports')
    .select('period_end')
    .eq('user_id', userId)
    .order('imported_at', { ascending: false })
    .limit(1)
    .single()

  const lastSyncedDate = lastImport?.period_end ?? null

  // Always sync all days — upsert handles deduplication at DB level
  // This ensures Supabase always has complete, up-to-date data
  const newDays = daily
  const trulyNewCount = lastSyncedDate
    ? daily.filter(d => d.date > lastSyncedDate).length
    : daily.length

  const periodStart = newDays[0].date
  const periodEnd = newDays[newDays.length - 1].date

  // Upsert metrics_daily rows
  const metricsRows: {
    user_id: string; date: string; metric: string;
    avg_val?: number | null; min_val?: number | null; max_val?: number | null;
    sum_val?: number | null; count_val?: number | null; json_val?: Json | null;
  }[] = []

  const sleepRows: {
    user_id: string; date: string;
    bedtime?: string | null; wake_time?: string | null; duration_hours?: number | null;
    deep_hours?: number | null; rem_hours?: number | null; core_hours?: number | null;
  }[] = []

  for (const d of newDays) {
    const uid = userId
    const date = d.date

    if (d.heartRate) {
      metricsRows.push({ user_id: uid, date, metric: 'heartRate', avg_val: d.heartRate.avg, min_val: d.heartRate.min, max_val: d.heartRate.max })
    }
    if (d.restingHeartRate != null) metricsRows.push({ user_id: uid, date, metric: 'restingHeartRate', avg_val: d.restingHeartRate })
    if (d.hrv != null) metricsRows.push({ user_id: uid, date, metric: 'hrv', avg_val: d.hrv })
    if (d.walkingHeartRate != null) metricsRows.push({ user_id: uid, date, metric: 'walkingHeartRate', avg_val: d.walkingHeartRate })
    if (d.oxygenSaturation != null) metricsRows.push({ user_id: uid, date, metric: 'oxygenSaturation', avg_val: d.oxygenSaturation })
    if (d.respiratoryRate != null) metricsRows.push({ user_id: uid, date, metric: 'respiratoryRate', avg_val: d.respiratoryRate })
    if (d.wristTemperature != null) metricsRows.push({ user_id: uid, date, metric: 'wristTemperature', avg_val: d.wristTemperature })
    if (d.vo2max != null) metricsRows.push({ user_id: uid, date, metric: 'vo2max', avg_val: d.vo2max })
    if (d.steps != null) metricsRows.push({ user_id: uid, date, metric: 'steps', sum_val: d.steps })
    if (d.distance != null) metricsRows.push({ user_id: uid, date, metric: 'distance', sum_val: d.distance })
    if (d.activeEnergy != null) metricsRows.push({ user_id: uid, date, metric: 'activeEnergy', sum_val: d.activeEnergy })
    if (d.exerciseMinutes != null) metricsRows.push({ user_id: uid, date, metric: 'exerciseMinutes', sum_val: d.exerciseMinutes })
    if (d.flightsClimbed != null) metricsRows.push({ user_id: uid, date, metric: 'flightsClimbed', sum_val: d.flightsClimbed })

    if (d.sleepHours != null) {
      sleepRows.push({
        user_id: uid,
        date,
        bedtime: d.sleepBedtime ?? null,
        wake_time: d.sleepWakeTime ?? null,
        duration_hours: d.sleepHours,
        deep_hours: d.sleepDeep ?? null,
        rem_hours: d.sleepREM ?? null,
        core_hours: d.sleepCore ?? null,
      })
    }
  }

  // Batch upsert in chunks of 500
  const chunkSize = 500
  for (let i = 0; i < metricsRows.length; i += chunkSize) {
    const { error } = await supabase.from('metrics_daily').upsert(metricsRows.slice(i, i + chunkSize), {
      onConflict: 'user_id,date,metric',
    })
    if (error) throw new Error(`metrics_daily upsert failed: ${error.message}`)
  }

  for (let i = 0; i < sleepRows.length; i += chunkSize) {
    const { error } = await supabase.from('sleep_sessions').upsert(sleepRows.slice(i, i + chunkSize), {
      onConflict: 'user_id,date',
    })
    if (error) throw new Error(`sleep_sessions upsert failed: ${error.message}`)
  }

  // Log the import
  await supabase.from('imports').insert({
    user_id: userId,
    filename,
    period_start: periodStart,
    period_end: periodEnd,
    records_added: newDays.length,
  })

  return { daysAdded: trulyNewCount, periodStart, periodEnd }
}

async function fetchAllRows<T>(
  table: 'metrics_daily' | 'sleep_sessions',
  userId: string,
  orderCol: string,
): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order(orderCol)
      .range(from, from + pageSize - 1)
    if (error) { console.warn(`${table} load error:`, error.message); break }
    if (!data || data.length === 0) break
    rows.push(...(data as unknown as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

export async function loadMetricsFromSupabase(userId: string): Promise<DailyMetrics[]> {
  const [metricsData, sleepData] = await Promise.all([
    fetchAllRows<MetricsDailyRow>('metrics_daily', userId, 'date'),
    fetchAllRows<SleepSessionRow>('sleep_sessions', userId, 'date'),
  ])
  const metricsRes = { data: metricsData }
  const sleepRes = { data: sleepData }

  const byDate = new Map<string, DailyMetrics>()

  // При дублях (две выгрузки на один день) берём более полное значение:
  // максимум для сумм (шаги/дистанция/калории), и не затираем непустое для средних.
  const maxSum = (cur: number | undefined, v: number | null): number | undefined =>
    v == null ? cur : (cur == null ? v : Math.max(cur, v))
  const keepAvg = (cur: number | undefined, v: number | null): number | undefined =>
    cur != null ? cur : (v ?? undefined)

  for (const row of metricsRes.data ?? []) {
    if (!byDate.has(row.date)) byDate.set(row.date, { date: row.date })
    const d = byDate.get(row.date)!
    switch (row.metric) {
      case 'heartRate':
        if (row.avg_val != null && !d.heartRate)
          d.heartRate = { avg: row.avg_val, min: row.min_val ?? row.avg_val, max: row.max_val ?? row.avg_val }
        break
      case 'restingHeartRate': d.restingHeartRate = keepAvg(d.restingHeartRate, row.avg_val); break
      case 'hrv': d.hrv = keepAvg(d.hrv, row.avg_val); break
      case 'walkingHeartRate': d.walkingHeartRate = keepAvg(d.walkingHeartRate, row.avg_val); break
      case 'oxygenSaturation': d.oxygenSaturation = keepAvg(d.oxygenSaturation, row.avg_val); break
      case 'respiratoryRate': d.respiratoryRate = keepAvg(d.respiratoryRate, row.avg_val); break
      case 'wristTemperature': d.wristTemperature = keepAvg(d.wristTemperature, row.avg_val); break
      case 'vo2max': d.vo2max = keepAvg(d.vo2max, row.avg_val); break
      case 'steps': d.steps = maxSum(d.steps, row.sum_val); break
      case 'distance': d.distance = maxSum(d.distance, row.sum_val); break
      case 'activeEnergy': d.activeEnergy = maxSum(d.activeEnergy, row.sum_val); break
      case 'exerciseMinutes': d.exerciseMinutes = maxSum(d.exerciseMinutes, row.sum_val); break
      case 'flightsClimbed': d.flightsClimbed = maxSum(d.flightsClimbed, row.sum_val); break
    }
  }

  // При дублях/фрагментах sleep_sessions берём ОСНОВНОЙ сон — с макс. длительностью
  const mainSleep = new Map<string, number>() // date → лучшая длительность
  for (const row of sleepRes.data ?? []) {
    if (!byDate.has(row.date)) byDate.set(row.date, { date: row.date })
    const dur = row.duration_hours ?? 0
    const best = mainSleep.get(row.date)
    if (best != null && dur <= best) continue // уже есть более длинный сон за этот день
    mainSleep.set(row.date, dur)
    const d = byDate.get(row.date)!
    d.sleepHours = row.duration_hours ?? undefined
    d.sleepBedtime = row.bedtime ?? undefined
    d.sleepWakeTime = row.wake_time ?? undefined
    d.sleepDeep = row.deep_hours ?? undefined
    d.sleepREM = row.rem_hours ?? undefined
    d.sleepCore = row.core_hours ?? undefined
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// Store last 90 days of HR samples (needed for stress map)
export async function syncHRSamples(userId: string, samples: HeartRateSample[]): Promise<boolean> {
  if (!samples.length) return true

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)
  const recent = samples.filter(s => s.time >= cutoff)
  if (!recent.length) return true

  // Дедуп по ts: Apple Watch пишет несколько замеров в одну секунду, а upsert
  // падает с "ON CONFLICT DO UPDATE cannot affect row a second time" если в
  // одной пачке два одинаковых (user_id, ts). Оставляем последний замер на секунду.
  const byTs = new Map<string, { user_id: string; ts: string; bpm: number; source: string }>()
  for (const s of recent) {
    const ts = s.time.toISOString()
    byTs.set(ts, { user_id: userId, ts, bpm: Math.round(s.value), source: s.sourceName })
  }
  const rows = [...byTs.values()]

  const chunkSize = 500
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase.from('heart_rate_samples').upsert(rows.slice(i, i + chunkSize), {
      onConflict: 'user_id,ts',
    })
    if (error) {
      console.error('syncHRSamples error:', error.message)
      return false
    }
  }
  return true
}

export async function loadHRSamples(userId: string): Promise<HeartRateSample[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)

  const pageSize = 1000
  const allData: { ts: string; bpm: number; source: string | null }[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('heart_rate_samples')
      .select('ts,bpm,source')
      .eq('user_id', userId)
      .gte('ts', cutoff.toISOString())
      .order('ts')
      .range(from, from + pageSize - 1)
    if (error) { console.warn('hr_samples load error:', error.message); break }
    if (!data || data.length === 0) break
    allData.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return allData.map(r => ({
    time: new Date(r.ts),
    value: r.bpm,
    sourceName: r.source ?? '',
  }))
}

export async function getLastSyncInfo(userId: string) {
  const { data } = await supabase
    .from('imports')
    .select('imported_at, records_added, period_end')
    .eq('user_id', userId)
    .order('imported_at', { ascending: false })
    .limit(1)
    .single()
  return data
}
