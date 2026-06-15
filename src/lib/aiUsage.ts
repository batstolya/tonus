import { supabase } from './supabase'

// Gemini 2.5 Flash pricing (per 1M tokens, blended input+output estimate)
const COST_PER_1M = 0.30

export interface AiUsageSummary {
  totalTokens: number
  costUsd: number
  bySource: Record<string, number>
}

export async function loadMonthUsage(userId: string): Promise<AiUsageSummary> {
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const { data } = await supabase
    .from('ai_usage')
    .select('source, tokens_used')
    .eq('user_id', userId)
    .gte('created_at', monthStart)

  if (!data || !data.length) return { totalTokens: 0, costUsd: 0, bySource: {} }

  const bySource: Record<string, number> = {}
  let total = 0
  for (const row of data) {
    const t = row.tokens_used ?? 0
    total += t
    bySource[row.source] = (bySource[row.source] ?? 0) + t
  }

  return { totalTokens: total, costUsd: (total / 1_000_000) * COST_PER_1M, bySource }
}

export async function loadBudget(userId: string): Promise<number> {
  const { data } = await supabase
    .from('profiles')
    .select('ai_budget_usd')
    .eq('id', userId)
    .single()
  return data?.ai_budget_usd ?? 5.00
}

export async function saveBudget(userId: string, budget: number): Promise<void> {
  await supabase.from('profiles').upsert({ id: userId, ai_budget_usd: budget })
}
