import { useEffect, useMemo, useRef, useState } from 'react'
import type { DailyMetrics } from '../../types'
import { supabase } from '../../lib/supabase'
import { buildBellItems, type BellItem } from '../../lib/notifications'
import { ACTIVE_STEPS_MIN, ACTIVE_EXERCISE_MIN } from '../../lib/streak'
import { useT } from '../../lib/i18n'

interface Props {
  daily: DailyMetrics[]
  userId: string | null
  demo: boolean
}

// Алерты стража из БД (та же выборка, что HealthAlertBanner, но списком).
interface HealthAlert {
  id: string
  level: 'yellow' | 'red'
  message: string
  created_at: string
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
  const { t, locale } = useT()
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<HealthAlert[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!userId || demo) return
    let cancelled = false
    const since = new Date(Date.now() - 14 * 24 * 3600_000).toISOString()
    supabase
      .from('health_alerts')
      .select('id, level, message, created_at')
      .eq('user_id', userId)
      .is('acknowledged_at', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!cancelled && data) setAlerts(data as HealthAlert[])
      })
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
    await supabase.from('health_alerts').update({ acknowledged_at: new Date().toISOString() }).eq('id', id)
  }

  const dismissDerived = (id: string) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      persistDismissed(next)
      return next
    })
  }

  const derivedText = (item: BellItem): { icon: string; title: string; body: string } => {
    if (item.kind === 'streak-risk') {
      return {
        icon: '🔥',
        title: t('Стрик {n} дн. под угрозой', { n: item.streak }),
        body: `${t('Сегодня')}: 🚶 ${item.steps.toLocaleString(locale)} / ${ACTIVE_STEPS_MIN.toLocaleString(locale)}`
          + ` · 🏃 ${item.exercise} / ${ACTIVE_EXERCISE_MIN} ${t('мин')}. `
          + (item.freezes > 0
            ? t('Иначе сгорит заморозка (осталось {n})', { n: item.freezes })
            : t('Заморозок нет — стрик обнулится в полночь')),
      }
    }
    return {
      icon: '📡',
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
          <div className="bell-head">
            <span className="bell-title">{t('Уведомления')}</span>
            <button type="button" className="streak-menu-close" onClick={() => setOpen(false)} aria-label={t('Закрыть')}>×</button>
          </div>
          {count === 0 ? (
            <div className="bell-empty">{t('Все спокойно — сигналов нет')} 👌</div>
          ) : (
            <ul className="bell-list">
              {alerts.map(a => (
                <li key={a.id} className={`bell-item level-${a.level}`}>
                  <span className="bell-item-icon" aria-hidden>{a.level === 'red' ? '🔴' : '🟡'}</span>
                  <div className="bell-item-text">
                    <span className="bell-item-body">{a.message.replace(/<[^>]+>/g, '')}</span>
                    <span className="bell-item-time">
                      {new Date(a.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <button type="button" className="bell-item-ack" onClick={() => ackAlert(a.id)} aria-label={t('Понятно')}>✓</button>
                </li>
              ))}
              {derived.map(item => {
                const { icon, title, body } = derivedText(item)
                return (
                  <li key={item.id} className="bell-item">
                    <span className="bell-item-icon" aria-hidden>{icon}</span>
                    <div className="bell-item-text">
                      <span className="bell-item-title">{title}</span>
                      <span className="bell-item-body">{body}</span>
                    </div>
                    <button type="button" className="bell-item-ack" onClick={() => dismissDerived(item.id)} aria-label={t('Понятно')}>✓</button>
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
