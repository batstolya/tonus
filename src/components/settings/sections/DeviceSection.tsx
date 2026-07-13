import { useT } from '../../../lib/i18n'
import type { DeviceType } from '../../../store/appStore'
import { clearGuideProgress } from '../../onboarding/guideState'
import { ArchiveBtn, type SectionProps } from './ArchiveBtn'

interface Props extends SectionProps {
  deviceType?: DeviceType | null
  onDeviceTypeChange: (d: DeviceType) => void
  onShowGuide: () => void
}

export function DeviceSection({ archived, onArchive, deviceType, onDeviceTypeChange, onShowGuide }: Props) {
  const { t } = useT()
  return (
    <section className={`settings-section${archived ? ' is-archived' : ''}`}>
      <ArchiveBtn id="device" onArchive={onArchive} />
      <h2 className="settings-section-title">{t('Устройство')}</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
        {t('Текущий источник данных:')} <strong>{deviceType === 'xiaomi' ? 'Xiaomi / Mi Band' : deviceType === 'apple_watch' ? 'Apple Watch' : t('не выбран')}</strong>
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className={`btn-secondary${deviceType === 'apple_watch' ? ' active' : ''}`}
          style={{ padding: '6px 14px', fontSize: 13 }}
          onClick={() => onDeviceTypeChange('apple_watch')}
        >
          Apple Watch
        </button>
        <button
          className={`btn-secondary${deviceType === 'xiaomi' ? ' active' : ''}`}
          style={{ padding: '6px 14px', fontSize: 13 }}
          onClick={() => onDeviceTypeChange('xiaomi')}
        >
          Xiaomi / Mi Band
        </button>
      </div>
      <button
        className="btn-secondary"
        style={{ marginTop: 12 }}
        onClick={() => { clearGuideProgress(); onShowGuide() }}
      >
        {t('Как подключить устройство')}
      </button>
    </section>
  )
}
