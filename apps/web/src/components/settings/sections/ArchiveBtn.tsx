import { useT } from '../../../lib/i18n'

// Кнопка «в архив» в углу каждой секции настроек. Общая для всех секций
// (воркстрим C: SettingsScreen декомпозирован по секциям).
export function ArchiveBtn({ id, onArchive }: { id: string; onArchive: (id: string) => void }) {
  const { t } = useT()
  return (
    <button
      type="button"
      className="section-archive-btn"
      title={t('В архив')}
      aria-label={t('В архив')}
      onClick={() => onArchive(id)}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/></svg>
    </button>
  )
}

// Общие пропсы секции: флаг архивации + колбэк архивации (родитель владеет состоянием).
export interface SectionProps {
  archived: boolean
  onArchive: (id: string) => void
}
