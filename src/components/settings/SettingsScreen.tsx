import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { CalendarEvent, DailyMetrics } from '../../types'
import type { AppView, DeviceType } from '../../store/appStore'
import { DoctorReport } from './DoctorReport'
import { AutoSyncSettings } from './AutoSyncSettings'
import { WorkoutScheduleSettings } from './WorkoutScheduleSettings'
import { PrivacySettings } from './PrivacySettings'
import { useT } from '../../lib/i18n'
import { ConnectGuide } from '../onboarding/ConnectGuide'
import { isDemoActive } from '../../lib/demo'
import { ArchiveBtn } from './sections/ArchiveBtn'
import { LanguageSection } from './sections/LanguageSection'
import { TelegramSection } from './sections/TelegramSection'
import { GoogleCalendarSection } from './sections/GoogleCalendarSection'
import { CalSyncSection } from './sections/CalSyncSection'
import { AiBudgetSection } from './sections/AiBudgetSection'
import { AiConsentSection } from './sections/AiConsentSection'
import { ImportSection } from './sections/ImportSection'
import { EnvironmentSection } from './sections/EnvironmentSection'
import { DeviceSection } from './sections/DeviceSection'
import { ExportSection } from './sections/ExportSection'

interface Props {
  user: User
  onGoogleSync?: () => void
  googleLoading?: boolean
  googleConnected?: boolean
  lastSync?: string | null
  calLastSync?: string | null
  onCalEvents?: (events: CalendarEvent[]) => void
  onNavigate?: (view: AppView) => void
  deviceType?: DeviceType | null
  onDeviceTypeChange?: (d: DeviceType) => void
  daily?: DailyMetrics[]
}

// Заголовки секций для списка «Архив» (стабильный id → ключ перевода)
const SECTION_TITLES: Record<string, string> = {
  language: 'Язык интерфейса',
  telegram: 'Telegram',
  reports: 'Отчёты в Telegram',
  google: 'Google Calendar',
  cal: 'Cal.beskarstaff.com',
  ai: 'AI расходы',
  import: 'Импорт данных',
  autosync: 'Авто-синхронизация (Apple Health)',
  environment: 'Данные среды',
  device: 'Устройство',
  export: 'Экспорт данных',
}

// Экран настроек: композиция независимых секций (каждая владеет своим состоянием
// и data-layer, см. ./sections). Родитель держит сквозное — архивирование секций
// и модалки (гайд подключения, отчёт для врача).
export function SettingsScreen({ user, onGoogleSync, googleLoading, googleConnected, lastSync, onCalEvents, onNavigate, deviceType, onDeviceTypeChange, daily }: Props) {
  const { t } = useT()
  const [archivedSections, setArchivedSections] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('settings_archived') ?? '[]') } catch { return [] }
  })
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showDoctorReport, setShowDoctorReport] = useState(false)
  const isArchived = (id: string) => archivedSections.includes(id)
  function persistArchived(next: string[]) {
    localStorage.setItem('settings_archived', JSON.stringify(next))
    setArchivedSections(next)
  }
  const archiveSection = (id: string) => { if (!archivedSections.includes(id)) persistArchived([...archivedSections, id]) }
  const restoreSection = (id: string) => persistArchived(archivedSections.filter(x => x !== id))

  return (
    <div className="settings-screen">
      <h2>{t('Настройки')}</h2>

      <LanguageSection archived={isArchived('language')} onArchive={archiveSection} />

      <TelegramSection
        user={user}
        archivedTelegram={isArchived('telegram')}
        archivedReports={isArchived('reports')}
        onArchive={archiveSection}
      />

      {onGoogleSync && (
        <GoogleCalendarSection
          archived={isArchived('google')}
          onArchive={archiveSection}
          onGoogleSync={onGoogleSync}
          googleLoading={googleLoading}
          googleConnected={googleConnected}
          lastSync={lastSync}
        />
      )}

      <CalSyncSection
        archived={isArchived('cal')}
        onArchive={archiveSection}
        user={user}
        onCalEvents={onCalEvents}
        onNavigate={onNavigate}
      />

      <AiBudgetSection archived={isArchived('ai')} onArchive={archiveSection} user={user} />
      <AiConsentSection user={user} />

      {onNavigate && (
        <ImportSection archived={isArchived('import')} onArchive={archiveSection} onNavigate={onNavigate} />
      )}

      <div className={`archivable-block${isArchived('autosync') ? ' is-archived' : ''}`}>
        <ArchiveBtn id="autosync" onArchive={archiveSection} />
        <AutoSyncSettings user={user} />
      </div>

      {user && <WorkoutScheduleSettings user={user} />}
      {user && <PrivacySettings user={user} />}

      <EnvironmentSection archived={isArchived('environment')} onArchive={archiveSection} user={user} />

      {onDeviceTypeChange && (
        <DeviceSection
          archived={isArchived('device')}
          onArchive={archiveSection}
          deviceType={deviceType}
          onDeviceTypeChange={onDeviceTypeChange}
          onShowGuide={() => setShowGuide(true)}
        />
      )}

      {showDoctorReport && (
        <div className="guide-overlay">
          <DoctorReport user={user} daily={daily ?? []} onClose={() => setShowDoctorReport(false)} />
        </div>
      )}

      {showGuide && onDeviceTypeChange && (
        <div className="guide-overlay">
          <ConnectGuide
            user={user}
            demo={isDemoActive()}
            deviceType={deviceType ?? null}
            onSelectDevice={onDeviceTypeChange}
            onDismiss={() => setShowGuide(false)}
            onDone={() => setShowGuide(false)}
          />
        </div>
      )}

      <ExportSection
        archived={isArchived('export')}
        onArchive={archiveSection}
        user={user}
        onShowDoctorReport={() => setShowDoctorReport(true)}
      />

      {archivedSections.length > 0 && (
        <section className="settings-section settings-archive">
          <button type="button" className="settings-archive-toggle" onClick={() => setArchiveOpen(o => !o)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/></svg>
            {t('Архив')} · {archivedSections.length}
            <span className="settings-archive-caret">{archiveOpen ? '▲' : '▼'}</span>
          </button>
          {archiveOpen && (
            <div className="settings-archive-list">
              {archivedSections.map(id => (
                <div key={id} className="settings-archive-row">
                  <span>{t(SECTION_TITLES[id] ?? id)}</span>
                  <button type="button" className="link-btn" onClick={() => restoreSection(id)}>{t('Вернуть')}</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
