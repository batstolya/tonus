import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'
import { ensureToken, webhookUrl } from '../../../lib/autosync'

const DEMO_URL = 'https://demo.tonus.app/functions/v1/ingest-health?token=demo'

export function StepWebhook({ user, demo }: { user: User | null; demo: boolean }) {
  const { t } = useT()
  const [url, setUrl] = useState(() => (demo || !user) ? DEMO_URL : '')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (demo || !user) return
    ensureToken(user.id).then(tok => setUrl(webhookUrl(tok.token)))
  }, [user, demo])

  function copy() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="guide-content">
      <h2>{t('Вставь адрес Tonus')}</h2>
      <p>{t('Скопируй персональную ссылку и вставь её в поле URL автоматизации.')}</p>
      <div className="guide-url">
        <code>{url || '…'}</code>
      </div>
      <m.button
        className="guide-cta"
        style={{ border: 'none', cursor: 'pointer' }}
        onClick={copy}
        whileTap={{ scale: 0.95 }}
        animate={copied ? { scale: [1, 1.08, 1] } : {}}
      >
        {copied ? t('Скопировано') : t('Копировать')}
      </m.button>
    </div>
  )
}
