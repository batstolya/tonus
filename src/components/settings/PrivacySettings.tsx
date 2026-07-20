import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../lib/i18n'
import { loadPinHash, setPin, isUnlocked, lock } from '../../lib/privacy'

// Карточка «Приватность»: PIN для скрытия деликатных записей (Проблемы).
// Защита от чужих глаз на экране, не шифрование — анализ видит всё.
export function PrivacySettings({ user }: { user: User }) {
  const { t } = useT()
  const [pinSet, setPinSet] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(isUnlocked())

  useEffect(() => {
    loadPinHash(user.id).then(h => { setPinSet(!!h); setLoaded(true) })
  }, [user.id])

  async function handleSave() {
    if (next.length < 4) { setMsg(t('PIN — минимум 4 символа')); return }
    const res = await setPin(user.id, next, current || undefined)
    if (res === 'wrong_current') { setMsg(t('Неверный текущий PIN')); return }
    setPinSet(true); setUnlocked(true); setCurrent(''); setNext('')
    setMsg(t('PIN сохранён'))
  }

  if (!loaded) return null

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        {t('Приватность')}
      </h3>
      <p className="settings-muted" style={{ marginBottom: 10 }}>
        {t('PIN скрывает помеченные проблемы от посторонних глаз на экране. Анализ и ИИ учитывают их как обычно.')}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {pinSet && (
          <input className="log-input" type="password" inputMode="numeric" style={{ width: 140 }}
            placeholder={t('Текущий PIN')} value={current} onChange={e => setCurrent(e.target.value)} />
        )}
        <input className="log-input" type="password" inputMode="numeric" style={{ width: 140 }}
          placeholder={pinSet ? t('Новый PIN') : 'PIN'} value={next}
          onChange={e => setNext(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()} />
        <button className="btn-secondary" onClick={handleSave} disabled={!next}>
          {pinSet ? t('Сменить PIN') : t('Задать PIN')}
        </button>
        {pinSet && unlocked && (
          <button className="link-btn"
            onClick={() => { lock(); setUnlocked(false); setMsg(t('Заблокировано')) }}>
            {t('Заблокировать сейчас')}
          </button>
        )}
      </div>
      {msg && <p className="settings-muted" style={{ marginTop: 8 }}>{msg}</p>}
    </section>
  )
}
