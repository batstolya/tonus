import { useT } from '../../../lib/i18n'
import { useNavLayout, type NavLayout } from '../../../hooks/useNavLayout'
import { ArchiveBtn, type SectionProps } from './ArchiveBtn'

const OPTIONS: { value: NavLayout; label: string }[] = [
  { value: 'top', label: 'Сверху' },
  { value: 'side', label: 'Сбоку' },
]

// Trial switch between the two navigation layouts. The choice is per-device
// (localStorage), so this section deliberately has no server state.
export function NavLayoutSection({ archived, onArchive }: SectionProps) {
  const { t } = useT()
  const { layout, setLayout } = useNavLayout()
  return (
    <section className={`settings-section${archived ? ' is-archived' : ''}`}>
      <ArchiveBtn id="navLayout" onArchive={onArchive} />
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
        {t('Расположение меню')}
      </h3>
      <div className="rep-seg">
        {OPTIONS.map(o => (
          <button
            key={o.value}
            className={`rep-seg-btn${layout === o.value ? ' on' : ''}`}
            onClick={() => setLayout(o.value)}
          >{t(o.label)}</button>
        ))}
      </div>
      <p className="settings-muted" style={{ fontSize: 13, marginTop: 8 }}>{t('Действует на широких экранах')}</p>
    </section>
  )
}
