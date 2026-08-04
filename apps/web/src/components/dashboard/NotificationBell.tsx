import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DailyMetrics } from '../../types'
import { getOpenHealthAlerts, acknowledgeHealthAlert, type HealthAlert } from '../../lib/api/dashboard'
import { demoList, demoUpdate } from '../../lib/demoDb'
import { buildBellItems, parseAlertMessage, splitAlertBody, localizeAlertText, type BellItem } from '../../lib/notifications'
import { ACTIVE_STEPS_MIN, ACTIVE_EXERCISE_MIN } from '../../lib/streak'
import { useT } from '../../lib/i18n'
import { Icon, type IconName } from '../../lib/icons'
import { pluralDays } from '../../lib/plural'

interface Props {
  daily: DailyMetrics[]
  userId: string | null
  demo: boolean
}

const DISMISSED_KEY = 'bell_dismissed'

// Derived-уведомления живут один день: dismiss записывает id (в нём есть дата),
// назавтра id новый — напоминание вернётся, если условие всё ещё выполнено.
function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function persistDismissed(ids: Set<string>) {
  // Держим только свежие записи, чтобы ключ не рос бесконечно.
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-20)))
}

// Колокольчик в топбаре: алерты стража (health_alerts) + клиентские сигналы
// (стрик под угрозой, протухший синк). Паттерн попапа — как у StreakMenu.
export function NotificationBell({ daily, userId, demo }: Props) {
  const { t, locale, lang } = useT()
  const [open, setOpen] = useState(false)
  // Демо: фикстуры ленивым инициализатором (setState в эффекте — лишний рендер
  // и ошибка react-hooks/set-state-in-effect).
  const [alerts, setAlerts] = useState<HealthAlert[]>(
    () => demo ? demoList('health_alerts').filter(a => !a.acknowledged_at) as HealthAlert[] : [])
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed)
  // Развёрнутые карточки: совет с дисклеймером виден только после клика.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const rootRef = useRef<HTMLDivElement>(null)

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    if (!userId || demo) return
    let cancelled = false
    // Единственная поверхность алертов стража: раньше самый свежий дублировался
    // красным баннером над дашбордом, теперь всё живёт здесь списком за 14 дней.
    getOpenHealthAlerts(userId, { sinceHours: 14 * 24, limit: 10 })
      .then(data => { if (!cancelled && data.length) setAlerts(data) })
    return () => { cancelled = true }
  }, [userId, demo])

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const derived = useMemo(
    () => buildBellItems(daily).filter(item => !dismissed.has(item.id)),
    [daily, dismissed],
  )

  const count = alerts.length + derived.length
  if (!daily.length) return null

  const ackAlert = async (id: string) => {
    setAlerts(list => list.filter(a => a.id !== id))
    if (demo) return demoUpdate('health_alerts', id, { acknowledged_at: new Date().toISOString() })
    await acknowledgeHealthAlert(id)
  }

  const dismissDerived = (id: string) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      persistDismissed(next)
      return next
    })
  }

  const derivedText = (item: BellItem): { icon: IconName; title: string; body: ReactNode } => {
    if (item.kind === 'streak-risk') {
      return {
        icon: 'streak',
        title: t('Стрик {n} дн. под угрозой', { n: item.streak }),
        body: (
          <>
            {t('Сегодня')}: <Icon name="steps" size={14} /> {item.steps.toLocaleString(locale)} / {ACTIVE_STEPS_MIN.toLocaleString(locale)}
            {' · '}<Icon name="exercise" size={14} /> {item.exercise} / {ACTIVE_EXERCISE_MIN} {t('мин')}.{' '}
            {item.freezes > 0
              ? t('Иначе сгорит заморозка (осталось {n})', { n: item.freezes })
              : t('Заморозок нет — стрик обнулится в полночь')}
          </>
        ),
      }
    }
    if (item.kind === 'data-gaps') {
      return {
        icon: 'warning',
        title: `${t('Пробелы в данных за')} 14 ${pluralDays(14, lang)}`,
        body: (
          <>
            {item.gaps.map((g, i) => (
              <span key={g.metric}>
                {i > 0 && ' · '}
                {t(g.label)}: {t('нет данных за')} {g.missingDays} {pluralDays(g.missingDays, lang)}
              </span>
            ))}
          </>
        ),
      }
    }
    return {
      icon: 'noData',
      title: t('Нет данных {n} дн.', { n: item.days }),
      body: t('Проверь авто-синхронизацию на iPhone'),
    }
  }

  return (
    <div className="bell-menu" ref={rootRef}>
      <button
        type="button"
        className={`bell-trigger${open ? ' active' : ''}`}
        aria-label={t('Уведомления')}
        aria-expanded={open}
        aria-controls="bell-panel"
        onClick={() => setOpen(v => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && <span className="bell-badge">{count > 9 ? '9+' : count}</span>}
      </button>

      {open && (
        <section id="bell-panel" className="bell-panel" role="dialog" aria-label={t('Уведомления')}>
          {/* Без кнопки закрытия: панель и так закрывается кликом вне и Escape,
              а второй крестик рядом с крестиками отдельных уведомлений читался
              как «убрать всё». */}
          <div className="bell-head">
            <span className="bell-title">{t('Уведомления')}</span>
          </div>
          {count === 0 ? (
            <div className="bell-empty">{t('Все спокойно — сигналов нет')} <Icon name="allClear" size={16} /></div>
          ) : (
            <ul className="bell-list">
              {alerts.map(a => {
                // Серверный текст русский (язык бота) — локализуем построчно.
                // Совет с дисклеймером свёрнут: карточки компактнее, факты видны сразу.
                const { title, body } = parseAlertMessage(a.message)
                const { facts, advice } = splitAlertBody(body)
                const isOpen = expanded.has(a.id)
                return (
                  <li key={a.id} className={`bell-item level-${a.level}`}>
                    <span className="bell-item-icon">
                      {a.level === 'red'
                        ? <Icon name="alertHigh" size={18} title={t('Высокий сигнал')} />
                        : <Icon name="alertWatch" size={18} title={t('Наблюдение')} />}
                    </span>
                    <div className="bell-item-text">
                      <span className="bell-item-title">{localizeAlertText(title, t)}</span>
                      {facts && <span className="bell-item-body">{localizeAlertText(facts, t)}</span>}
                      {advice && isOpen && <span className="bell-item-body bell-item-advice">{localizeAlertText(advice, t)}</span>}
                      <span className="bell-item-time">
                        {new Date(a.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {advice && (
                          <button type="button" className="bell-item-more" onClick={() => toggleExpanded(a.id)} aria-expanded={isOpen}>
                            {isOpen ? t('Свернуть') : t('Подробнее')}
                          </button>
                        )}
                      </span>
                    </div>
                    <button type="button" className="bell-item-ack" onClick={() => ackAlert(a.id)} aria-label={t('Понятно')}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg></button>
                  </li>
                )
              })}
              {derived.map(item => {
                const { icon, title, body } = derivedText(item)
                return (
                  <li key={item.id} className={`bell-item level-${item.kind === 'streak-risk' ? 'streak' : 'info'}`}>
                    <span className="bell-item-icon"><Icon name={icon} size={18} /></span>
                    <div className="bell-item-text">
                      <span className="bell-item-title">{title}</span>
                      <span className="bell-item-body">{body}</span>
                    </div>
                    <button type="button" className="bell-item-ack" onClick={() => dismissDerived(item.id)} aria-label={t('Понятно')}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg></button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
