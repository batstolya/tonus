import type { DailyMetrics } from '../types'
import { computeStreak, isActiveDay, hasDayData } from './streak'
import { computeGaps, type GapInfo } from './dataCompleteness'

// Порог «данные протухли»: последний день с метриками старше этого — сигнал.
export const STALE_AFTER_DAYS = 2

// Клиентские (derived) уведомления колокольчика: вычисляются из daily на лету,
// нигде не персистятся — исчезают сами, когда условие снято. Тексты собирает
// компонент (t() живёт в React), lib отдаёт только факты.
export type BellItem =
  | { kind: 'streak-risk'; id: string; streak: number; steps: number; exercise: number; freezes: number }
  | { kind: 'stale-sync'; id: string; days: number }
  | { kind: 'data-gaps'; id: string; gaps: GapInfo[] }

// Same window and threshold the topbar badge used, so nothing about what
// counts as a gap changed when it moved here.
const GAP_WINDOW_DAYS = 14
const GAP_MIN_DAYS = 3

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function buildBellItems(daily: DailyMetrics[], today: Date = new Date()): BellItem[] {
  const items: BellItem[] = []
  const todayStr = ymd(today)

  // Стрик под угрозой: есть что терять и сегодняшний порог ещё не закрыт.
  const streak = computeStreak(daily, today)
  const todayEntry = daily.find(d => d.date === todayStr)
  const todayActive = todayEntry ? isActiveDay(todayEntry) : false
  if (streak.current > 0 && !todayActive) {
    items.push({
      kind: 'streak-risk',
      id: `streak-risk:${todayStr}`,
      streak: streak.current,
      steps: todayEntry?.steps ?? 0,
      exercise: todayEntry?.exerciseMinutes ?? 0,
      freezes: streak.freezesAvailable,
    })
  }

  // Данные протухли: последний день с метриками — STALE_AFTER_DAYS и старше.
  const lastData = daily.filter(hasDayData).map(d => d.date).sort().at(-1)
  if (lastData) {
    const diffDays = Math.floor(
      (new Date(todayStr + 'T12:00:00').getTime() - new Date(lastData + 'T12:00:00').getTime()) / 86400000,
    )
    if (diffDays >= STALE_AFTER_DAYS) {
      items.push({ kind: 'stale-sync', id: `stale-sync:${todayStr}`, days: diffDays })
    }
  }

  // Metrics the watch stopped reporting. This used to be its own topbar icon
  // with a popover of its own; it is the same kind of derived advisory as the
  // two above, so it lives with them and inherits their dismissal.
  const gaps = computeGaps(daily, GAP_WINDOW_DAYS, today).filter(g => g.missingDays >= GAP_MIN_DAYS)
  if (gaps.length) items.push({ kind: 'data-gaps', id: `data-gaps:${todayStr}`, gaps })

  return items
}

// Алерты стража приходят HTML-строкой вида '🔴 <b>Заголовок</b>\n\nтело…'.
// Раскладываем на заголовок и тело для карточки колокольчика; теги и
// статусные эмодзи убираем (уровень показывает подложка иконки).
export function parseAlertMessage(message: string): { title: string; body: string } {
  const bold = message.match(/<b>([^<]+)<\/b>/)
  // Теги вырезаем до неподвижной точки: один проход обходится вложенной
  // конструкцией вида '<scr<script>ipt>' (CodeQL js/incomplete-multi-character-sanitization).
  let untagged = message
  for (let prev = ''; prev !== untagged; ) {
    prev = untagged
    untagged = untagged.replace(/<[^>]*>/g, '')
  }
  const stripped = untagged.replace(/[🔴🟡]/gu, '').trim()
  if (bold) {
    const title = bold[1].trim()
    const body = stripped.startsWith(title) ? stripped.slice(title.length) : stripped.replace(title, '')
    return { title, body: body.replace(/\n{3,}/g, '\n\n').trim() }
  }
  const nl = stripped.indexOf('\n')
  if (nl === -1) return { title: stripped, body: '' }
  return { title: stripped.slice(0, nl).trim(), body: stripped.slice(nl + 1).trim() }
}

// Тело алерта стража: факты (строки метрик) видны всегда, совет с дисклеймером
// прячется за разворот — карточки в колокольчике становятся компактнее.
export function splitAlertBody(body: string): { facts: string; advice: string } {
  const marker = body.indexOf('Совет:')
  if (marker === -1) return { facts: body.trim(), advice: '' }
  return { facts: body.slice(0, marker).trim(), advice: body.slice(marker).trim() }
}

// Строка метрики из buildAlertMessage (_shared/anomaly.ts, язык бота — ru):
// '↑ Пульс покоя: 64 уд/мин при твоей норме 55 уд/мин (2.3σ)'.
const FACT_RE = /^([↑↓]) (.+?): (.+?) при твоей норме (.+?) \((.+?)σ\)$/

// Значения приходят с русскими единицами внутри ('64 уд/мин', '21.5/мин').
const UNIT_KEYS = ['уд/мин', 'мс', '/мин']

// Серверные алерты лежат в БД русским текстом (язык бота). Формат наш и
// стабильный, поэтому uk/en делаем на клиенте построчно: известные строки —
// через словарь, строки метрик — по шаблону, незнакомое проходит как есть.
export function localizeAlertText(
  text: string,
  t: (ru: string, vars?: Record<string, string | number>) => string,
): string {
  return text.split('\n').map(line => {
    const m = line.trim().match(FACT_RE)
    if (!m) return line.trim() ? t(line.trim()) : line
    const [, arrow, name, value, baseline, z] = m
    const local = (v: string) => UNIT_KEYS.reduce((s, u) => s.replace(u, t(u)), v)
    return t('{arrow} {name}: {value} при твоей норме {baseline} ({z}σ)', {
      arrow, name: t(name), value: local(value), baseline: local(baseline), z,
    })
  }).join('\n')
}

// Строки алерта, которые обязаны быть ключами словаря (заголовок, совет,
// дисклеймер). Строки метрик собираются по шаблону и сюда не входят.
// Используется тестом demoI18n: фикстурный алерт без перевода валит тест.
export function alertTranslatableLines(message: string): string[] {
  const { title, body } = parseAlertMessage(message)
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean)
  return [title, ...lines.filter(l => !FACT_RE.test(l))]
}
