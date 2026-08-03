import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../../lib/i18n'
import { exportAllJSON, exportMetricsCSV } from '../../../lib/exportData'
import { Icon } from '../../../lib/icons'
import { ArchiveBtn, type SectionProps } from './ArchiveBtn'

interface Props extends SectionProps {
  user: User
  onShowDoctorReport: () => void
}

export function ExportSection({ archived, onArchive, user, onShowDoctorReport }: Props) {
  const { t } = useT()
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)

  async function handleExport(kind: 'json' | 'csv') {
    setExporting(kind)
    try {
      if (kind === 'json') await exportAllJSON(user.id)
      else await exportMetricsCSV(user.id)
    } catch { /* ignore */ }
    setExporting(null)
  }

  return (
    <section className={`settings-section${archived ? ' is-archived' : ''}`}>
      <ArchiveBtn id="export" onArchive={onArchive} />
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        {t('Экспорт данных')}
      </h3>
      <div className="settings-muted" style={{ fontSize: 13, marginBottom: 10 }}>
        {t('Скачай все свои данные для бэкапа или анализа. Обрабатывается в браузере.')}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-secondary" onClick={() => handleExport('json')} disabled={exporting !== null}>
          {exporting === 'json' ? '…' : <><Icon name="archive" size={14} /> {t('Полный бэкап (JSON)')}</>}
        </button>
        <button className="btn-secondary" onClick={() => handleExport('csv')} disabled={exporting !== null}>
          {exporting === 'csv' ? '…' : <><Icon name="chart" size={14} /> {t('Метрики (CSV)')}</>}
        </button>
        <button className="btn-secondary" onClick={onShowDoctorReport}>
          <Icon name="print" size={14} /> {t('Отчёт для врача')}
        </button>
      </div>
    </section>
  )
}
