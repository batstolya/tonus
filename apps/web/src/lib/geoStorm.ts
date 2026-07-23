// Магнитные бури по шкале Kp — фронтовая копия чистой логики.
// ЗЕРКАЛО supabase/functions/_shared/geoStorm.ts (stormTier) — менять синхронно.
// Порог бури Kp ≥ 5 (G1+).

export type StormTier = 'minor' | 'strong' | 'extreme'

export function stormTier(kp: number | null | undefined): StormTier | null {
  if (kp == null || kp < 5) return null
  if (kp >= 9) return 'extreme'
  if (kp >= 7) return 'strong'
  return 'minor'
}

// Ключ подсказки для i18n по уровню бури.
export function stormHintKey(tier: StormTier): string {
  return tier === 'extreme'
    ? 'Дай телу отдохнуть сегодня.'
    : tier === 'strong'
      ? 'Сегодня лучше снизить нагрузку.'
      : 'Восстановление может проседать — не гонись за рекордами.'
}
