import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchWithTimeout } from '../_shared/http.ts'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'
import { localDate } from '../_shared/time.ts'
import { freshestDataTs } from '../_shared/staleness.ts'
import { detectSaveIntent } from '../_shared/saveIntent.ts'
import { parseFootballCallback, buildFootballResponseText } from '../_shared/football.ts'
import { isValidTelegramSecret } from '../_shared/auth.ts'
import { addDays as expAddDays, computeBaselineStart } from '../_shared/experiments.ts'
import { withObservability } from '../_shared/observability.ts'
import {
  resolveOrCreateOwnedChatSession,
  type SessionOwnershipClient,
} from '../_shared/chatSessionOwnership.ts'
import { isAiConsentRequired } from '../_shared/aiConsent.ts'
import {
  tgCall, tgSend, tgEdit, tgAnswerCallback, tgTyping, tgFileUrl,
  setupCommands, MAX_CHAT_MESSAGE_LENGTH,
} from './tg.ts'
import { MAIN_MENU, REPORT_ACTIONS, BACK_MENU } from './menus.ts'
import {
  AI_CONSENT_TELEGRAM_MESSAGE, handleMealPhoto, transcribeVoice, classifyLog, execLog, handleAiChat,
  type ClassifiedAction,
} from './ai.ts'
import {
  handleReport, handleStatus, handleSupplements, handleGoals, handleSettings,
  handleFootballMenu, handleFootballMatches, setFootballReminders, checkStaleness,
  handleExperimentSuggest,
} from './commands.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''


// ── Main handler ──────────────────────────────────────────────────────────────

