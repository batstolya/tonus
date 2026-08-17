import type { AppView } from '../../store/appStore'
import type { GroupId, NavGroup } from '../../app/navigation'
import { useT } from '../../lib/i18n'
import { Icon } from '../../lib/icons'

export type SidebarProps = {
  groups: NavGroup[]
  view: AppView
  activeGroup: GroupId | null
  activeSubView: AppView
  collapsed: boolean
  onToggleCollapsed: () => void
  onNavigate: (view: AppView) => void
}

// Same grid glyph the mobile bottom nav uses for the dashboard.
const dashboardIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
)

// The opt-in wide-screen layout: one vertical list where every section is a
// separate block, collapsing to a strip of group icons. Collapsed, the strip
// carries only the icons — sub-views are picked in the top sub-nav row, which
// the stylesheet re-shows in that state, so pointer and touch behave alike.
export function Sidebar({
  groups, view, activeGroup, activeSubView, collapsed, onToggleCollapsed, onNavigate,
}: SidebarProps) {
  const { t } = useT()
  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar-head">
        {!collapsed && (
          <button className="sidebar-logo" onClick={() => onNavigate('dashboard')}>Tonus</button>
        )}
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapsed}
          aria-label={t(collapsed ? 'Развернуть меню' : 'Свернуть меню')}
          title={t(collapsed ? 'Развернуть меню' : 'Свернуть меню')}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
        </button>
      </div>

      <nav className="sidebar-nav" aria-label={t('Меню')}>
        <button
          className={`sidebar-btn${view === 'dashboard' ? ' active' : ''}`}
          onClick={() => onNavigate('dashboard')}
          aria-label={t('Дашборд')}
          title={t('Дашборд')}
        >
          <span className="sidebar-btn-icon">{dashboardIcon}</span>
          <span className="sidebar-btn-label">{t('Дашборд')}</span>
        </button>

        {groups.map(g => (
          <div key={g.id} className="sidebar-group">
            {collapsed ? (
              <button
                className={`sidebar-icon-btn${activeGroup === g.id ? ' active' : ''}`}
                onClick={() => onNavigate(g.defaultView)}
                aria-label={t(g.label)}
                title={t(g.label)}
              >
                {g.icon}
              </button>
            ) : (
              <>
                <div className="sidebar-caption">{t(g.label)}</div>
                {g.views.map(v => (
                  <button
                    key={v.view}
                    className={`sidebar-btn${activeSubView === v.view ? ' active' : ''}`}
                    onClick={() => onNavigate(v.view)}
                  >
                    <span className="sidebar-btn-label">{t(v.label)}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button
          className={`sidebar-btn${view === 'settings' ? ' active' : ''}`}
          onClick={() => onNavigate('settings')}
          aria-label={t('Настройки')}
          title={t('Настройки')}
        >
          <span className="sidebar-btn-icon"><Icon name="settings" size={20} /></span>
          <span className="sidebar-btn-label">{t('Настройки')}</span>
        </button>
      </div>
    </aside>
  )
}
