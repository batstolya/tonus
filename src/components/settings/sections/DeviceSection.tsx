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
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6l.5-3h5l.5 3M9 18l.5 3h5l.5-3"/></svg>
        {t('Устройство')}
      </h3>
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
