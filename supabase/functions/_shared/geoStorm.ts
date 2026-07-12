// Магнитные бури по шкале Kp. Чистая логика (vitest).
// ЗЕРКАЛО для фронта — src/lib/geoStorm.ts (stormTier) — менять синхронно.
// Порог бури Kp ≥ 5 (G1+), совпадает с фактором `storm` в forecast.ts.

export type StormTier = 'minor' | 'strong' | 'extreme'

// null если спокойно (Kp < 5 или нет данных).
export function stormTier(kp: number | null | undefined): StormTier | null {
  if (kp == null || kp < 5) return null
  if (kp >= 9) return 'extreme'
  if (kp >= 7) return 'strong'
  return 'minor'
}

// Клауза для Telegram-уведомления о тренировке (спорт на улице → буря важна).
// Пусто, если бури нет.
export function stormNotificationClause(kp: number | null | undefined): string {
  const tier = stormTier(kp)
  if (!tier) return ''
  const kpStr = Number.isInteger(kp) ? String(kp) : (kp as number).toFixed(1)
  const hint = tier === 'extreme'
    ? 'сильнейшая буря — дай телу отдохнуть'
    : tier === 'strong'
      ? 'сильная буря — сегодня лучше полегче'
      : 'восстановление может проседать'
  return `🧲 Магнитная буря (Kp ${kpStr}) — ${hint}.`
}
