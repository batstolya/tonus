import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'
import { loadToken } from '../../../lib/autosync'
import { waitForFirstIngest } from '../../../lib/ingestWait'

const CHECKLIST = [
  'URL вставлен целиком, вместе с token=',
  'Метод — POST, формат — JSON',
  'Автоматизация включена (Enable)',
]

export function StepVerify({ user, demo, onDone }: { user: User | null; demo: boolean; onDone: () => void }) {
  const { t } = useT()
  // В демо (и без юзера) поллить нечего — сразу показываем успех.
  const [status, setStatus] = useState<'waiting' | 'ok' | 'timeout'>(demo || !user ? 'ok' : 'waiting')
  const [attempt, setAttempt] = useState(0)
  // baseline снимаем один раз: старый last_ingest_at (до гайда) — не успех.
  // При смене юзера (logout/login внутри шага) baseline переснимаем.
  const baseline = useRef<string | null | undefined>(undefined)
  const baselineUid = useRef<string | null>(null)

  useEffect(() => {
    if (demo || !user || status !== 'waiting') return
    let cancelled = false
    const ctrl = new AbortController()
    ;(async () => {
      if (baseline.current === undefined || baselineUid.current !== user.id) {
        baselineUid.current = user.id
        baseline.current = (await loadToken(user.id))?.last_ingest_at ?? null
      }
      const res = await waitForFirstIngest(
        async () => (await loadToken(user.id))?.last_ingest_at ?? null,
        { baseline: baseline.current, signal: ctrl.signal },
      )
      if (!cancelled && res !== 'aborted') setStatus(res)
    })()
    return () => { cancelled = true; ctrl.abort() }
  }, [user, demo, attempt, status])

  return (
    <div className="guide-content" role="status" aria-live="polite">
      {status === 'waiting' ? (
        <>
          <m.div
            className="guide-pulse"
            animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.9, 0.45] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
          />
          <h2>{t('Проверим связь')}</h2>
          <p>{t('Открой Health Auto Export и нажми Manual Export — мы ждём данные.')}</p>
          <p style={{ opacity: 0.5, fontSize: 13 }}>{t('Слушаем эфир…')}</p>
        </>
      ) : status === 'ok' ? (
        <>
          <m.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }}>
            <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden="true">
              <circle cx="44" cy="44" r="40" stroke="var(--green, #34d399)" strokeWidth="3" />
              <m.path
                d="M28 46l11 11 21-25"
                stroke="var(--green, #34d399)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 0.4 }}
              />
            </svg>
          </m.div>
          <h2 className="guide-success">{t('Данные пришли!')}</h2>
          <p>{t('Первые графики появятся после следующей синхронизации.')}</p>
          <button className="guide-cta" style={{ border: 'none', cursor: 'pointer' }} onClick={onDone}>
            {t('В приложение')}
          </button>
        </>
      ) : (
        <>
          <h2>{t('Пока ничего не пришло. Проверь:')}</h2>
          <ul className="guide-checklist">
            {CHECKLIST.map(item => <li key={item}>• {t(item)}</li>)}
          </ul>
          <button
            className="guide-cta" style={{ border: 'none', cursor: 'pointer' }}
            onClick={() => { setStatus('waiting'); setAttempt(a => a + 1) }}
          >
            {t('Проверить ещё раз')}
          </button>
        </>
      )}
    </div>
  )
}
