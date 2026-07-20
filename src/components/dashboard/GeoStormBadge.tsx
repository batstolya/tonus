import { useState } from 'react'
import { useTodayStorm } from '../../lib/useTodayStorm'
import { stormHintKey } from '../../lib/geoStorm'
import { useT } from '../../lib/i18n'
import { StormIcon } from './StormIcon'

// Бейдж магнитной бури в топбаре. Виден только в дни бури (Kp ≥ 5).
// Клик открывает мини-панель с объяснением: иконка сама по себе не очевидна.
export function GeoStormBadge() {
  const { t } = useT()
  const { kp, tier } = useTodayStorm()
  const [open, setOpen] = useState(false)
  if (!tier || kp == null) return null
  const kpStr = Number.isInteger(kp) ? String(kp) : kp.toFixed(1)
  return (
    <div className="geostorm-wrap">
      <button
        type="button"
        className={`geostorm-badge ${tier}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`${t('Магнитная буря сегодня')} · Kp ${kpStr}`}
      >
        <StormIcon size={16} />
      </button>
      {open && (
        <>
          <div className="lang-overlay" onClick={() => setOpen(false)} />
          <div className="geostorm-pop" role="status">
            <strong className="geostorm-pop-title">{t('Магнитная буря сегодня')} · Kp {kpStr}</strong>
            <p className="geostorm-pop-text">{t(stormHintKey(tier))}</p>
            <p className="geostorm-pop-note">{t('Kp — индекс геомагнитной активности (буря при Kp ≥ 5). У чувствительных людей в такие дни может проседать сон и восстановление.')}</p>
          </div>
        </>
      )}
    </div>
  )
}
