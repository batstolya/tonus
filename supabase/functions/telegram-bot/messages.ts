// Regular-message handling: account linking, photo/voice pre-routing, text
// commands (dispatched via routeText) and the free-text pipeline (save intent,
// classifier log, daily note, AI chat). Bodies are moved verbatim from
// index.ts (B3 split).

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchWithTimeout } from '../_shared/http.ts'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'
import { localDate } from '../_shared/time.ts'
import { freshestDataTs } from '../_shared/staleness.ts'
import { detectSaveIntent } from '../_shared/saveIntent.ts'
import {
  resolveOrCreateOwnedChatSession,
  type SessionOwnershipClient,
} from '../_shared/chatSessionOwnership.ts'
import { isAiConsentRequired } from '../_shared/aiConsent.ts'
import { tgCall, tgSend, tgTyping, tgFileUrl, MAX_CHAT_MESSAGE_LENGTH } from './tg.ts'
import { MAIN_MENU, REPORT_ACTIONS, BACK_MENU } from './menus.ts'
import { routeText } from './router.ts'
import {
  AI_CONSENT_TELEGRAM_MESSAGE, handleMealPhoto, transcribeVoice, classifyLog, execLog, handleAiChat,
  type ClassifiedAction,
} from './ai.ts'
import {
  handleReport, handleStatus, handleFootballMenu, handleFootballMatches,
  setFootballReminders, checkStaleness, handleHabits,
} from './commands.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

interface TelegramMessage {
  chat: { id: number }
  text?: string
  caption?: string
  date?: number
  from?: { username?: string | null }
  photo?: { file_id: string }[]
  voice?: { file_id: string; duration?: number; mime_type?: string }
  audio?: { file_id: string; duration?: number; mime_type?: string }
}

