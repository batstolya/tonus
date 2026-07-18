import { useTodayStorm } from '../../lib/useTodayStorm'
import { stormHintKey } from '../../lib/geoStorm'
import { useT } from '../../lib/i18n'
import { MagnetIcon } from './MagnetIcon'

// Слим-баннер магнитной бури на дашборде. Появляется только в дни бури (Kp ≥ 5).
// Цвет по силе: minor (жёлтый) / strong (оранжевый) / extreme (красный).
export function GeoStormBanner() {
  const { t } = useT()
  const { kp, tier } = useTodayStorm()
  if (!tier || kp == null) return null

  const kpStr = Number.isInteger(kp) ? String(kp) : kp.toFixed(1)
  return (
    <div className={`geostorm-banner ${tier}`} role="status">
      <span className="geostorm-icon" aria-hidden><MagnetIcon size={18} /></span>
      <div>
        <strong>{t('Магнитная буря сегодня')} · Kp {kpStr}</strong>
        <span className="geostorm-hint">{t(stormHintKey(tier))}</span>
      </div>
    </div>
  )
}
