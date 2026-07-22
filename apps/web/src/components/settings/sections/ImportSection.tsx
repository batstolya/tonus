import { useT } from '../../../lib/i18n'
import type { AppView } from '../../../store/appStore'
import { ArchiveBtn, type SectionProps } from './ArchiveBtn'

export function ImportSection({ archived, onArchive, onNavigate }: SectionProps & { onNavigate: (view: AppView) => void }) {
  const { t } = useT()
  return (
    <section className={`settings-section${archived ? ' is-archived' : ''}`}>
      <ArchiveBtn id="import" onArchive={onArchive} />
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        {t('Импорт данных')}
      </h3>
      <div className="settings-muted" style={{ fontSize: 13, marginBottom: 10 }}>
        {t('Загрузите новый экспорт из приложения «Здоровье» (Apple) или Xiaomi, чтобы добавить свежие дни.')}
      </div>
      <button className="btn-secondary" onClick={() => onNavigate('upload')}>
        📥 {t('Загрузить данные')}
      </button>
    </section>
  )
}
