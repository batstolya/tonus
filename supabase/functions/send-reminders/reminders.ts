import { shiftTime, workoutNotificationText, type DayEntry, type DayTimes } from '../_shared/workoutPlan.ts'
import { stormNotificationClause } from '../_shared/geoStorm.ts'
import { localNow, timeDue } from './time.ts'
import { tgSend } from './tg.ts'
import type { Ctx } from './ctx.ts'

// ── 10. Обобщённые напоминания (фото волос, устаревшие анализы) ───────────────
export async function runGeneralReminders({ supabase, nowMs }: Ctx): Promise<number> {
  let generalRemindersSent = 0
  const { hhmm } = localNow('Europe/Kyiv')
  // Шлём раз в день в 10:05 (не конфликтует с другими блоками)
  if (timeDue('10:05', hhmm)) {
    const { data: links } = await supabase
      .from('telegram_links').select('user_id, telegram_chat_id').eq('status', 'active')

    for (const l of links ?? []) {
      // Напоминание о фото волос — если последняя запись старше 28 дней
      const { data: lastHair } = await supabase
        .from('hair_entries').select('date').eq('user_id', l.user_id)
        .order('date', { ascending: false }).limit(1).maybeSingle()
      if (lastHair) {
        const daysSince = Math.floor((nowMs - new Date(lastHair.date).getTime()) / 86400000)
        if (daysSince >= 28) {
          const { data: dup } = await supabase.from('health_alerts').select('id')
            .eq('user_id', l.user_id).eq('type', 'hair_photo_reminder')
            .gte('created_at', new Date(nowMs - 25 * 86400000).toISOString()).maybeSingle()
          if (!dup) {
            await tgSend(l.telegram_chat_id, `📸 Прошло ${daysSince} дней с последнего фото волос. Самое время сделать снимок по стандартному протоколу (макушка, линия роста, виски) при хорошем свете — для осмысленного сравнения в динамике.`)
            await supabase.from('health_alerts').insert({ user_id: l.user_id, type: 'hair_photo_reminder' })
            generalRemindersSent++
          }
        }
      }

      // Напоминание об анализах — если последний файл старше 90 дней
      const { data: lastLab } = await supabase
        .from('lab_files').select('uploaded_at').eq('user_id', l.user_id)
        .order('uploaded_at', { ascending: false }).limit(1).maybeSingle()
      if (lastLab) {
        const daysSince = Math.floor((nowMs - new Date(lastLab.uploaded_at).getTime()) / 86400000)
        if (daysSince >= 90) {
          const { data: dup } = await supabase.from('health_alerts').select('id')
            .eq('user_id', l.user_id).eq('type', 'labs_outdated_reminder')
            .gte('created_at', new Date(nowMs - 85 * 86400000).toISOString()).maybeSingle()
          if (!dup) {
            await tgSend(l.telegram_chat_id, `🧪 Последние анализы загружены ${daysSince} дней назад. Если ты сдавал что-то свежее — загрузи в приложении, чтобы ИИ-чат и отчёты видели актуальные биомаркеры.`)
            await supabase.from('health_alerts').insert({ user_id: l.user_id, type: 'labs_outdated_reminder' })
            generalRemindersSent++
          }
        }
      }
    }
  }
  return generalRemindersSent
}

// ── 11. Уведомление о тренировке за N часов (спека workout-schedule §2) ─────
export async function runWorkoutNotices({ supabase }: Ctx): Promise<number> {
  let workoutNoticesSent = 0
  const { data: schedules } = await supabase
    .from('workout_schedule')
    .select('user_id, weekdays, time, day_times, notify_hours_before, timezone, last_notified_date')
    .eq('enabled', true)
  for (const ws of schedules ?? []) {
    const { hhmm, weekday, dateStr } = localNow(ws.timezone || 'Europe/Kyiv')
    // Время своё на каждый день (day_times); legacy-строки без day_times
    // читаем по старой модели weekdays[]+time.
    const dayTimes = (ws.day_times ?? {}) as DayTimes
    const entry: DayEntry | null = dayTimes[String(weekday)]
      ?? (ws.weekdays?.includes(weekday) && ws.time ? { time: ws.time } : null)
    if (!entry) continue
    if (ws.last_notified_date === dateStr) continue
    if (!timeDue(shiftTime(entry.time, ws.notify_hours_before ?? 4), hhmm)) continue
    const { data: link } = await supabase
      .from('telegram_links').select('telegram_chat_id').eq('user_id', ws.user_id).eq('status', 'active').maybeSingle()
    if (!link?.telegram_chat_id) continue
    const { data: score } = await supabase
      .from('daily_scores').select('readiness, hrv_baseline').eq('user_id', ws.user_id).eq('date', dateStr).maybeSingle()
    const { data: hrvRow } = await supabase
      .from('daily_metrics').select('hrv').eq('user_id', ws.user_id).eq('date', dateStr).maybeSingle()
    // Уличный спорт — предупредить о магнитной буре (Kp ≥ 5), если есть.
    const { data: envRow } = await supabase
      .from('environment_daily').select('kp_index').eq('user_id', ws.user_id).eq('date', dateStr).maybeSingle()
    const stormLine = stormNotificationClause(envRow?.kp_index)
    const text = workoutNotificationText(entry, score ? {
      readiness: score.readiness, hrv: hrvRow?.hrv ?? null, hrvBaseline: score.hrv_baseline,
    } : null) + (stormLine ? `\n${stormLine}` : '')
    await tgSend(link.telegram_chat_id, text)
    // send → mark (как в утренней сводке): редкий дубль при сбое между ними приемлем
    await supabase.from('workout_schedule').update({ last_notified_date: dateStr }).eq('user_id', ws.user_id)
    workoutNoticesSent++
  }
  return workoutNoticesSent
}
