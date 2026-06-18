import type { DeviceType } from '../../store/appStore'
import { useT } from '../../lib/i18n'

interface Props {
  onSelect: (device: DeviceType) => void
}

export function DeviceSelectScreen({ onSelect }: Props) {
  const { t } = useT()
  return (
    <div className="upload-screen">
      <div className="upload-header">
        <h1>Tonus</h1>
        <p className="upload-desc">{t('Какое у вас устройство?')}</p>
      </div>

      <div className="device-select-grid">
        <button className="device-card" onClick={() => onSelect('apple_watch')}>
          <div className="device-card-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="3"/>
              <path d="M5 8h14M5 16h14"/>
            </svg>
          </div>
          <div className="device-card-title">Apple Watch</div>
          <div className="device-card-desc">{t('Экспорт через приложение «Здоровье» на iPhone')}</div>
        </button>

        <button className="device-card" onClick={() => onSelect('xiaomi')}>
          <div className="device-card-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="7" y="3" width="10" height="18" rx="4"/>
              <path d="M10 19.5h4"/>
            </svg>
          </div>
          <div className="device-card-title">Xiaomi / Mi Band</div>
          <div className="device-card-desc">{t('Экспорт через account.xiaomi.com — CSV с данными')}</div>
        </button>
      </div>

      <p className="upload-hint">{t('Выбор можно изменить позже в настройках')}</p>
    </div>
  )
}
