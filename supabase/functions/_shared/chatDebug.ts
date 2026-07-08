// Хелперы debug-режима чата (временный диагностический режим за флагом
// CHAT_DEBUG_REASON). Чистые функции — тестируются без сети/БД.

export interface DebugReply {
  answer: string
  reason: string
}

// Разбирает итоговый JSON-ответ модели {answer, reason}. При любом сбое —
// безопасный фолбэк: сырой текст как answer, пустой reason (чат не падает).
export function parseDebugReply(raw: string): DebugReply {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const obj = JSON.parse(stripped)
    if (obj && typeof obj.answer === 'string') {
      return { answer: obj.answer, reason: typeof obj.reason === 'string' ? obj.reason : '' }
    }
  } catch { /* не JSON — фолбэк ниже */ }
  return { answer: raw, reason: '' }
}

// Компактная строка на каждый фактический вызов инструмента для показа в скобках.
export function formatToolTrace(
  toolCalls: { name: string; args: Record<string, unknown> }[],
): string[] {
  return toolCalls.map(({ name, args }) => {
    if (name === 'get_metrics_range' || name === 'get_sleep_range') {
      return `${name}(${args.start_date ?? '?'}..${args.end_date ?? '?'})`
    }
    if (name === 'get_lab_history') return `${name}(${args.marker ?? '?'})`
    if (name === 'get_correlations') return `${name}(${args.outcome ?? 'all'})`
    return `${name}(${JSON.stringify(args)})`
  })
}
