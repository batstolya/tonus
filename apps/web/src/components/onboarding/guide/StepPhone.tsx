import { useT } from '../../../lib/i18n'
import type { GuidePhone } from '../guideState'

export function StepPhone({ onPick, onCsv }: { onPick: (p: GuidePhone) => void; onCsv: () => void }) {
  const { t } = useT()
  return (
    <div className="guide-content">
      <h2>{t('Какой у тебя телефон?')}</h2>
      <div className="device-select-grid">
        <button className="device-card" onClick={() => onPick('iphone')}>
          <div className="device-card-title">iPhone</div>
        </button>
        <button className="device-card" onClick={() => onPick('android')}>
          <div className="device-card-title">Android</div>
        </button>
      </div>
      <button className="guide-skip" onClick={onCsv}>{t('Разовый импорт CSV')}</button>
    </div>
  )
}
