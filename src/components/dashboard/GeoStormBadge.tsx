import { useTodayStorm } from '../../lib/useTodayStorm'
import { useT } from '../../lib/i18n'
import { MagnetIcon } from './MagnetIcon'

// Бейдж магнитной бури в топбаре. Виден только в дни бури (Kp ≥ 5).
export function GeoStormBadge() {
  const { t } = useT()
  const { kp, tier } = useTodayStorm()
  if (!tier || kp == null) return null
  const kpStr = Number.isInteger(kp) ? String(kp) : kp.toFixed(1)
  return (
    <span
      className={`geostorm-badge ${tier}`}
      title={`${t('Магнитная буря сегодня')} · Kp ${kpStr}`}
      role="img"
      aria-label={`${t('Магнитная буря сегодня')} · Kp ${kpStr}`}
    >
      <MagnetIcon size={16} />
    </span>
  )
}