export async function handleMessage(msg: TelegramMessage, supabase: SupabaseClient): Promise<void> {
  const chatId = msg.chat.id
  let text = (msg.text ?? '').trim()
  const username = msg.from?.username ?? null

  // /start <token> — link account
  if (routeText(text).kind === 'start') {
    const token = text.split(' ')[1] ?? ''

    if (!token) {
      await tgSend(chatId,
        '👋 Привет! Чтобы подключить Telegram к Tonus, открой настройки в приложении и нажми «Подключить Telegram».'
      )
      return
    }

    const { data: lt } = await supabase
      .from('telegram_link_tokens')
      .select('user_id, expires_at')
      .eq('token', token)
      .single()

    if (!lt || new Date(lt.expires_at) < new Date()) {
      await tgSend(chatId, '❌ Ссылка недействительна или устарела. Попробуй снова в настройках приложения.')
      return
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
    return
  }

  // Find user by telegram chat id
  const { data: link } = await supabase
    .from('telegram_links')
    .select('user_id, status, tg_session_id, awaiting_note_date')
    .eq('telegram_chat_id', String(chatId))
    .single()

  if (!link) {
    await tgSend(chatId, '❓ Аккаунт не найден. Подключи Telegram в настройках Tonus.')
    return
  }

  const userId = link.user_id

  // Фото еды → оценка калорий
  if (Array.isArray(msg.photo) && msg.photo.length) {
    const budget = await checkBudget(supabase, userId)
    if (!budget.ok) { await tgSend(chatId, budgetExceededMessage(budget)); return }
    const largest = msg.photo[msg.photo.length - 1] // самое большое разрешение
    const { data: noteSet } = await supabase.from('daily_note_settings').select('timezone').eq('user_id', userId).maybeSingle()
    const tz = noteSet?.timezone || 'Europe/Kyiv'
    await handleMealPhoto(chatId, userId, largest.file_id, msg.caption ?? '', tz, supabase)
    return
  }

  // Голосовое / аудио → транскрипция → дальше обрабатывается как обычный текст
  const voice = msg.voice ?? msg.audio
  if (voice && !text) {
    const budget = await checkBudget(supabase, userId)
    if (!budget.ok) { await tgSend(chatId, budgetExceededMessage(budget)); return }
    if (voice.duration && voice.duration > 120) {
      await tgSend(chatId, '🎤 Голосовое слишком длинное (>2 мин). Пришли покороче или напиши текстом.')
      return
    }
    await tgTyping(chatId)
    const fileRes = await tgCall('getFile', { file_id: voice.file_id })
    const filePath = fileRes?.result?.file_path
    if (!filePath) { await tgSend(chatId, '🤔 Не удалось загрузить голосовое, попробуй ещё раз.'); return }
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
      return
    }
    if (tr?.tokens) await supabase.from('ai_usage').insert({ user_id: userId, source: 'voice-transcribe', tokens_used: tr.tokens })
    if (!tr || !tr.text) { await tgSend(chatId, '🤔 Не расслышал. Попробуй сказать ещё раз чуть чётче.'); return }
    text = tr.text
    await tgSend(chatId, `🎤 Распознал: «${text}»`)
  }

  // Historical quirk kept as-is: a literal '/menu' or '/start' at this point
  // (e.g. out of a voice transcription) opens the main menu.
  if (text === '/menu' || text === '/start') {
    await tgSend(chatId, '🏠 Главное меню', { reply_markup: MAIN_MENU })
    return
  }

  // Text commands via the pure router (route recomputed after voice transcription).
  const route = routeText(text)

  if (route.kind === 'report') {
    await checkStaleness(chatId, userId, supabase)
    await tgSend(chatId, '⏳ Генерирую отчёт, подожди немного…')
    await handleReport(chatId, userId, supabase)
    return
  }

  if (route.kind === 'status') {
    await checkStaleness(chatId, userId, supabase)
    await handleStatus(chatId, userId, supabase)
    return
  }

  if (route.kind === 'last') {
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
    return
  }

  if (route.kind === 'sync') {
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
    return
  }

  if (route.kind === 'pause') {
    await supabase.from('report_settings').upsert({ user_id: userId, paused: true }, { onConflict: 'user_id' })
    await tgSend(chatId, '⏸ Автоотчёты приостановлены.', { reply_markup: BACK_MENU })
    return
  }
  if (route.kind === 'resume') {
    await supabase.from('report_settings').upsert({ user_id: userId, paused: false }, { onConflict: 'user_id' })
    await tgSend(chatId, '▶️ Автоотчёты возобновлены.', { reply_markup: BACK_MENU })
    return
  }

  if (route.kind === 'football') {
    await handleFootballMenu(chatId, userId, supabase)
    return
  }
  if (route.kind === 'matches') {
    await handleFootballMatches(chatId, supabase)
    return
  }
  if (route.kind === 'football_on') {
    await setFootballReminders(chatId, userId, true, supabase)
    return
  }
  if (route.kind === 'football_off') {
    await setFootballReminders(chatId, userId, false, supabase)
    return
  }

  if (route.kind === 'habits') {
    await handleHabits(chatId, userId, supabase)
    return
  }

  // /tokens — Gemini token usage this month
  if (route.kind === 'tokens') {
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
      return
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
    return
  }

  // /usage — Claude usage stats
  if (route.kind === 'usage') {
    // Read cached usage data written by local monitor
    const { data: usageRow, error: usageErr } = await supabase
      .from('claude_usage')
      .select('*')
      .eq('id', 1)
      .single()

    if (usageErr || !usageRow) {
      await tgSend(chatId, '❌ Нет данных. Убедись что monitor.py запущен локально.', { reply_markup: BACK_MENU })
      return
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
    return
  }

  // Идеи: личный «ящик» заметок по проекту (не показывается на сайте)
  if (route.kind === 'ideas') {
    const { data: ideas } = await supabase
      .from('ideas')
      .select('text, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (!ideas || ideas.length === 0) {
      await tgSend(chatId, '💡 Идей пока нет. Добавь: /idea твоя идея', { reply_markup: BACK_MENU })
      return
    }
    const fmt = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    const lines = (ideas as { text: string; created_at: string }[]).map((it, i) => `${i + 1}. ${it.text}  (${fmt(it.created_at)})`)
    await tgSend(chatId, `💡 Твои идеи (${ideas.length}):\n\n${lines.join('\n')}`, { reply_markup: BACK_MENU })
    return
  }
  if (route.kind === 'idea') {
    const idea = route.idea
    if (!idea) {
      await tgSend(chatId, '✍️ Напиши текст после команды, например:\n/idea добавить график веса')
      return
    }
    const { error } = await supabase.from('ideas').insert({ user_id: userId, text: idea })
    await tgSend(chatId, error ? '❌ Не удалось сохранить, попробуй ещё раз.' : '💡 Записал. Все идеи — /ideas', { reply_markup: BACK_MENU })
    return
  }

  // /widget — токен и URL данных для iPhone-виджета (Scriptable, F4 smart-tonus)
  if (route.kind === 'widget') {
    const { data: existing } = await supabase
      .from('widget_tokens').select('token').eq('user_id', userId).maybeSingle()
    let wtoken = existing?.token as string | undefined
    if (!wtoken) {
      wtoken = crypto.randomUUID().replace(/-/g, '')
      const { error } = await supabase.from('widget_tokens').insert({ user_id: userId, token: wtoken })
      if (error) {
        await tgSend(chatId, '❌ Не удалось создать токен, попробуй ещё раз.', { reply_markup: BACK_MENU })
        return
      }
    }
    const url = `${SUPABASE_URL}/functions/v1/widget-data?token=${wtoken}`
    await tgSend(chatId,
      `📱 <b>iPhone-виджет готовности</b>\n\nТвой URL данных (никому не показывай):\n<code>${url}</code>\n\n` +
      `Установка за 5 минут: приложение Scriptable из App Store + скрипт из гайда ` +
      `docs/guides/iphone-widget.md в репозитории. Вставь URL в первую строку скрипта.`,
      { reply_markup: BACK_MENU })
    return
  }

  // Commands start with "/" but unknown → show menu
  if (route.kind === 'unknown_command' || route.kind === 'start') {
    await tgSend(chatId, 'Выбери действие:', { reply_markup: MAIN_MENU })
    return
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
      return
    }
    const { error } = await supabase.from('ideas').insert({ user_id: userId, text: ideaText })
    await tgSend(chatId, error ? '❌ Не удалось сохранить, попробуй ещё раз.' : '💡 Записал. Все идеи — /ideas', { reply_markup: BACK_MENU })
    return
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
      return
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
    return
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
    return
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
      return
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
      return
    }
  }

  // Лог еды/приёма/препарата (распознан классификатором): "груша", "съел макдак",
  // "принял финастерид 1мг", "пил кофе в 14:00"
  if (act) {
    const confirm = await execLog(chatId, userId, act, tz, supabase, now)
    if (confirm) {
      await tgSend(chatId, confirm, { parse_mode: 'HTML', reply_markup: BACK_MENU })
      return
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
}
