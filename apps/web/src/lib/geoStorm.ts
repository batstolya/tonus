// Магнитные бури по шкале Kp. Классификация живёт в ОДНОМ месте —
// supabase/functions/_shared/geoStorm.ts (порог Kp ≥ 5, G1+), её же импортируют
// edge-функции. Этот файл — клиентский фасад (паттерн scores.ts): re-export
// расчёта + фронтовая надстройка (текст подсказки).

import type { StormTier } from '../../../../supabase/functions/_shared/geoStorm'

export { stormTier } from '../../../../supabase/functions/_shared/geoStorm'
export type { StormTier }

// Ключ подсказки для i18n по уровню бури. Фронтовая надстройка: на сервере
// свой текст (stormNotificationClause) — для Telegram, другой тон и формат.
export function stormHintKey(tier: StormTier): string {
  return tier === 'extreme'
    ? 'Дай телу отдохнуть сегодня.'
    : tier === 'strong'
      ? 'Сегодня лучше снизить нагрузку.'
      : 'Восстановление может проседать — не гонись за рекордами.'
}
