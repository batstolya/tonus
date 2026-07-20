import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../../lib/i18n'
import { grantAiConsent, loadAiConsent, revokeAiConsent } from '../../../lib/aiConsent'

export function AiConsentSection({ user }: { user: User }) {
  const { t } = useT()
  const [granted, setGranted] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadAiConsent(user.id)
      .then(status => { if (active) setGranted(status.granted) })
      .catch(() => { if (active) { setGranted(false); setError(t('Не удалось загрузить статус согласия. ИИ останется заблокирован.')) } })
    return () => { active = false }
  }, [t, user.id])

  async function updateConsent(next: boolean) {
    setSaving(true)
    setError(null)
    try {
      if (next) await grantAiConsent(user.id)
      else await revokeAiConsent(user.id)
      setGranted(next)
    } catch {
      setError(t('Не удалось сохранить согласие. Попробуй ещё раз.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>
        {t('Обработка данных ИИ')}
      </h3>
      <p className="settings-muted">
        {t('Google Gemini обрабатывает сводки здоровья, сообщения чата, фото еды и медицинские документы, когда ты запускаешь соответствующую функцию.')}
      </p>
      <p className="settings-muted" style={{ marginTop: 8 }}>
        {t('Цель обработки — анализ данных, извлечение показателей, персональные рекомендации и ответы ИИ. Tonus не отправляет эти данные в Gemini без активного согласия.')}
      </p>
      <p className="settings-muted" style={{ marginTop: 8 }}>
        {t('Новое согласие действует на всех устройствах. Отзыв блокирует следующие обращения к ИИ.')}
      </p>
      <p className="settings-muted" style={{ marginTop: 8 }}>
        {t('Отзыв не удаляет данные, которые Google уже обработал по своим условиям.')}
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        <span style={{ color: granted ? 'var(--green)' : 'var(--text-muted)', fontWeight: 600 }}>
          {granted === null ? t('Загружаем статус…') : granted ? t('Согласие активно') : t('Согласие не дано')}
        </span>
        {granted !== null && (
          <button
            type="button"
            className={granted ? 'btn-secondary' : 'btn-primary'}
            disabled={saving}
            onClick={() => updateConsent(!granted)}
          >
            {saving ? t('Сохраняем…') : granted ? t('Отозвать согласие') : t('Дать согласие')}
          </button>
        )}
      </div>
      {error && <p className="auth-error" role="alert" style={{ marginTop: 10 }}>{error}</p>}
    </section>
  )
}
