import { computeBaselineStart, computeResult, type ExpDaily, type ExperimentRow } from '../_shared/experiments.ts'
import { verdictMessage } from '../_shared/experimentVerdict.ts'
import { localNow, timeDue } from './time.ts'
import { tgSend } from './tg.ts'
import type { Ctx } from './ctx.ts'

// ── 12. Автовердикт завершившихся экспериментов (SPEC-EXPERIMENT-LOOP §2.2) ──
// Утром 09:10 локального времени юзера: завершившиеся active-эксперименты
// получают финальный result (атомарно, active→completed) и вердикт в Telegram.
export async function runExperimentVerdicts({ supabase }: Ctx): Promise<number> {
  let verdictsSent = 0
  const { data: activeExps } = await supabase
    .from('experiments')
    .select('id, user_id, hypothesis, target_metric, baseline_days, baseline_start, start_date, end_date')
    .eq('status', 'active')
  for (const exp of activeExps ?? []) {
    try {
      const { data: rs } = await supabase
        .from('report_settings').select('timezone').eq('user_id', exp.user_id).maybeSingle()
      const tz = rs?.timezone || 'Europe/Kyiv'
      const { hhmm, dateStr } = localNow(tz)
      if (!timeDue('09:10', hhmm)) continue
      if (exp.end_date >= dateStr) continue // ещё идёт

      const baseStart = exp.baseline_start ?? computeBaselineStart(exp.start_date, exp.baseline_days)
      const [mRes, sRes, hrRes] = await Promise.all([
        supabase.from('daily_metrics')
          .select('date, hrv, resting_heart_rate, sleep_hours, steps, active_energy, oxygen_saturation')
          .eq('user_id', exp.user_id).gte('date', baseStart).lte('date', exp.end_date),
        supabase.from('sleep_sessions')
          .select('date, deep_hours, rem_hours')
          .eq('user_id', exp.user_id).gte('date', baseStart).lte('date', exp.end_date),
        supabase.from('metrics_daily')
          .select('date, avg_val')
          .eq('user_id', exp.user_id).eq('metric', 'heartRate').gte('date', baseStart).lte('date', exp.end_date),
      ])
      type MRow = { date: string; hrv: number | null; resting_heart_rate: number | null; sleep_hours: number | null; steps: number | null; active_energy: number | null; oxygen_saturation: number | null }
      const byDate = new Map<string, ExpDaily>()
      for (const r of (mRes.data ?? []) as MRow[]) {
        byDate.set(r.date, {
          date: r.date, hrv: r.hrv, restingHeartRate: r.resting_heart_rate,
          sleepHours: r.sleep_hours, steps: r.steps, activeEnergy: r.active_energy,
          oxygenSaturation: r.oxygen_saturation,
        })
      }
      for (const s of (sRes.data ?? []) as { date: string; deep_hours: number | null; rem_hours: number | null }[]) {
        const d = byDate.get(s.date) ?? { date: s.date }
        d.sleepDeep = s.deep_hours
        d.sleepREM = s.rem_hours
        byDate.set(s.date, d)
      }
      for (const h of (hrRes.data ?? []) as { date: string; avg_val: number | null }[]) {
        if (h.avg_val == null) continue
        const d = byDate.get(h.date) ?? { date: h.date }
        d.heartRate = { avg: h.avg_val }
        byDate.set(h.date, d)
      }
      const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
      const result = computeResult(daily, exp as unknown as ExperimentRow)

      // Атомарный переход: 0 строк → уже завершил параллельный ран, не дублируем
      const { data: updated } = await supabase
        .from('experiments')
        .update({ status: 'completed', result })
        .eq('id', exp.id).eq('status', 'active')
        .select('id')
      if (!updated?.length) continue

      const { data: link } = await supabase
        .from('telegram_links').select('telegram_chat_id').eq('user_id', exp.user_id).eq('status', 'active').maybeSingle()
      if (link?.telegram_chat_id) {
        await tgSend(link.telegram_chat_id, verdictMessage(exp.hypothesis, exp.target_metric, result))
        verdictsSent++
      }
    } catch {
      // ошибка одного эксперимента не роняет весь ран — доберём завтра
    }
  }
  return verdictsSent
}
