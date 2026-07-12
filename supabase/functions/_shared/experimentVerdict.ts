// Текст вердикта завершённого эксперимента для Telegram (SPEC-EXPERIMENT-LOOP §2.2).
// Русский — язык бота. Чистый модуль, тестируется vitest (experimentVerdict.test.ts).
import { effectLabel, metricLabel, type ExperimentResult } from './experiments.ts'

export function verdictMessage(hypothesis: string, targetMetric: string, r: ExperimentResult): string {
  const head = `🧪 Эксперимент завершён: «${hypothesis}»\n\nМетрика: ${metricLabel(targetMetric)}`
  if (r.insufficient || r.delta == null) {
    const detail = r.insufficient
      ? `${r.insufficient.n} из минимум ${r.insufficient.minN} дней в окне ${r.insufficient.window === 'baseline' ? 'до старта' : 'эксперимента'}`
      : 'нет значений'
    return `${head}\n\nДанных мало, чтобы судить об эффекте (${detail}) — вердикт неубедительный.\n\nПодробности — в приложении → Эксперименты.`
  }
  const sign = r.delta > 0 ? '+' : ''
  return `${head}\nДо: ${r.baselineMean} → Во время: ${r.expMean} (${sign}${r.delta})\nЭффект: ${effectLabel(r.cohenD)} (d = ${r.cohenD}), ${r.expN} дней с данными\n\nПодробности и график — в приложении → Эксперименты.`
}
