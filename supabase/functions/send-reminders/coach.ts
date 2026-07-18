import { localNow, timeDue } from './time.ts'
import { tgSend } from './tg.ts'
import type { Ctx } from './ctx.ts'

// ── 7. Проактивные алерты (раз в день ~10:00, дедуп 3 дня) ───────────────────
export async function runProactiveAlerts({ supabase, nowMs }: Ctx): Promise<number> {
  let alertsSent = 0
  const { hhmm } = localNow('Europe/Kyiv')
  if (timeDue('10:00', hhmm)) {
    const { data: links } = await supabase
      .from('telegram_links').select('user_id, telegram_chat_id').eq('status', 'active')
    const since = new Date(nowMs - 21 * 86400000).toISOString().slice(0, 10)

    for (const l of links ?? []) {
      const { data: rows } = await supabase
        .from('daily_metrics')
        .select('date, resting_heart_rate, hrv, sleep_hours')
        .eq('user_id', l.user_id).gte('date', since).order('date', { ascending: true })
      if (!rows || rows.length < 10) continue
      const recent = (rows as { date: string; resting_heart_rate: number | null; hrv: number | null; sleep_hours: number | null }[]).slice(-3)
      const col = (rs: Record<string, unknown>[], k: string): number[] =>
        rs.map(r => r[k]).filter((v): v is number => typeof v === 'number')

      // hrv_drop и rhr_rise удалены: их покрывает страж здоровья
      // (_shared/anomaly.ts в ingest-health, z-score против личной нормы) —
      // иначе пользователь получал бы двойные алерты об одном и том же.
      const checks: { type: string; cond: boolean; msg: string }[] = []
      const lastSleep = col(recent, 'sleep_hours')
      if (lastSleep.length >= 3 && lastSleep.every(v => v < 6))
        checks.push({ type: 'sleep_short', cond: true, msg: `😴 <b>Мало сна</b>\n3 ночи подряд меньше 6 часов. Накопленный недосып бьёт по восстановлению — постарайся лечь раньше.` })

      for (const c of checks) {
        if (!c.cond) continue
        const { data: recentAlert } = await supabase
          .from('health_alerts')
          .select('created_at').eq('user_id', l.user_id).eq('type', c.type)
          .gte('created_at', new Date(nowMs - 3 * 86400000).toISOString())
          .limit(1).maybeSingle()
        if (recentAlert) continue
        await tgSend(l.telegram_chat_id, c.msg)
        await supabase.from('health_alerts').insert({ user_id: l.user_id, type: c.type })
        alertsSent++
      }
    }
  }
  return alertsSent
}

