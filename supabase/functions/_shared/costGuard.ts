// AI Cost Guard — единый предохранитель бюджета перед каждым вызовом Gemini
// (см. new-speca-refactoring #2). Источник лимита: profiles.ai_budget_usd.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.2'

const COST_PER_1M = 0.30 // Gemini 2.5 Flash, $/1M токенов (как на фронте)

export interface BudgetStatus {
  ok: boolean
  usedUsd: number
  budgetUsd: number
  usedTokens: number
}

// Сумма токенов за текущий месяц + сравнение с бюджетом.
// budgetUsd <= 0 трактуется как «без лимита».
export async function checkBudget(supabase: SupabaseClient, userId: string): Promise<BudgetStatus> {
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [{ data: usage }, { data: prof }] = await Promise.all([
    supabase.from('ai_usage').select('tokens_used').eq('user_id', userId).gte('created_at', monthStart),
    supabase.from('profiles').select('ai_budget_usd').eq('id', userId).maybeSingle(),
  ])

  const usedTokens = ((usage ?? []) as { tokens_used: number | null }[]).reduce((s, r) => s + (r.tokens_used ?? 0), 0)
  const usedUsd = (usedTokens / 1_000_000) * COST_PER_1M
  const budgetUsd = prof?.ai_budget_usd ?? 5.0
  const ok = budgetUsd <= 0 || usedUsd < budgetUsd

  return { ok, usedUsd, budgetUsd, usedTokens }
}

// Готовое сообщение при превышении (для Telegram/чата).
export function budgetExceededMessage(s: BudgetStatus): string {
  return `⚠️ Достигнут месячный лимит ИИ-расходов ($${s.usedUsd.toFixed(2)} из $${s.budgetUsd.toFixed(2)}). ` +
    `Увеличь бюджет в Настройках → AI-расходы или подожди начала следующего месяца.`
}
