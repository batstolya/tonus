import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { demoList, demoUpdate } from '../../lib/demoDb'
import { useT } from '../../lib/i18n'

// Баннер стража здоровья (F1, smart-tonus): последний незакрытый алерт
// не старше 48 ч. Текст приходит готовым из health_alerts (пишет ingest-health),
// HTML-теги Telegram-разметки вычищаем.

interface HealthAlert {
  id: string
  level: 'yellow' | 'red'
  message: string
  created_at: string
}

export default function HealthAlertBanner({ userId, demo }: { userId: string | null; demo: boolean }) {
  const { t } = useT()
  // Демо: фикстура ленивым инициализатором, без setState в эффекте.
  const [alert, setAlert] = useState<HealthAlert | null>(
    () => demo ? (demoList('health_alerts').find(a => a.type === 'anomaly' && !a.acknowledged_at) as HealthAlert ?? null) : null)

  useEffect(() => {
    if (!userId || demo) return
    let cancelled = false
    const since = new Date(Date.now() - 48 * 3600_000).toISOString()
    supabase
      .from('health_alerts')
      .select('id, level, message, created_at')
      .eq('user_id', userId)
      .eq('type', 'anomaly')
      .is('acknowledged_at', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!cancelled && data?.length) setAlert(data[0] as HealthAlert)
      })
    return () => { cancelled = true }
  }, [userId, demo])

  if (!alert) return null

  const ack = async () => {
    setAlert(null)
    if (demo) return demoUpdate('health_alerts', alert.id, { acknowledged_at: new Date().toISOString() })
    await supabase.from('health_alerts').update({ acknowledged_at: new Date().toISOString() }).eq('id', alert.id)
  }

  const text = alert.message.replace(/<[^>]+>/g, '')
  return (
    <div className={`health-alert-banner ${alert.level}`} role="alert">
      <div className="health-alert-text">{text}</div>
      <button className="health-alert-ack" onClick={ack}>{t('Понятно')}</button>
    </div>
  )
}
