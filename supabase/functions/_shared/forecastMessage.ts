// Текст блока прогноза для вечернего сообщения Telegram (SPEC-READINESS-FORECAST §3.2).
// Русский — язык бота. Чистый модуль, тестируется vitest (forecastMessage.test.ts).
import type { Forecast, FactorId } from './forecast.ts'

const LABELS: Record<FactorId, string> = {
  sleep_debt: 'недосып несколько ночей подряд',
  alcohol: 'алкоголь сегодня',
  late_coffee: 'кофе после 18:00',
  heavy_day: 'большая нагрузка при невысокой готовности',
  storm: 'магнитная буря',
  uptrend: 'восходящий тренд',
}

const ADVICE: Record<FactorId, string> = {
  sleep_debt: 'ляг сегодня пораньше — до 23:00.',
  alcohol: 'больше воды и ранний отбой.',
  late_coffee: 'завтра последний кофе — до обеда.',
  heavy_day: 'завтра лучше лёгкая зона, без интервалов.',
  storm: 'не планируй завтра рекордов — день может быть тяжелее обычного.',
  uptrend: '',
}

const fmtDelta = (d: number) => (d > 0 ? `+${d}` : `−${Math.abs(d)}`)

// refScore — с чем сравнивать (readiness сегодня): ±3 — «на уровне».
export function forecastBlock(f: Forecast, refScore: number | null): string {
  const rel = refScore == null ? ''
    : f.score < refScore - 3 ? ' (ниже обычного)'
    : f.score > refScore + 3 ? ' (выше обычного)'
    : ' (на уровне обычного)'
  const lines = [`🔮 Завтра: восстановление ~${f.score}${rel}`]
  for (const fac of f.factors) lines.push(`• ${LABELS[fac.id]} (${fmtDelta(fac.delta)})`)
  if (f.adviceId && ADVICE[f.adviceId]) lines.push(`Совет: ${ADVICE[f.adviceId]}`)
  return lines.join('\n')
}
