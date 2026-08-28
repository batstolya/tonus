// callback_query handling: button presses routed via routeCallback. Bodies are
// moved verbatim from index.ts (B3 split); only the dispatch mechanism changed
// from a raw-string if/else chain to router tags (see router.test.ts).

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { localDate } from '../_shared/time.ts'
import { parseFootballCallback, buildFootballResponseText } from '../_shared/football.ts'
import { addDays as expAddDays, computeBaselineStart } from '../_shared/experiments.ts'
import { takeDose, doseProgressText } from '../_shared/supplementDose.ts'
import { tgCall, tgSend, tgEdit, tgAnswerCallback } from './tg.ts'
import { MAIN_MENU, BACK_MENU } from './menus.ts'
import { routeCallback } from './router.ts'
import {
  handleReport, handleStatus, handleSupplements, handleGoals, handleSettings,
  handleFootballMatches, setFootballReminders, handleExperimentSuggest,
  handleHabits, handleHabitMenu, handleHabitBreak,
} from './commands.ts'

interface CallbackQuery {
  id: string
  data: string
  message: { chat: { id: number }; message_id: number }
}

export async function handleCallback(cq: CallbackQuery, supabase: SupabaseClient): Promise<void> {
  const chatId = cq.message.chat.id
  const route = routeCallback(cq.data)

  await tgAnswerCallback(cq.id)

  // Malformed hb:/hbx: payload (e.g. an offset beyond yesterday) — nothing to do.
  if (!route) return

  const { data: link } = await supabase
    .from('telegram_links')
    .select('user_id')
    .eq('telegram_chat_id', String(chatId))
    .single()

  if (!link) {
    await tgSend(chatId, '❓ Аккаунт не найден. Подключи Telegram в настройках Tonus.')
    return
  }

  const userId = link.user_id

  if (route.kind === 'menu') {
    await tgSend(chatId, '🏠 Главное меню', { reply_markup: MAIN_MENU })
  } else if (route.kind === 'report') {
    await tgSend(chatId, '⏳ Генерирую отчёт, подожди немного…')
    await handleReport(chatId, userId, supabase)
  } else if (route.kind === 'status') {
    await handleStatus(chatId, userId, supabase)
  } else if (route.kind === 'supplements') {
    await handleSupplements(chatId, userId, supabase)
  } else if (route.kind === 'goals') {
    await handleGoals(chatId, userId, supabase)
  } else if (route.kind === 'settings') {
    await handleSettings(chatId, userId, supabase)
  } else if (route.kind === 'habits') {
    await handleHabits(chatId, userId, supabase)
  } else if (route.kind === 'habit_menu') {
    await handleHabitMenu(chatId, userId, route.habitId, supabase)
  } else if (route.kind === 'habit_break') {
    await handleHabitBreak(chatId, userId, route.habitId, route.dayOffset, route.broken, supabase)
  } else if (route.kind === 'exp_suggest') {
    await handleExperimentSuggest(chatId, userId, supabase)
  } else if (route.kind === 'expsug') {
    // Запуск эксперимента из предложения (SPEC-EXPERIMENT-LOOP §2.1)
    const evId = route.eventId
    const { data: ev } = await supabase.from('coach_events')
      .select('id, payload, status').eq('id', evId).eq('user_id', userId).maybeSingle()
    if (!ev || ev.status !== 'open') {
      await tgSend(chatId, 'Этот эксперимент уже запущен или устарел.', { reply_markup: BACK_MENU })
    } else {
      const s = ev.payload as { hypothesis: string; change_rule: string; target_metric: string }
      const { data: ns } = await supabase.from('daily_note_settings').select('timezone').eq('user_id', userId).maybeSingle()
      const tz = (ns?.timezone as string) || 'Europe/Kyiv'
      const start = expAddDays(localDate(tz), 1)
      const end = expAddDays(start, 13)
      const { error: insErr } = await supabase.from('experiments').insert({
        user_id: userId,
        hypothesis: s.hypothesis, change_rule: s.change_rule, target_metric: s.target_metric,
        baseline_days: 14, baseline_start: computeBaselineStart(start, 14),
        start_date: start, end_date: end, status: 'active',
      })
      if (insErr) {
        await tgSend(chatId, '🤔 Не получилось запустить, попробуй из приложения.', { reply_markup: BACK_MENU })
      } else {
        await supabase.from('coach_events').update({ status: 'done' }).eq('id', ev.id)
        // убрать кнопку с исходного сообщения — защита от повторного тапа (паттерн wb:)
        await tgCall('editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id })
        await tgSend(chatId, `▶️ Запустил! Стартуем ${start}, вердикт пришлю утром после ${end}.\n\nПравило на 14 дней: ${s.change_rule}`, { reply_markup: BACK_MENU })
      }
    }
  } else if (route.kind === 'pause') {
    await supabase.from('report_settings').upsert({ user_id: userId, paused: true }, { onConflict: 'user_id' })
    await tgSend(chatId, '⏸ Автоотчёты приостановлены.', { reply_markup: BACK_MENU })
  } else if (route.kind === 'resume') {
    await supabase.from('report_settings').upsert({ user_id: userId, paused: false }, { onConflict: 'user_id' })
    await tgSend(chatId, '▶️ Автоотчёты возобновлены.', { reply_markup: BACK_MENU })
  } else if (route.kind === 'disconnect') {
    await supabase.from('telegram_links').update({ status: 'paused' }).eq('user_id', userId)
    await tgSend(chatId, '🔌 Telegram отключён от Tonus. Для повторного подключения зайди в настройки приложения.')
  } else if (route.kind === 'wellbeing') {
    // РЕДАКТИРУЕМ исходное сообщение (без reply_markup → кнопки убираются),
    // чтобы оценку нельзя было нажать повторно и плодить дубли записей.
    const msgId = cq.message.message_id
    const { date, score } = route
    if (date && score >= 1 && score <= 5) {
      await supabase.from('context_notes').upsert(
        { user_id: userId, date, wellbeing: score, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date' }
      )
      await tgEdit(chatId, msgId, `🙂 Записал самочувствие: ${score}/5 за ${date}.`)
    }
  } else if (route.kind === 'take') {
    const supId = route.supplementId
    const today = new Date().toISOString().slice(0, 10)
    const progress = await takeDose(supabase, userId, supId, today)
    const { data: sup } = await supabase.from('supplements').select('name').eq('id', supId).single()
    const name = sup?.name ?? 'Препарат'
    const suffix = progress && progress.perDay > 1 && progress.count < progress.perDay
      ? ` (${progress.count}/${progress.perDay})`
      : ''
    await tgSend(chatId, `✅ ${name} отмечен как принятый сегодня${suffix}.`, { reply_markup: BACK_MENU })
  } else if (route.kind === 'reminder') {
    // ── Напоминание о приёме: принял / отложить / пропустить ──
    // Во всех ветках РЕДАКТИРУЕМ исходное сообщение (без reply_markup → кнопки
    // убираются), чтобы его нельзя было нажать повторно и плодить дубли ответов.
    const msgId = cq.message.message_id
    const resolve = (text: string) => tgEdit(chatId, msgId, text, { parse_mode: 'HTML' })

    const { action, eventId: evId, minutes: mins } = route

    const { data: ev } = await supabase
      .from('reminder_events')
      .select('status, supplement_id, due_at, supplements(name)')
      .eq('id', evId).eq('user_id', userId).maybeSingle()
    // join для to-one в рантайме — объект, но untyped-клиент выводит массив
    const supJoin = ev?.supplements as { name: string } | { name: string }[] | null | undefined
    const name = (Array.isArray(supJoin) ? supJoin[0]?.name : supJoin?.name) ?? 'Препарат'
    const now = new Date().toISOString()

    if (!ev) {
      await resolve('⚠️ Напоминание не найдено.')
    } else if (ev.status === 'taken' || ev.status === 'skipped') {
      // уже обработано (повторное нажатие) — просто убираем кнопки, без новых записей
      await resolve(`${ev.status === 'taken' ? '✅' : '⏭'} <b>${name}</b> — уже отмечено сегодня.`)
    } else if (action === 'take') {
      // Дата приёма — локальный день ДОЗЫ (due_at в tz напоминания), не UTC-«сейчас»:
      // поздний приём после полуночи по Киеву не уезжает на другой день (§2.4).
      const { data: rs } = await supabase
        .from('reminder_settings').select('timezone')
        .eq('user_id', userId).eq('supplement_id', ev.supplement_id).maybeSingle()
      const today = localDate(rs?.timezone || 'Europe/Kyiv', ev.due_at ? new Date(ev.due_at) : new Date())
      const progress = await takeDose(supabase, userId, ev.supplement_id, today)
      await supabase.from('reminder_events').update({ status: 'taken', responded_at: now }).eq('id', evId)
      await resolve(doseProgressText(name, progress))
    } else if (action === 'snz') {
      // R4: предел переносов — не дальше 4ч от исходной дозы
      const until = new Date(Date.now() + mins * 60000)
      const deadline = ev.due_at ? new Date(ev.due_at).getTime() + 4 * 3600 * 1000 : Infinity
      if (until.getTime() > deadline) {
        await supabase.from('reminder_events').update({ status: 'skipped', responded_at: now }).eq('id', evId)
        await resolve(`⏭ <b>${name}</b> — лимит переносов исчерпан, пропущено на сегодня.`)
      } else {
        await supabase.from('reminder_events').update({ status: 'snoozed', snooze_until: until.toISOString() }).eq('id', evId)
        await resolve(`⏰ <b>${name}</b> — напомню через ${mins >= 120 ? '2 часа' : '1 час'}.`)
      }
    } else {
      await supabase.from('reminder_events').update({ status: 'skipped', responded_at: now }).eq('id', evId)
      await resolve(`⏭ <b>${name}</b> — пропущено на сегодня.`)
    }
  } else if (route.kind === 'nudge_acc') {
    // Коуч: пользователь берёт совет в работу → ставим follow-up через 5 дней
    const subtype = route.subtype
    const metric = subtype === 'late_coffee' ? 'sleep_hours' : 'hrv' // что отслеживаем
    const { data: score } = await supabase
      .from('daily_scores').select('hrv_baseline, sleep_baseline')
      .eq('user_id', userId).order('date', { ascending: false }).limit(1).maybeSingle()
    const baseline = metric === 'sleep_hours' ? score?.sleep_baseline ?? null : score?.hrv_baseline ?? null
    await supabase.from('coach_events').insert({
      user_id: userId, type: 'followup', status: 'open',
      payload: { subtype, metric, baseline, due: new Date(Date.now() + 5 * 86400000).toISOString() },
    })
    await tgSend(chatId, '👍 Беру на заметку — проверю через несколько дней, как отзовётся, и вернусь с результатом.')
  } else if (route.kind === 'nudge_no') {
    await tgSend(chatId, 'Окей, без давления 🙂')
  } else if (route.kind === 'fb_matches') {
    await handleFootballMatches(chatId, supabase)
  } else if (route.kind === 'fb_on') {
    await setFootballReminders(chatId, userId, true, supabase)
  } else if (route.kind === 'fb_off') {
    await setFootballReminders(chatId, userId, false, supabase)
  } else if (route.kind === 'football_response') {
    const parsed = parseFootballCallback(route.data)
    const msgId = cq.message.message_id
    if (!parsed) {
      await tgEdit(chatId, msgId, '⚠️ Не удалось обработать ответ.')
    } else {
      const { data: match } = await supabase
        .from('football_matches')
        .select('id, home_team_name, away_team_name, kickoff_at, competition_name, round_name, venue_name, venue_city')
        .eq('short_id', parsed.shortId)
        .maybeSingle()

      if (!match) {
        await tgEdit(chatId, msgId, '⚠️ Матч не найден.')
      } else {
        await supabase.from('football_match_responses').upsert({
          user_id: userId,
          match_id: match.id,
          response: parsed.response,
          telegram_callback_query_id: cq.id,
          telegram_message_id: msgId,
        }, { onConflict: 'user_id,match_id' })

        const text = buildFootballResponseText(match, parsed.response, new Date(), 'ru-RU', 'Europe/Berlin')
        await tgEdit(chatId, msgId, text, { parse_mode: 'HTML' })
      }
    }
  }
}
