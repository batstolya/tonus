import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'
import { ensureToken, webhookUrl } from '../../../lib/autosync'

const DEMO_URL = 'https://demo.tonus.app/functions/v1/ingest-health?token=demo'

export function StepWebhook({ user, demo }: { user: User | null; demo: boolean }) {
  const { t } = useT()
  const [url, setUrl] = useState(() => (demo || !user) ? DEMO_URL : '')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const copiedTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (demo || !user) return
    ensureToken(user.id)
      .then(tok => setUrl(webhookUrl(tok.token)))
      .catch(() => setError(true))
  }, [user, demo, attempt])

  // Сброс «Скопировано» по таймеру не должен стрелять после ухода с шага.
  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  function retry() {
    setError(false)
    setAttempt(a => a + 1)
  }

  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  return (
    <div className="guide-content">
      <h2>{t('Вставь адрес Tonus')}</h2>
      <p>{t('Скопируй персональную ссылку и вставь её в поле URL автоматизации.')}</p>
      <div className="guide-url">
        <code>{url || '…'}</code>
      </div>
      {error ? (
        <>
          <p role="alert">{t('Не удалось получить ссылку')}</p>
          <button className="guide-cta" style={{ border: 'none', cursor: 'pointer' }} onClick={retry}>
            {t('Повторить')}
          </button>
        </>
      ) : (
        <m.button
          className="guide-cta"
          style={{ border: 'none', cursor: 'pointer' }}
          onClick={copy}
          whileTap={{ scale: 0.95 }}
          animate={copied ? { scale: [1, 1.08, 1] } : {}}
        >
          {copied ? t('Скопировано') : t('Копировать')}
        </m.button>
      )}
    </div>
  )
}
