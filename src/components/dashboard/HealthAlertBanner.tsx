import { useEffect, useState } from 'react'
import { getOpenHealthAlerts, acknowledgeHealthAlert, type HealthAlert } from '../../lib/api/dashboard'
import { demoList, demoUpdate } from '../../lib/demoDb'
import { useT } from '../../lib/i18n'

// Баннер стража здоровья (F1, smart-tonus): последний незакрытый алерт
// не старше 48 ч. Текст приходит готовым из health_alerts (пишет ingest-health),
// HTML-теги Telegram-разметки вычищаем.

export default function HealthAlertBanner({ userId, demo }: { userId: string | null; demo: boolean }) {
  const { t } = useT()
  // Демо: фикстура ленивым инициализатором, без setState в эффекте.
  const [alert, setAlert] = useState<HealthAlert | null>(
    () => demo ? (demoList('health_alerts').find(a => a.type === 'anomaly' && !a.acknowledged_at) as HealthAlert ?? null) : null)

  useEffect(() => {
    if (!userId || demo) return
    let cancelled = false
    getOpenHealthAlerts(userId, { sinceHours: 48, limit: 1, type: 'anomaly' })
      .then(alerts => { if (!cancelled && alerts.length) setAlert(alerts[0]) })
    return () => { cancelled = true }
  }, [userId, demo])

  if (!alert) return null

  const ack = async () => {
    setAlert(null)
    if (demo) return demoUpdate('health_alerts', alert.id, { acknowledged_at: new Date().toISOString() })
    await acknowledgeHealthAlert(alert.id)
  }

  const text = alert.message.replace(/<[^>]+>/g, '')
  return (
    <div className={`health-alert-banner ${alert.level}`} role="alert">
      <div className="health-alert-text">{text}</div>
      <button className="health-alert-ack" onClick={ack}>{t('Понятно')}</button>
    </div>
  )
}
