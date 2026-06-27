// Свежесть данных = самый недавний из сигналов обновления: ручной экспорт
// (imports.imported_at) и автосинк Apple Health (ingest_tokens.last_ingest_at).
// Баннер «данные не обновлялись» должен молчать, пока жив любой из путей.
// Чистая функция (без Deno-глобалов) → тестируется vitest.

// Самый свежий из переданных ISO-таймстемпов (в ms), либо null если все пустые.
export function freshestDataTs(
  ...timestamps: (string | null | undefined)[]
): number | null {
  const ms = timestamps
    .map(t => (t ? Date.parse(t) : NaN))
    .filter(t => Number.isFinite(t))
  return ms.length ? Math.max(...ms) : null
}

// now — момент отсчёта в ms (Date.now()). Остальное — ISO-таймстемпы или пусто.
// Возвращает целое число полных суток с самого свежего сигнала, либо null,
// если ни одного сигнала нет (тогда баннер показывать не на чем).
export function daysSinceFreshData(
  now: number,
  ...timestamps: (string | null | undefined)[]
): number | null {
  const ts = freshestDataTs(...timestamps)
  return ts == null ? null : Math.floor((now - ts) / 86400000)
}
