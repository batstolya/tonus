import { useT, LANGS } from '../../../lib/i18n'
import { ArchiveBtn, type SectionProps } from './ArchiveBtn'

export function LanguageSection({ archived, onArchive }: SectionProps) {
  const { t, lang, setLang } = useT()
  return (
    <section className={`settings-section${archived ? ' is-archived' : ''}`}>
      <ArchiveBtn id="language" onArchive={onArchive} />
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        {t('Язык интерфейса')}
      </h3>
      <div className="rep-seg">
        {LANGS.map(l => (
          <button
            key={l.code}
            className={`rep-seg-btn${lang === l.code ? ' on' : ''}`}
            onClick={() => setLang(l.code)}
          >{l.flag} {l.label}</button>
        ))}
      </div>
    </section>
  )
}
