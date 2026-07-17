// Telegram Bot API helpers (moved verbatim from index.ts in the B3 split).

import { fetchWithTimeout } from '../_shared/http.ts'

const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!

export const MAX_CHAT_MESSAGE_LENGTH = 4096

export async function tgCall(method: string, body: Record<string, unknown>) {
  const res = await fetchWithTimeout(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function tgSend(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  return tgCall('sendMessage', { chat_id: chatId, text, ...extra })
}

// Конвертирует markdown ответа ИИ (Gemini пишет **жирным**, * списками) в Telegram-HTML.
// Только парные **…** / __…__ → <b> (нет незакрытых тегов → нет ошибок 400 от Telegram).
export function mdToTgHtml(s: string): string {
  let t = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')   // экранируем спецсимволы
  t = t.replace(/^[ \t]*[*-] +/gm, '• ')                                          // пункты "* " / "- " → "• "
  t = t.replace(/^#{1,6}[ \t]+(.+)$/gm, '<b>$1</b>')                              // заголовки # → жирная строка
  t = t.replace(/\*\*([^\n]+?)\*\*/g, '<b>$1</b>').replace(/__([^\n]+?)__/g, '<b>$1</b>') // жирный (парный)
  t = t.replace(/`([^`\n]+?)`/g, '<code>$1</code>')                              // инлайн-код
  return t
}

export async function tgEdit(chatId: number | string, messageId: number, text: string, extra: Record<string, unknown> = {}) {
  return tgCall('editMessageText', { chat_id: chatId, message_id: messageId, text, ...extra })
}

export async function tgAnswerCallback(callbackQueryId: string, text?: string) {
  return tgCall('answerCallbackQuery', { callback_query_id: callbackQueryId, text })
}

export async function tgTyping(chatId: number | string) {
  return tgCall('sendChatAction', { chat_id: chatId, action: 'typing' })
}

/** Download URL for a file returned by getFile. */
export function tgFileUrl(filePath: string): string {
  return `https://api.telegram.org/file/bot${TG_TOKEN}/${filePath}`
}

// ── Setup bot commands (called once on startup) ───────────────────────────────

export async function setupCommands() {
  await tgCall('setMyCommands', {
    commands: [
      { command: 'menu', description: '🏠 Главное меню' },
      { command: 'report', description: '📊 Двухнедельный отчёт' },
      { command: 'status', description: '📈 Статус за сегодня' },
      { command: 'sync', description: '📲 Дата последней синхронизации' },
      { command: 'pause', description: '⏸ Приостановить отчёты' },
      { command: 'resume', description: '▶️ Возобновить отчёты' },
      { command: 'usage', description: '🤖 Лимиты Claude + Codex' },
      { command: 'tokens', description: '✨ Токены Gemini' },
      { command: 'idea', description: '💡 Записать идею' },
      { command: 'ideas', description: '💡 Список идей' },
      { command: 'football', description: '⚽ Напоминания о матчах ЧМ-2026' },
      { command: 'matches', description: '📅 Ближайшие матчи' },
    ],
  })
}
