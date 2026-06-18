import { supabase } from './supabase'
import { loadMetricsFromSupabase } from './sync'
import type { DailyMetrics } from '../types'

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const today = () => new Date().toISOString().slice(0, 10)

// ── Полный бэкап в JSON ─────────────────────────────────────────────────────
export async function exportAllJSON(userId: string): Promise<void> {
  const [daily, intake, sups, supLogs, labs, concerns, concernLogs, notes, hair] = await Promise.all([
    loadMetricsFromSupabase(userId),
    supabase.from('intake_events').select('ts, type, amount, unit, note').eq('user_id', userId).order('ts'),
    supabase.from('supplements').select('name, default_dose, unit, active').eq('user_id', userId),
    supabase.from('supplement_logs').select('supplement_id, date, taken, dose').eq('user_id', userId),
    supabase.from('lab_results').select('marker, value, unit, ref_range, flag, date').eq('user_id', userId).order('date'),
    supabase.from('health_concerns').select('name, category, status, started_at').eq('user_id', userId),
    supabase.from('concern_logs').select('concern_id, date, severity, note').eq('user_id', userId),
    supabase.from('context_notes').select('date, note').eq('user_id', userId).order('date'),
    supabase.from('hair_entries').select('date, shedding_level, density_rating, hairline_rating, notes').eq('user_id', userId).order('date'),
  ])

  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'Tonus',
    dailyMetrics: daily,
    intakeEvents: intake.data ?? [],
    supplements: sups.data ?? [],
    supplementLogs: supLogs.data ?? [],
    labResults: labs.data ?? [],
    concerns: concerns.data ?? [],
    concernLogs: concernLogs.data ?? [],
    dayNotes: notes.data ?? [],
    hairEntries: hair.data ?? [],
  }
  download(`tonus-backup-${today()}.json`, JSON.stringify(payload, null, 2), 'application/json')
}

// ── Дневные метрики в CSV ───────────────────────────────────────────────────
export async function exportMetricsCSV(userId: string): Promise<void> {
  const daily = await loadMetricsFromSupabase(userId)
  const cols: { key: keyof DailyMetrics; label: string; spo2?: boolean }[] = [
    { key: 'restingHeartRate', label: 'resting_hr_bpm' },
    { key: 'hrv', label: 'hrv_ms' },
    { key: 'walkingHeartRate', label: 'walking_hr_bpm' },
    { key: 'oxygenSaturation', label: 'spo2_percent', spo2: true },
    { key: 'respiratoryRate', label: 'respiratory_rate' },
    { key: 'wristTemperature', label: 'wrist_temp_c' },
    { key: 'vo2max', label: 'vo2max' },
    { key: 'sleepHours', label: 'sleep_hours' },
    { key: 'sleepDeep', label: 'sleep_deep_h' },
    { key: 'sleepREM', label: 'sleep_rem_h' },
    { key: 'sleepCore', label: 'sleep_core_h' },
    { key: 'sleepBedtime', label: 'bedtime' },
    { key: 'sleepWakeTime', label: 'wake_time' },
    { key: 'steps', label: 'steps' },
    { key: 'distance', label: 'distance_km' },
    { key: 'activeEnergy', label: 'active_kcal' },
    { key: 'exerciseMinutes', label: 'exercise_min' },
    { key: 'flightsClimbed', label: 'flights' },
  ]
  const header = ['date', ...cols.map(c => c.label)].join(',')
  const rows = [...daily].sort((a, b) => a.date.localeCompare(b.date)).map(d => {
    const vals = cols.map(c => {
      const v = d[c.key]
      if (v == null) return ''
      if (c.spo2 && typeof v === 'number') return (v * 100).toFixed(1)
      if (typeof v === 'number') return String(Math.round(v * 100) / 100)
      return String(v)
    })
    return [d.date, ...vals].join(',')
  })
  download(`tonus-metrics-${today()}.csv`, [header, ...rows].join('\n'), 'text/csv')
}
