// Сверка двух источников автосинка: мобильное приложение против Health Auto
// Export. Оба payload'а лежат в ingest_raw и разбираются ОДНИМ парсером
// (_shared/hae.ts), так что расхождение здесь — это расхождение данных, а не
// двух реализаций разбора.
//
// Зачем вообще: shadow-режим для параллельного прогона не годится —
// ingest_tokens.user_id первичный ключ, то есть у юзера один токен и один
// режим. Поэтому оба отправителя пишут в live, а доверие набирается сверкой
// архива (спека фазы 3, решение 1).
import type { MetricRow } from './hae.ts'

export type DiffKind = 'value' | 'missing-left' | 'missing-right'

export interface MetricDiff {
  date: string
  metric: string
  kind: DiffKind
  left: number | null
  right: number | null
}

export interface DiffOptions {
  /** Доля, в пределах которой расхождение считается округлением (0.01 = 1%). */
  relativeTolerance: number
}

// У строки заполнено ровно одно из полей: sum_val для сумм, avg_val для средних.
function valueOf(row: MetricRow): number | null {
  return row.sum_val ?? row.avg_val ?? null
}

const keyOf = (row: MetricRow) => `${row.date}|${row.metric}`

export function diffParsedMetrics(
  left: MetricRow[],
  right: MetricRow[],
  { relativeTolerance }: DiffOptions,
): MetricDiff[] {
  const pairs = new Map<string, { left?: MetricRow; right?: MetricRow }>()
  for (const row of left) {
    const key = keyOf(row)
    pairs.set(key, { ...pairs.get(key), left: row })
  }
  for (const row of right) {
    const key = keyOf(row)
    pairs.set(key, { ...pairs.get(key), right: row })
  }

  const out: MetricDiff[] = []
  // Сортировка по ключу даёт отчёт по дням в хронологическом порядке.
  for (const key of [...pairs.keys()].sort()) {
    const pair = pairs.get(key)!
    const [date, metric] = key.split('|')
    const l = pair.left ? valueOf(pair.left) : null
    const r = pair.right ? valueOf(pair.right) : null

    if (!pair.right) { out.push({ date, metric, kind: 'missing-right', left: l, right: null }); continue }
    if (!pair.left) { out.push({ date, metric, kind: 'missing-left', left: null, right: r }); continue }
    if (l == null || r == null) continue
    if (l === r) continue

    // Ноль на одной стороне — это не округление, а пропущенные данные, поэтому
    // относительный допуск к нему неприменим.
    const withinTolerance = l !== 0 && r !== 0
      && Math.abs(l - r) / Math.max(Math.abs(l), Math.abs(r)) <= relativeTolerance
    if (!withinTolerance) out.push({ date, metric, kind: 'value', left: l, right: r })
  }
  return out
}
