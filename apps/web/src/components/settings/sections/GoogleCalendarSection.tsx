import { useT } from '../../../lib/i18n'
import { ArchiveBtn, type SectionProps } from './ArchiveBtn'

interface Props extends SectionProps {
  onGoogleSync?: () => void
  googleLoading?: boolean
  googleConnected?: boolean
  lastSync?: string | null
}

export function GoogleCalendarSection({ archived, onArchive, onGoogleSync, googleLoading, googleConnected, lastSync }: Props) {
  const { t } = useT()
  return (
    <section className={`settings-section${archived ? ' is-archived' : ''}`}>
      <ArchiveBtn id="google" onArchive={onArchive} />
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Google Calendar
      </h3>
      <div className="settings-cal-row">
        <div>
          <div className="settings-label">{t('Загрузить события из Google Calendar')}</div>
          {lastSync && <div className="settings-muted" style={{ fontSize: 13, marginTop: 4 }}>{t('Последняя синхронизация:')} {lastSync}</div>}
        </div>
        <button
          className={`btn-primary ${googleConnected ? 'btn-success' : ''}`}
          onClick={onGoogleSync}
          disabled={googleLoading}
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {googleLoading ? t('Загрузка…') : googleConnected ? `✓ ${t('Синхронизировано')}` : t('Подключить')}
        </button>
      </div>
    </section>
  )
}
