import { useT } from '../../lib/i18n'

// The sub-tab strip shared by the three journal screens. It lived copy-pasted
// in two of them; a third copy is where that stops being harmless.

export type ConcernsTab = 'concerns' | 'observations' | 'hair'

export function ConcernsSubtabs({ active, onNavigate }: {
  active: ConcernsTab
  onNavigate: (tab: ConcernsTab) => void
}) {
  const { t } = useT()
  const tabs: { id: ConcernsTab; label: string }[] = [
    { id: 'concerns', label: 'Проблемы' },
    { id: 'observations', label: 'Наблюдения' },
    { id: 'hair', label: 'Волосы' },
  ]
  return (
    <div className="concerns-subtabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`concerns-subtab${tab.id === active ? ' active' : ''}`}
          onClick={() => tab.id !== active && onNavigate(tab.id)}
        >
          {t(tab.label)}
        </button>
      ))}
    </div>
  )
}