const handler = async (req: Request) => {
  // Fail closed: секрет обязателен в runtime (спека §3.1).
  if (!WEBHOOK_SECRET) return new Response('webhook secret not configured', { status: 503 })
  // Проверяем заголовок Telegram ДО чтения тела, setupCommands и createClient.
  if (!isValidTelegramSecret(req, WEBHOOK_SECRET)) return new Response('unauthorized', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return new Response('ok')

  // Setup commands on every request (idempotent, fast)
  setupCommands().catch(() => {})

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // ── Handle callback_query (button presses) ──────────────────────────────────
  if (body.callback_query) {
    const cq = body.callback_query
    const chatId = cq.message.chat.id
    const data = cq.data as string

    await tgAnswerCallback(cq.id)

    const { data: link } = await supabase
      .from('telegram_links')
      .select('user_id')
      .eq('telegram_chat_id', String(chatId))
      .single()

    if (!link) {
      await tgSend(chatId, '❓ Аккаунт не найден. Подключи Telegram в настройках Tonus.')
      return new Response('ok')
    }

    const userId = link.user_id

    if (data === 'menu') {
      await tgSend(chatId, '🏠 Главное меню', { reply_markup: MAIN_MENU })
    } else if (data === 'report') {
      await tgSend(chatId, '⏳ Генерирую отчёт, подожди немного…')
      await handleReport(chatId, userId, supabase)
    } else if (data === 'status') {
      await handleStatus(chatId, userId, supabase)
    } else if (data === 'supplements') {
      await handleSupplements(chatId, userId, supabase)
    } else if (data === 'goals') {
      await handleGoals(chatId, userId, supabase)
    } else if (data === 'settings') {
      await handleSettings(chatId, userId, supabase)
    } else if (data === 'exp_suggest') {
      await handleExperimentSuggest(chatId, userId, supabase)
    } else if (data.startsWith('expsug:')) {
      // Запуск эксперимента из предложения (SPEC-EXPERIMENT-LOOP §2.1)
      const evId = data.slice('expsug:'.length)
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
    } else if (data === 'pause') {
      await supabase.from('report_settings').upsert({ user_id: userId, paused: true }, { onConflict: 'user_id' })
      await tgSend(chatId, '⏸ Автоотчёты приостановлены.', { reply_markup: BACK_MENU })
    } else if (data === 'resume') {
      await supabase.from('report_settings').upsert({ user_id: userId, paused: false }, { onConflict: 'user_id' })
      await tgSend(chatId, '▶️ Автоотчёты возобновлены.', { reply_markup: BACK_MENU })
    } else if (data === 'disconnect') {
      await supabase.from('telegram_links').update({ status: 'paused' }).eq('user_id', userId)
      await tgSend(chatId, '🔌 Telegram отключён от Tonus. Для повторного подключения зайди в настройки приложения.')
    } else if (data.startsWith('wb:')) {
      // РЕДАКТИРУЕМ исходное сообщение (без reply_markup → кнопки убираются),
      // чтобы оценку нельзя было нажать повторно и плодить дубли записей.
      const msgId = cq.message.message_id as number
      const [, date, scoreStr] = data.split(':')
      const score = Number(scoreStr)
      if (date && score >= 1 && score <= 5) {
        await supabase.from('context_notes').upsert(
          { user_id: userId, date, wellbeing: score, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,date' }
        )
        await tgEdit(chatId, msgId, `🙂 Записал самочувствие: ${score}/5 за ${date}.`)
      }
    } else if (data.startsWith('take_')) {
      const supId = data.replace('take_', '')
      const today = new Date().toISOString().slice(0, 10)
      await supabase.from('supplement_logs').upsert(
        { user_id: userId, supplement_id: supId, date: today, taken: true },
        { onConflict: 'user_id,supplement_id,date' }
      )
      const { data: sup } = await supabase.from('supplements').select('name').eq('id', supId).single()
      await tgSend(chatId, `✅ ${sup?.name ?? 'Препарат'} отмечен как принятый сегодня.`, { reply_markup: BACK_MENU })
    } else if (data.startsWith('rem_take_') || data.startsWith('rem_snz_') || data.startsWith('rem_skip_')) {
      // ── Напоминание о приёме: принял / отложить / пропустить ──
      // Во всех ветках РЕДАКТИРУЕМ исходное сообщение (без reply_markup → кнопки
      // убираются), чтобы его нельзя было нажать повторно и плодить дубли ответов.
      const msgId = cq.message.message_id as number
      const resolve = (text: string) => tgEdit(chatId, msgId, text, { parse_mode: 'HTML' })

      let action: 'take' | 'snz' | 'skip' = 'take'
      let evId: string
      let mins = 60
      if (data.startsWith('rem_skip_')) { action = 'skip'; evId = data.replace('rem_skip_', '') }
      else if (data.startsWith('rem_snz_')) {
        action = 'snz'
        const rest = data.replace('rem_snz_', '')
        const idx = rest.lastIndexOf('_')
        evId = rest.slice(0, idx)
        mins = parseInt(rest.slice(idx + 1), 10) || 60
      } else { evId = data.replace('rem_take_', '') }

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
        await supabase.from('supplement_logs').upsert(
          { user_id: userId, supplement_id: ev.supplement_id, date: today, taken: true },
          { onConflict: 'user_id,supplement_id,date' }
        )
        await supabase.from('reminder_events').update({ status: 'taken', responded_at: now }).eq('id', evId)
        await resolve(`✅ <b>${name}</b> — принято. Молодец!`)
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
    } else if (data.startsWith('nudge_acc:')) {
      // Коуч: пользователь берёт совет в работу → ставим follow-up через 5 дней
      const subtype = data.replace('nudge_acc:', '')
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
    } else if (data === 'nudge_no') {
      await tgSend(chatId, 'Окей, без давления 🙂')
    } else if (data === 'fb_matches') {
      await handleFootballMatches(chatId, supabase)
    } else if (data === 'fb_on') {
      await setFootballReminders(chatId, userId, true, supabase)
    } else if (data === 'fb_off') {
      await setFootballReminders(chatId, userId, false, supabase)
    } else if (data.startsWith('fw:')) {
      const parsed = parseFootballCallback(data)
      const msgId = cq.message.message_id as number
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

    return new Response('ok')
  }

  // ── Handle regular messages ─────────────────────────────────────────────────
  const msg = body.message ?? body.edited_message
  if (!msg) return new Response('ok')

  const chatId = msg.chat.id
  let text = (msg.text ?? '').trim()
  const username = msg.from?.username ?? null

  // /start <token> — link account
  if (text.startsWith('/start')) {
    const token = text.split(' ')[1] ?? ''

    if (!token) {
      await tgSend(chatId,
        '👋 Привет! Чтобы подключить Telegram к Tonus, открой настройки в приложении и нажми «Подключить Telegram».'
      )
      return new Response('ok')
    }

    const { data: lt } = await supabase
      .from('telegram_link_tokens')
      .select('user_id, expires_at')
      .eq('token', token)
      .single()

    if (!lt || new Date(lt.expires_at) < new Date()) {
      await tgSend(chatId, '❌ Ссылка недействительна или устарела. Попробуй снова в настройках приложения.')
      return new Response('ok')
    }

    await supabase.from('telegram_links').upsert({
      user_id: lt.user_id,
      telegram_chat_id: String(chatId),
      telegram_username: username,
      status: 'active',
    }, { onConflict: 'user_id' })

    await supabase.from('telegram_link_tokens').delete().eq('token', token)

    await tgSend(chatId,
      '✅ Telegram успешно подключён к Tonus!\n\nВыбери что тебя интересует:',
      { reply_markup: MAIN_MENU }
    )
    return new Response('ok')
  }

  // Find user by telegram chat id
  const { data: link } = await supabase
    .from('telegram_links')
    .select('user_id, status, tg_session_id, awaiting_note_date')
    .eq('telegram_chat_id', String(chatId))
    .single()

  if (!link) {
    await tgSend(chatId, '❓ Аккаунт не найден. Подключи Telegram в настройках Tonus.')
    return new Response('ok')
  }

  const userId = link.user_id

  // Фото еды → оценка калорий
  if (Array.isArray(msg.photo) && msg.photo.length) {
    const budget = await checkBudget(supabase, userId)
    if (!budget.ok) { await tgSend(chatId, budgetExceededMessage(budget)); return new Response('ok') }
    const largest = msg.photo[msg.photo.length - 1] // самое большое разрешение
    const { data: noteSet } = await supabase.from('daily_note_settings').select('timezone').eq('user_id', userId).maybeSingle()
    const tz = noteSet?.timezone || 'Europe/Kyiv'
    await handleMealPhoto(chatId, userId, largest.file_id, msg.caption ?? '', tz, supabase)
    return new Response('ok')
  }

  // Голосовое / аудио → транскрипция → дальше обрабатывается как обычный текст
  const voice = msg.voice ?? msg.audio
  if (voice && !text) {
    const budget = await checkBudget(supabase, userId)
    if (!budget.ok) { await tgSend(chatId, budgetExceededMessage(budget)); return new Response('ok') }
    if (voice.duration && voice.duration > 120) {
      await tgSend(chatId, '🎤 Голосовое слишком длинное (>2 мин). Пришли покороче или напиши текстом.')
      return new Response('ok')
    }
    await tgTyping(chatId)
    const fileRes = await tgCall('getFile', { file_id: voice.file_id })
    const filePath = fileRes?.result?.file_path
    if (!filePath) { await tgSend(chatId, '🤔 Не удалось загрузить голосовое, попробуй ещё раз.'); return new Response('ok') }
    const dl = await fetchWithTimeout(tgFileUrl(filePath), { retryOn5xx: true, timeoutMs: 30_000 })
    const buf = new Uint8Array(await dl.arrayBuffer())
    let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
    const b64 = btoa(bin)
    let tr: Awaited<ReturnType<typeof transcribeVoice>>
    try {
      tr = await transcribeVoice(userId, supabase, b64, voice.mime_type || 'audio/ogg')
    } catch (e) {
      if (!isAiConsentRequired(e)) throw e
      await tgSend(chatId, AI_CONSENT_TELEGRAM_MESSAGE, { reply_markup: BACK_MENU })
      return new Response('ok')
    }
    if (tr?.tokens) await supabase.from('ai_usage').insert({ user_id: userId, source: 'voice-transcribe', tokens_used: tr.tokens })
    if (!tr || !tr.text) { await tgSend(chatId, '🤔 Не расслышал. Попробуй сказать ещё раз чуть чётче.'); return new Response('ok') }
    text = tr.text
    await tgSend(chatId, `🎤 Распознал: «${text}»`)
  }

  // /menu
  if (text === '/menu' || text === '/start') {
    await tgSend(chatId, '🏠 Главное меню', { reply_markup: MAIN_MENU })
    return new Response('ok')
  }

  // /report
  if (text === '/report') {
    await checkStaleness(chatId, userId, supabase)
    await tgSend(chatId, '⏳ Генерирую отчёт, подожди немного…')
    await handleReport(chatId, userId, supabase)
    return new Response('ok')
  }

  // /status
  if (text === '/status') {
    await checkStaleness(chatId, userId, supabase)
    await handleStatus(chatId, userId, supabase)
    return new Response('ok')
  }

  // /last
  if (text === '/last') {
    const { data: rep } = await supabase
      .from('scheduled_reports')
      .select('content, period_start, period_end')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!rep) {
      await tgSend(chatId, '📭 Отчётов пока нет. Используй /report чтобы сгенерировать первый.', { reply_markup: BACK_MENU })
    } else {
      await tgSend(chatId, `📊 Отчёт ${rep.period_start} — ${rep.period_end}\n\n${rep.content}`, { reply_markup: REPORT_ACTIONS })
    }
    return new Response('ok')
  }

  // /sync
  if (text === '/sync') {
    // Свежесть = самый недавний из ручного экспорта (imports) и автосинка
    // Apple Health (ingest_tokens.last_ingest_at) — иначе /sync показывает дату
    // ручного экспорта и зря зовёт «обновить», хотя автосинк свежий.
    const [{ data: lastImport }, { data: tok }] = await Promise.all([
      supabase.from('imports').select('imported_at')
        .eq('user_id', userId).order('imported_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('ingest_tokens').select('last_ingest_at').eq('user_id', userId).maybeSingle(),
    ])
    const ts = freshestDataTs(lastImport?.imported_at, tok?.last_ingest_at)

    if (ts == null) {
      await tgSend(chatId, '📭 Данные ещё не загружались.\n\nЧтобы загрузить:\n1. Открой Здоровье на iPhone\n2. Фото профиля → Экспорт данных\n3. Загрузи export.zip в Tonus', { reply_markup: BACK_MENU })
    } else {
      const d = new Date(ts)
      const days = Math.floor((Date.now() - ts) / 86400000)
      const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
      const freshness = days === 0 ? '✅ данные актуальны' : days < 7 ? `✅ ${days} дн. назад` : `⚠️ ${days} дн. назад — стоит обновить`
      await tgSend(chatId,
        `📲 Последняя синхронизация: ${dateStr}\n${freshness}\n\nОбновить вручную (если нужно):\n1. Здоровье → Фото профиля → Экспорт данных\n2. Загрузи export.zip в Tonus`,
        { reply_markup: BACK_MENU }
      )
    }
    return new Response('ok')
  }

  // /pause / /resume
  if (text === '/pause') {
    await supabase.from('report_settings').upsert({ user_id: userId, paused: true }, { onConflict: 'user_id' })
    await tgSend(chatId, '⏸ Автоотчёты приостановлены.', { reply_markup: BACK_MENU })
    return new Response('ok')
  }
  if (text === '/resume') {
    await supabase.from('report_settings').upsert({ user_id: userId, paused: false }, { onConflict: 'user_id' })
    await tgSend(chatId, '▶️ Автоотчёты возобновлены.', { reply_markup: BACK_MENU })
    return new Response('ok')
  }

  // /football, /matches, /football_on, /football_off
  if (text === '/football') {
    await handleFootballMenu(chatId, userId, supabase)
    return new Response('ok')
  }
  if (text === '/matches') {
    await handleFootballMatches(chatId, supabase)
    return new Response('ok')
  }
  if (text === '/football_on') {
    await setFootballReminders(chatId, userId, true, supabase)
    return new Response('ok')
  }
  if (text === '/football_off') {
    await setFootballReminders(chatId, userId, false, supabase)
    return new Response('ok')
  }

  // /tokens — Gemini token usage this month
  if (text === '/tokens') {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { data: rows } = await supabase
      .from('ai_usage')
      .select('source, tokens_used')
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString())

    if (!rows || rows.length === 0) {
      await tgSend(chatId, '📭 В этом месяце токены ещё не использовались.', { reply_markup: BACK_MENU })
      return new Response('ok')
    }

    const SOURCE_LABELS: Record<string, string> = {
      chat: '💬 Чат',
      analyze: '🔍 Анализ',
      'extract-lab': '🔬 OCR анализов',
      'biweekly-report': '📊 Отчёты',
    }
    const COST_PER_1M = 0.30

    const bySource: Record<string, number> = {}
    let total = 0
    for (const r of rows) {
      const t = r.tokens_used ?? 0
      bySource[r.source] = (bySource[r.source] ?? 0) + t
      total += t
    }
    const cost = (total / 1_000_000) * COST_PER_1M

    function bar(pct: number, width = 6): string {
      const filled = Math.round(pct / 100 * width)
      return '🟦'.repeat(filled) + '⬜'.repeat(width - filled)
    }

    const monthName = new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    const lines = Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .map(([src, t]) => {
        const pct = total > 0 ? (t / total) * 100 : 0
        return `${SOURCE_LABELS[src] ?? src}\n${bar(pct)} ${pct.toFixed(0)}% · ${t.toLocaleString('ru-RU')}`
      })
      .join('\n\n')

    await tgSend(chatId,
      `✨ *Gemini — ${monthName}*\n\n` +
      `${lines}\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `*Всего:* ${total.toLocaleString('ru-RU')} токенов · *$${cost.toFixed(3)}*`,
      { parse_mode: 'Markdown', reply_markup: BACK_MENU }
    )
    return new Response('ok')
  }

  // /usage — Claude usage stats
  if (text === '/usage') {
    // Read cached usage data written by local monitor
    const { data: usageRow, error: usageErr } = await supabase
      .from('claude_usage')
      .select('*')
      .eq('id', 1)
      .single()

    if (usageErr || !usageRow) {
      await tgSend(chatId, '❌ Нет данных. Убедись что monitor.py запущен локально.', { reply_markup: BACK_MENU })
      return new Response('ok')
    }

    function bar(pct: number, width = 10): string {
      const filled = Math.round(pct / 100 * width)
      return '█'.repeat(filled) + '░'.repeat(width - filled)
    }
    function fmtTime(iso: string): string {
      const secs = Math.floor((new Date(iso).getTime() - Date.now()) / 1000)
      if (secs <= 0) return 'истёк (вероятно сброшен)'
      const h = Math.floor(secs / 3600)
      const m = Math.floor((secs % 3600) / 60)
      return h > 0 ? `${h}ч ${String(m).padStart(2, '0')}м` : `${m}м`
    }

    const sPct: number = usageRow.session_pct ?? 0
    const wPct: number = usageRow.weekly_pct ?? 0
    const sLine = usageRow.session_resets_at
      ? `${bar(sPct)} ${sPct.toFixed(0)}% · сброс через *${fmtTime(usageRow.session_resets_at)}*`
      : `${bar(sPct)} ${sPct.toFixed(0)}%`
    const wLine = usageRow.weekly_resets_at
      ? `${bar(wPct)} ${wPct.toFixed(0)}% · сброс через *${fmtTime(usageRow.weekly_resets_at)}*`
      : `${bar(wPct)} ${wPct.toFixed(0)}%`

    const ageMin = Math.floor((Date.now() - new Date(usageRow.updated_at).getTime()) / 60000)
    const ageStr = ageMin === 0 ? 'только что' : ageMin < 60 ? `${ageMin} мин назад` : `${Math.floor(ageMin / 60)}ч ${ageMin % 60}м назад`
    // монитор обновляет раз в минуту; >15 мин = он не запущен и цифры могут быть неактуальны
    const stale = ageMin > 15
    const header = stale
      ? `⚠️ *Данные неактуальны* (обновлено ${ageStr}).\nЛокальный монитор не запущен — это последний снимок. Запусти monitor.py для свежих цифр.\n\n`
      : ''
    const footer = stale ? '' : `\n\n_обновлено ${ageStr}_`

    // Codex — пишется тем же локальным монитором в codex_usage (обновляется только
    // когда работаешь в Codex), поэтому показываем его свежесть отдельно.
    let codexBlock = ''
    const { data: cx } = await supabase.from('codex_usage').select('*').eq('id', 1).maybeSingle()
    if (cx) {
      const now = Date.now()
      const cAgeMin = Math.floor((now - new Date(cx.updated_at).getTime()) / 60000)
      const cAge = cAgeMin <= 0 ? 'только что' : cAgeMin < 60 ? `${cAgeMin} мин назад` : `${Math.floor(cAgeMin / 60)}ч ${cAgeMin % 60}м назад`
      const plan = cx.plan_type ? ` · ${cx.plan_type}` : ''
      // Codex пишет лимиты в транскрипт только при отправке запроса. Если снимок
      // несвежий (>30 мин) — конкретные % недостоверны (окна могли сброситься),
      // поэтому не показываем цифры, а просим сделать ход в Codex.
      if (cAgeMin > 30) {
        codexBlock =
          `\n\n🤖 *Лимиты Codex*${plan}\n\n` +
          `⚠️ Нет свежих данных (снимок ${cAge}).\n` +
          `Codex обновляет лимиты только при отправке запроса — сделай любой ход в Codex, и /usage покажет актуальные цифры.`
      } else {
        const winLine = (pct: number, iso: string | null): string => {
          if (iso && new Date(iso).getTime() <= now) return '♻️ окно сброшено — свободно'
          return iso
            ? `${bar(pct)} ${pct.toFixed(0)}% · сброс через *${fmtTime(iso)}*`
            : `${bar(pct)} ${pct.toFixed(0)}%`
        }
        codexBlock =
          `\n\n🤖 *Лимиты Codex*${plan}\n\n` +
          `*Сессия (5ч)*\n${winLine(cx.session_pct ?? 0, cx.session_resets_at)}\n\n` +
          `*Неделя*\n${winLine(cx.weekly_pct ?? 0, cx.weekly_resets_at)}\n\n` +
          `_данные Codex: ${cAge}_`
      }
    }

    await tgSend(chatId,
      header +
      `🤖 *Лимиты Claude*\n\n` +
      `*Сессия (5ч)*\n${sLine}\n\n` +
      `*Неделя*\n${wLine}` +
      footer +
      codexBlock,
      { parse_mode: 'Markdown', reply_markup: BACK_MENU }
    )
    return new Response('ok')
  }

  // Идеи: личный «ящик» заметок по проекту (не показывается на сайте)
  if (text === '/ideas') {
    const { data: ideas } = await supabase
      .from('ideas')
      .select('text, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (!ideas || ideas.length === 0) {
      await tgSend(chatId, '💡 Идей пока нет. Добавь: /idea твоя идея', { reply_markup: BACK_MENU })
      return new Response('ok')
    }
    const fmt = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    const lines = (ideas as { text: string; created_at: string }[]).map((it, i) => `${i + 1}. ${it.text}  (${fmt(it.created_at)})`)
    await tgSend(chatId, `💡 Твои идеи (${ideas.length}):\n\n${lines.join('\n')}`, { reply_markup: BACK_MENU })
    return new Response('ok')
  }
  if (text === '/idea' || text.startsWith('/idea ')) {
    const idea = text.slice('/idea'.length).trim()
    if (!idea) {
      await tgSend(chatId, '✍️ Напиши текст после команды, например:\n/idea добавить график веса')
      return new Response('ok')
    }
    const { error } = await supabase.from('ideas').insert({ user_id: userId, text: idea })
    await tgSend(chatId, error ? '❌ Не удалось сохранить, попробуй ещё раз.' : '💡 Записал. Все идеи — /ideas', { reply_markup: BACK_MENU })
    return new Response('ok')
  }

  // /widget — токен и URL данных для iPhone-виджета (Scriptable, F4 smart-tonus)
  if (text === '/widget') {
    const { data: existing } = await supabase
      .from('widget_tokens').select('token').eq('user_id', userId).maybeSingle()
    let wtoken = existing?.token as string | undefined
    if (!wtoken) {
      wtoken = crypto.randomUUID().replace(/-/g, '')
      const { error } = await supabase.from('widget_tokens').insert({ user_id: userId, token: wtoken })
      if (error) {
        await tgSend(chatId, '❌ Не удалось создать токен, попробуй ещё раз.', { reply_markup: BACK_MENU })
        return new Response('ok')
      }
    }
    const url = `${SUPABASE_URL}/functions/v1/widget-data?token=${wtoken}`
    await tgSend(chatId,
      `📱 <b>iPhone-виджет готовности</b>\n\nТвой URL данных (никому не показывай):\n<code>${url}</code>\n\n` +
      `Установка за 5 минут: приложение Scriptable из App Store + скрипт из гайда ` +
      `docs/guides/iphone-widget.md в репозитории. Вставь URL в первую строку скрипта.`,
      { reply_markup: BACK_MENU })
    return new Response('ok')
  }

  // Commands start with "/" but unknown → show menu
  if (text.startsWith('/')) {
    await tgSend(chatId, 'Выбери действие:', { reply_markup: MAIN_MENU })
    return new Response('ok')
  }

  // Естественный ввод идеи: «идея ...», «запиши идею ...», «добавь в идею ...»
  // (команда /idea обрабатывается выше; здесь — свободный текст, чтобы идея реально сохранялась,
  //  а не «терялась» в ИИ-чате, который раньше выдумывал подтверждение «📝 Записал»).
  // Без \b: в JS он только по ASCII и для кириллицы не работает — опираемся на [ияю] и якорь ^.
  const ideaMatch = text.match(/^\s*(?:(?:запиши|сохрани|добавь|добавить|как|в|новая|новую)\s+){0,3}иде[ияю]\s*[:;,.\-—]?\s*([\s\S]*)$/i)
  if (ideaMatch) {
    const ideaText = ideaMatch[1].trim()
    if (!ideaText) {
      await tgSend(chatId, '✍️ Что записать? Напиши: идея <текст>')
      return new Response('ok')
    }
    const { error } = await supabase.from('ideas').insert({ user_id: userId, text: ideaText })
    await tgSend(chatId, error ? '❌ Не удалось сохранить, попробуй ещё раз.' : '💡 Записал. Все идеи — /ideas', { reply_markup: BACK_MENU })
    return new Response('ok')
  }

  // Классифицируем КАЖДОЕ свободное сообщение единым роутером. Классификатор распознаёт
  // даже голые названия продуктов («груша», «творог»), которые прежний keyword-фильтр
  // пропускал — и они утекали в ИИ-чат, а flash выдумывал «📝 Записал», ничего не сохраняя
  // (промпт это запрещает, но модель правило игнорит — поэтому фикс структурный, не в промпте).
  // act != null → это лог (еда/приём/препарат); null → вопрос/чат.
  // Классификатор — это AI-вызов, поэтому за бюджетом: при превышении не классифицируем,
  // сообщение уйдёт в ИИ-чат, который сам покажет сообщение о лимите.
  // Таймзона нужна для срока годности заметки и для лога. Якорь «сейчас» — время отправки
  // сообщения (msg.date, сек UTC), чтобы относительное время («час назад») считалось от него.
  const { data: noteSet } = await supabase
    .from('daily_note_settings').select('timezone').eq('user_id', userId).maybeSingle()
  const tz = noteSet?.timezone || 'Europe/Kyiv'
  const now = msg.date ? new Date(msg.date * 1000) : new Date()

  // Явная просьба сохранить как идею/заметку (в т.ч. из голоса) — до классификатора и чата.
  const saveIntent = detectSaveIntent(text)
  if (saveIntent) {
    if (!saveIntent.content) {
      await tgSend(chatId, saveIntent.kind === 'idea'
        ? '💡 Что записать в идеи? Пришли текст идеи.'
        : '📝 Что записать в заметки? Пришли текст.')
      return new Response('ok')
    }
    if (saveIntent.kind === 'idea') {
      const { error } = await supabase.from('ideas').insert({ user_id: userId, text: saveIntent.content })
      await tgSend(chatId, error ? '❌ Не удалось сохранить, попробуй ещё раз.' : '💡 Записал в идеи. Все идеи — /ideas', { reply_markup: BACK_MENU })
    } else {
      const date = localDate(tz)
      const { data: existing } = await supabase
        .from('context_notes').select('note').eq('user_id', userId).eq('date', date).maybeSingle()
      const merged = existing?.note ? `${existing.note}\n${saveIntent.content}` : saveIntent.content
      const { error } = await supabase.from('context_notes').upsert(
        { user_id: userId, date, note: merged, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date' }
      )
      await tgSend(chatId, error ? '❌ Не удалось сохранить, попробуй ещё раз.' : '📝 Записал в заметки.', { reply_markup: BACK_MENU })
    }
    return new Response('ok')
  }

  // telegram_links is writable by its owner, while this function uses a
  // service-role client. Repair foreign/stale session state before the first
  // classifier, health-data, or Gemini path and persist only an owned ID.
  const { id: ownedChatSessionId } = await resolveOrCreateOwnedChatSession(
    supabase as unknown as SessionOwnershipClient,
    link.tg_session_id ?? null,
    userId,
  )
  if (ownedChatSessionId !== link.tg_session_id) {
    await supabase.from('telegram_links')
      .update({ tg_session_id: ownedChatSessionId })
      .eq('telegram_chat_id', String(chatId))
      .eq('user_id', userId)
  }
  if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
    await tgSend(chatId, 'Сообщение слишком длинное. Сократи его и попробуй снова.')
    return new Response('ok')
  }

  const budget = await checkBudget(supabase, userId)
  let act: ClassifiedAction | null = null
  if (budget.ok) {
    const { data: supList } = await supabase
      .from('supplements').select('name').eq('user_id', userId).eq('active', true)
    const supNames = ((supList ?? []) as { name: string }[]).map(s => s.name)
    try {
      act = await classifyLog(userId, supabase, text, supNames, now, tz)
    } catch (e) {
      if (!isAiConsentRequired(e)) throw e
      await tgSend(chatId, AI_CONSENT_TELEGRAM_MESSAGE, { reply_markup: BACK_MENU })
      return new Response('ok')
    }
  }

  // Ответ на вечерний вопрос → заметка дня (N2 + N4, SPEC-DAILY-NOTE)
  // Фикс: (1) флаг протухает к следующим суткам; (2) лог еды/приёма НЕ съедается как заметка.
  if (link.awaiting_note_date) {
    const noteDate = link.awaiting_note_date
    const stale = noteDate < localDate(tz)
    if (stale || act) {
      // протухший вопрос ИЛИ это лог → не заметка: сбрасываем флаг, обрабатываем как обычно
      await supabase.from('telegram_links')
        .update({ awaiting_note_date: null })
        .eq('telegram_chat_id', String(chatId))
    } else {
      // обычный ответ → заметка дня (дополняем существующую, не затираем)
      const { data: existing } = await supabase
        .from('context_notes')
        .select('note')
        .eq('user_id', userId)
        .eq('date', noteDate)
        .maybeSingle()
      const merged = existing?.note ? `${existing.note}\n${text}` : text
      await supabase.from('context_notes').upsert(
        { user_id: userId, date: noteDate, note: merged, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date' }
      )
      await supabase.from('telegram_links')
        .update({ awaiting_note_date: null })
        .eq('telegram_chat_id', String(chatId))
      await tgSend(chatId, '📝 Записал в заметку дня. Спасибо!\n\nТеперь можешь задать любой вопрос — отвечу по твоим данным.')
      return new Response('ok')
    }
  }

  // Лог еды/приёма/препарата (распознан классификатором): "груша", "съел макдак",
  // "принял финастерид 1мг", "пил кофе в 14:00"
  if (act) {
    const confirm = await execLog(chatId, userId, act, tz, supabase, now)
    if (confirm) {
      await tgSend(chatId, confirm, { parse_mode: 'HTML', reply_markup: BACK_MENU })
      return new Response('ok')
    }
  }

  // Any other text → AI chat (B3)
  const newSid = await handleAiChat(chatId, userId, text, ownedChatSessionId, supabase)
  if (newSid && newSid !== ownedChatSessionId) {
    await supabase.from('telegram_links')
      .update({ tg_session_id: newSid })
      .eq('telegram_chat_id', String(chatId))
      .eq('user_id', userId)
  }
  return new Response('ok')
}

serve(withObservability('edge.telegram_bot', handler))
