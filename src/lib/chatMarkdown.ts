// Лёгкий парсер markdown-подмножества, которое выдаёт Gemini в ответах чата:
// **жирный**, списки с «* »/«- », абзацы по переносам строк. Без внешних
// зависимостей и без dangerouslySetInnerHTML — возвращает данные, которые
// ChatWidget рендерит в JSX (безопасно от XSS: текст модели не исполняется).

export interface InlineSpan {
  text: string
  bold: boolean
}

export type MdBlock =
  | { type: 'paragraph'; spans: InlineSpan[] }
  | { type: 'list'; items: InlineSpan[][] }

// Разбивает строку на чередующиеся обычные/жирные фрагменты по **...**.
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index), bold: false })
    spans.push({ text: m[1], bold: true })
    last = m.index + m[0].length
  }
  if (last < text.length) spans.push({ text: text.slice(last), bold: false })
  // текст без разметки → один обычный span (в т.ч. пустой не добавляем)
  return spans.length ? spans : (text ? [{ text, bold: false }] : [])
}

const BULLET = /^\s*[*-]\s+(.*)$/

export function parseChatMarkdown(content: string): MdBlock[] {
  const blocks: MdBlock[] = []
  let list: InlineSpan[][] | null = null

  const flushList = () => {
    if (list) { blocks.push({ type: 'list', items: list }); list = null }
  }

  for (const rawLine of (content ?? '').split('\n')) {
    const line = rawLine.trimEnd()
    const bullet = line.match(BULLET)
    if (bullet) {
      (list ??= []).push(parseInline(bullet[1]))
      continue
    }
    flushList()
    if (line.trim() === '') continue // пустая строка — разделитель абзацев
    blocks.push({ type: 'paragraph', spans: parseInline(line) })
  }
  flushList()
  return blocks
}