// ── 8. Контекстные nudges коуча (раз в день ~13:00, дедуп 4 дня) ─────────────
// Связывают поведение (события) с результатом по личным данным пользователя.
export async function runCoachNudges({ supabase, nowMs }: Ctx): Promise<number> {
  let nudgesSent = 0
  const { hhmm } = localNow('Europe/Kyiv')
  if (timeDue('13:00', hhmm)) {
    const { data: links } = await supabase
      .from('telegram_links').select('user_id, telegram_chat_id').eq('status', 'active')
    const avgF = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null
    const sinceM = new Date(nowMs - 21 * 86400000).toISOString().slice(0, 10)
    const sinceE = new Date(nowMs - 7 * 86400000).toISOString()
    // §2.4: настоящий час в Киеве через Intl (жёсткое +3 ломалось на зимнем времени)
    const kyivHour = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Kyiv', hour: '2-digit', hour12: false,
    }).format(new Date(iso)))

    for (const l of links ?? []) {
      const { data: rs } = await supabase.from('report_settings').select('paused').eq('user_id', l.user_id).maybeSingle()
      if (rs?.paused) continue

      const [{ data: rows }, { data: ev }, { data: score }] = await Promise.all([
        supabase.from('daily_metrics').select('date, hrv, sleep_hours').eq('user_id', l.user_id).gte('date', sinceM).order('date', { ascending: true }),
        supabase.from('intake_events').select('ts, type').eq('user_id', l.user_id).gte('ts', sinceE).order('ts', { ascending: false }),
        supabase.from('daily_scores').select('hrv_baseline, sleep_baseline').eq('user_id', l.user_id).order('date', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (!rows || rows.length < 10) continue
      const mRows2 = rows as { date: string; hrv: number | null; sleep_hours: number | null }[]
      const col = (rs2: Record<string, unknown>[], k: string): number[] =>
        rs2.map(r => r[k]).filter((v): v is number => typeof v === 'number')
      const recent = mRows2.slice(-3)
      const hrvBase = score?.hrv_baseline ?? avgF(col(mRows2.slice(-17, -3), 'hrv'))
      const sleepBase = score?.sleep_baseline ?? avgF(col(mRows2.slice(-17, -3), 'sleep_hours'))
      const rHrv = avgF(col(recent, 'hrv'))
      const rSleep = avgF(col(recent, 'sleep_hours'))
      const events: { ts: string; type: string }[] = ev ?? []

      // дни (YYYY-MM-DD) с поздним кофе (после 18:00 по Киеву)
      const lateCoffeeDays = new Set(events.filter(e => e.type === 'coffee' && kyivHour(e.ts) >= 18).map(e => e.ts.slice(0, 10)))
      const last3 = [0, 1, 2].map(d => new Date(nowMs - d * 86400000).toISOString().slice(0, 10))
      const alcoholRecent = events.find(e => e.type === 'alcohol' && (nowMs - new Date(e.ts).getTime()) < 2 * 86400000)
      const workoutCount = new Set(events.filter(e => e.type === 'workout').map(e => e.ts.slice(0, 10))).size
      const stressRecent = events.find(e => e.type === 'stress' && (nowMs - new Date(e.ts).getTime()) < 2 * 86400000)

      // выбираем ОДИН наиболее уместный nudge
      let nudge: { type: string; msg: string } | null = null
      if (alcoholRecent && rHrv != null && hrvBase && rHrv < hrvBase * 0.85) {
        nudge = { type: 'alcohol_hrv', msg: `🍷→💚 Заметил: после алкоголя на днях твой HRV ${rHrv.toFixed(0)} мс — ниже твоей нормы ${Math.round(hrvBase)} мс. У тебя восстановление обычно проседает после выпивки. Пара дней без — и увидишь, как отзовётся.` }
      } else if (last3.filter(d => lateCoffeeDays.has(d)).length >= 2 && rSleep != null && sleepBase && rSleep < sleepBase - 0.5) {
        nudge = { type: 'late_coffee', msg: `☕🌙 Кофе после 18:00 уже несколько дней подряд, и сон стал короче (${rSleep.toFixed(1)}ч против нормы ${sleepBase.toFixed(1)}ч). Попробуй последнюю чашку до обеда — часто это заметно улучшает сон.` }
      } else if (stressRecent && rHrv != null && hrvBase && rHrv < hrvBase * 0.9) {
        nudge = { type: 'stress_hrv', msg: `😰→💚 Ты отмечал стресс на днях, и HRV сейчас ниже нормы. Тело реагирует. Короткая прогулка, дыхание или ранний отбой сегодня помогут восстановиться.` }
      } else if (workoutCount >= 3 && rHrv != null && hrvBase && rHrv >= hrvBase) {
        nudge = { type: 'workout_good', msg: `🏋️✨ ${workoutCount} тренировки за неделю — и восстановление держится на уровне нормы. Хороший баланс нагрузки и отдыха, так держать!` }
      }

      if (nudge) {
        const { data: dup } = await supabase
          .from('coach_events').select('created_at')
          .eq('user_id', l.user_id).eq('type', 'nudge')
          .gte('created_at', new Date(nowMs - 4 * 86400000).toISOString())
          .limit(1).maybeSingle()
        if (!dup) {
          // позитивное подкрепление не требует follow-up — без кнопок
          const markup = nudge.type === 'workout_good' ? undefined : {
            inline_keyboard: [[
              { text: '👍 Беру в работу', callback_data: `nudge_acc:${nudge.type}` },
              { text: 'Не сейчас', callback_data: 'nudge_no' },
            ]],
          }
          await tgSend(l.telegram_chat_id, nudge.msg, markup)
          await supabase.from('coach_events').insert({ user_id: l.user_id, type: 'nudge', payload: { subtype: nudge.type } })
          nudgesSent++
        }
      }
    }
  }
  return nudgesSent
}

// ── 9. Резолвер follow-up: подвести итог принятого совета по сроку ───────────
export async function runFollowupResolver({ supabase, nowMs }: Ctx): Promise<number> {
  let followupsSent = 0
  const { data: openFollowups } = await supabase
    .from('coach_events').select('id, user_id, payload')
    .eq('type', 'followup').eq('status', 'open')
  type FollowupRow = { id: string; user_id: string; payload: { due?: string; metric?: string; baseline?: number | null } | null }
  const due = ((openFollowups ?? []) as FollowupRow[]).filter(f => f.payload?.due && f.payload.due <= new Date(nowMs).toISOString())
  const avgF = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null

  for (const f of due) {
    const metric = f.payload?.metric === 'sleep_hours' ? 'sleep_hours' : 'hrv'
    const baseline = f.payload?.baseline as number | null
    const { data: link } = await supabase
      .from('telegram_links').select('telegram_chat_id').eq('user_id', f.user_id).eq('status', 'active').maybeSingle()
    const since = new Date(nowMs - 4 * 86400000).toISOString().slice(0, 10)
    const { data: rows } = await supabase
      .from('daily_metrics').select(`date, ${metric}`).eq('user_id', f.user_id).gte('date', since).order('date', { ascending: false }).limit(3)
    const cur = avgF(((rows ?? []) as Record<string, unknown>[])
      .map(r => r[metric]).filter((v): v is number => typeof v === 'number'))

    let msg: string
    const name = metric === 'sleep_hours' ? 'сон' : 'HRV'
    const unit = metric === 'sleep_hours' ? 'ч' : 'мс'
    if (cur != null && baseline) {
      const pct = Math.round(((cur - baseline) / baseline) * 100)
      const better = pct > 2
      msg = better
        ? `🎯 Помнишь совет пару дней назад? Сработало: ${name} сейчас ${cur.toFixed(metric === 'sleep_hours' ? 1 : 0)} ${unit} — это +${pct}% к твоей норме. Продолжай в том же духе!`
        : pct < -2
          ? `🎯 По следам совета: ${name} пока ${cur.toFixed(metric === 'sleep_hours' ? 1 : 0)} ${unit} (${pct}% к норме). Эффект не моментальный — дай ещё несколько дней.`
          : `🎯 По следам совета: ${name} держится около твоей нормы (${cur.toFixed(metric === 'sleep_hours' ? 1 : 0)} ${unit}). Стабильность — тоже хорошо.`
    } else {
      msg = `🎯 Хотел подвести итог совета, но пока мало свежих данных по «${name}». Загляну позже.`
    }

    if (link?.telegram_chat_id) { await tgSend(link.telegram_chat_id, msg); followupsSent++ }
    await supabase.from('coach_events').update({ status: 'done' }).eq('id', f.id)
  }
  return followupsSent
}
