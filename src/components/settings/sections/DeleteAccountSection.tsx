import { useState } from 'react'
import { useT } from '../../../lib/i18n'
import { callFunction, EdgeFunctionError } from '../../../lib/edgeFunctions'
import { supabase } from '../../../lib/supabase'
import { isDemoActive } from '../../../lib/demo'

// Danger zone: complete account deletion (beta-safety PR 6).
// The server re-verifies the password and requires the literal word DELETE;
// this UI mirrors those requirements so the user cannot submit a doomed call.

export function DeleteAccountSection() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmWord, setConfirmWord] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const demo = isDemoActive()

  const ready = confirmWord === 'DELETE' && password.length > 0 && !deleting

  async function handleDelete() {
    if (!ready) return
    setDeleting(true)
    setError(null)
    try {
      await callFunction('delete-account', { password, confirm: confirmWord })
      await supabase.auth.signOut()
      window.location.assign('/')
    } catch (e) {
      const code = e instanceof EdgeFunctionError ? e.code : undefined
      if (code === 'reauth_failed') setError(t('Неверный пароль. Аккаунт не удалён.'))
      else if (code === 'rate_limited') setError(t('Слишком много попыток. Попробуй через час.'))
      else setError(t('Не удалось удалить аккаунт. Попробуй ещё раз.'))
      setDeleting(false)
    }
  }

  return (
    <section className="settings-section" data-testid="delete-account-section">
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6M10 11v6M14 11v6"/></svg>
        {t('Удаление аккаунта')}
      </h3>
      <p className="settings-muted">
        {t('Безвозвратно удаляет аккаунт и все данные: метрики, сон, анализы, чат, фото, токены и интеграции. Отменить нельзя.')}
      </p>
      <p className="settings-muted" style={{ marginTop: 8 }}>
        {t('Сначала скачай бэкап в разделе «Экспорт данных» — после удаления данные восстановить невозможно.')}
      </p>
      {demo ? (
        <p className="settings-muted" style={{ marginTop: 8 }}>{t('В демо-режиме удаление недоступно.')}</p>
      ) : !open ? (
        <button className="btn-secondary" style={{ marginTop: 10, color: 'var(--danger, #d33)' }} onClick={() => setOpen(true)}>
          {t('Удалить аккаунт…')}
        </button>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
          <label className="settings-muted" style={{ fontSize: 13 }}>
            {t('Пароль (подтверждение личности)')}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label className="settings-muted" style={{ fontSize: 13 }}>
            {t('Введи DELETE для подтверждения')}
            <input
              type="text"
              autoComplete="off"
              value={confirmWord}
              onChange={e => setConfirmWord(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          {error && <div style={{ color: 'var(--danger, #d33)', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" disabled={!ready} style={{ color: 'var(--danger, #d33)' }} onClick={handleDelete}>
              {deleting ? '…' : t('Удалить навсегда')}
            </button>
            <button className="btn-secondary" disabled={deleting} onClick={() => { setOpen(false); setPassword(''); setConfirmWord(''); setError(null) }}>
              {t('Отмена')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
