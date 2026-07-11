import { supabase } from './supabase'
import type { DailyMetrics } from '../types'

export interface Goal {
  id: string
  user_id: string
  metric: string
  title: string
  baseline_value: number | null
  target_value: number
  direction: 'up' | 'down' | 'earlier' | 'habit'
  start_date: string
  end_date: string
  status: 'active' | 'paused' | 'achieved' | 'failed'
  recommendation_id: string | null
  step_size: number | null
  created_at: string
}

export interface Recommendation {
  id: string
  user_id: string
  metric: string
  text: string
  rationale: string | null
  suggested_target: number | null
  suggested_target_label: string | null
  status: 'new' | 'accepted' | 'dismissed' | 'snoozed'
  created_at: string
}

export interface GoalProgress {
  daysTotal: number
  daysOnTarget: number
  daysWithData: number
  currentAvg: number | null
  pct: number
  status: 'on_track' | 'behind' | 'achieved' | 'no_data'
  trend: 'improving' | 'stable' | 'worsening' | null
}

export const METRIC_CONFIG: Record<string, {
  label: string; unit: string; field: keyof DailyMetrics; direction: Goal['direction']; decimals?: number
}> = {
  sleep_hours:         { label: 'Длительность сна', unit: 'ч', field: 'sleepHours', direction: 'up', decimals: 1 },
  hrv:                 { label: 'HRV', unit: 'мс', field: 'hrv', direction: 'up', decimals: 0 },
  resting_heart_rate:  { label: 'Пульс покоя', unit: 'уд/мин', field: 'restingHeartRate', direction: 'down', decimals: 0 },
  steps:               { label: 'Шаги', unit: 'шаг/д', field: 'steps', direction: 'up', decimals: 0 },
  active_energy:       { label: 'Активные калории', unit: 'ккал', field: 'activeEnergy', direction: 'up', decimals: 0 },
  sleep_deep:          { label: 'Глубокий сон', unit: 'ч', field: 'sleepDeep', direction: 'up', decimals: 1 },
}

export function computeBaseline(daily: DailyMetrics[], metric: string, days = 14): number | null {
  const cfg = METRIC_CONFIG[metric]
  if (!cfg) return null
  const sorted = [...daily].sort((a, b) => b.date.localeCompare(a.date)).slice(0, days)
  const vals = sorted.map(d => d[cfg.field] as number | null).filter((v): v is number => v != null)
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export function computeProgress(goal: Goal, daily: DailyMetrics[]): GoalProgress {
  const cfg = METRIC_CONFIG[goal.metric]
  if (!cfg) return { daysTotal: 0, daysOnTarget: 0, daysWithData: 0, currentAvg: null, pct: 0, status: 'no_data', trend: null }

  const allDays: string[] = []
  const d = new Date(goal.start_date)
  const end = new Date(Math.min(new Date(goal.end_date).getTime(), Date.now()))
  while (d <= end) { allDays.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) }

  const dailyMap = new Map(daily.map(d => [d.date, d]))

  let daysOnTarget = 0
  let daysWithData = 0
  const vals: number[] = []

  for (const day of allDays) {
    const row = dailyMap.get(day)
    const val = row ? (row[cfg.field] as number | null) : null
    if (val == null) continue
    daysWithData++
    vals.push(val)
    const onTarget = goal.direction === 'up' ? val >= goal.target_value
      : goal.direction === 'down' ? val <= goal.target_value
      : val >= goal.target_value
    if (onTarget) daysOnTarget++
  }

  const currentAvg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  const pct = daysWithData ? Math.round((daysOnTarget / daysWithData) * 100) : 0

  // Trend: compare first half vs second half
  let trend: GoalProgress['trend'] = null
  if (vals.length >= 4) {
    const half = Math.floor(vals.length / 2)
    const a1 = vals.slice(0, half).reduce((a, b) => a + b, 0) / half
    const a2 = vals.slice(half).reduce((a, b) => a + b, 0) / (vals.length - half)
    const diff = goal.direction === 'down' ? a1 - a2 : a2 - a1
    trend = diff > 0.5 ? 'improving' : diff < -0.5 ? 'worsening' : 'stable'
  }

  const isAchieved = currentAvg !== null && (
    goal.direction === 'up' ? currentAvg >= goal.target_value :
    goal.direction === 'down' ? currentAvg <= goal.target_value :
    currentAvg >= goal.target_value
  )

  const status: GoalProgress['status'] = daysWithData === 0 ? 'no_data'
    : isAchieved ? 'achieved'
    : pct >= 60 ? 'on_track'
    : 'behind'

  return { daysTotal: allDays.length, daysOnTarget, daysWithData, currentAvg, pct, status, trend }
}

export async function loadGoals(userId: string): Promise<Goal[]> {
  const { data, error } = await supabase.from('goals').select('*').eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Goal[]
}

// ── Жизненный цикл: истёкшие активные цели закрываются как achieved/failed ──
export function isExpired(goal: Goal, today = new Date().toISOString().slice(0, 10)): boolean {
  return goal.status === 'active' && goal.end_date < today
}

// Итог по средней за период: достигла цель или нет (no_data — не достигла)
export function finalStatus(goal: Goal, daily: DailyMetrics[]): 'achieved' | 'failed' {
  return computeProgress(goal, daily).status === 'achieved' ? 'achieved' : 'failed'
}

export async function finalizeExpiredGoals(goals: Goal[], daily: DailyMetrics[]): Promise<Goal[]> {
  return Promise.all(goals.map(async g => {
    if (!isExpired(g)) return g
    const status = finalStatus(g, daily)
    await updateGoalStatus(g.id, status)
    return { ...g, status }
  }))
}

export async function createGoal(userId: string, goal: Omit<Goal, 'id' | 'user_id' | 'created_at'>): Promise<Goal | null> {
  const { data } = await supabase.from('goals').insert({ user_id: userId, ...goal }).select().single()
  return data as Goal | null
}

export async function updateGoalStatus(id: string, status: Goal['status']): Promise<void> {
  await supabase.from('goals').update({ status }).eq('id', id)
}

export async function deleteGoal(id: string): Promise<void> {
  await supabase.from('goals').delete().eq('id', id)
}

export async function loadRecommendations(userId: string): Promise<Recommendation[]> {
  const { data, error } = await supabase.from('recommendations').select('*')
    .eq('user_id', userId).eq('status', 'new').order('created_at', { ascending: false }).limit(5)
  if (error) throw error
  return (data ?? []) as Recommendation[]
}

export async function updateRecommendationStatus(id: string, status: Recommendation['status']): Promise<void> {
  await supabase.from('recommendations').update({ status }).eq('id', id)
}
