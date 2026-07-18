import { localToIso } from '../_shared/time.ts'
import { localNow, timeDue } from './time.ts'
import type { Ctx } from './ctx.ts'

// ── 1. Создать события для наступивших доз ──────────────────────────────────
export async function runDoseCreation({ supabase }: Ctx): Promise<number> {
  const { data: settings } = await supabase
    .from('reminder_settings')
    .select('user_id, supplement_id, times, weekdays, timezone, quiet_until, enabled, supplements(name, default_dose, unit)')
    .eq('enabled', true)

  let created = 0
  for (const s of settings ?? []) {
    const { hhmm, weekday, dateStr } = localNow(s.timezone || 'Europe/Kyiv')
    if (!s.weekdays?.includes(weekday)) continue
    // тихие часы: если сейчас позже quiet_until — не создавать
    if (s.quiet_until && hhmm > s.quiet_until) continue

    for (const t of s.times ?? []) {
      // совпадение с точностью до минуты (cron тикает каждые 5 мин — допускаем окно)
      if (!timeDue(t, hhmm)) continue
      // due_at = сегодняшняя дата + время в этой tz → UTC (через таймзонный хелпер,
      // иначе момент трактуется в UTC рантайма и due_at уезжает на смещение tz).
      const dueKey = localToIso(s.timezone || 'Europe/Kyiv', t, dateStr)
      const { error } = await supabase.from('reminder_events').insert({
        user_id: s.user_id,
        supplement_id: s.supplement_id,
        due_at: dueKey,
        status: 'pending',
      })
      if (!error) created++
    }
  }

  return created
}
