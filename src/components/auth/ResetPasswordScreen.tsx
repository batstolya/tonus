import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useT } from '../../lib/i18n'

interface Props {
  onDone: () => void
}

export function ResetPasswordScreen({ onDone }: Props) {
  const { t } = useT()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError(t('Пароли не совпадают')); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Tonus</h1>
        <p className="auth-subtitle">{t('Установи новый пароль')}</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            {t('Новый пароль')}
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={t('Минимум 6 символов')} required minLength={6} autoFocus />
          </label>
          <label>
            {t('Повтори пароль')}
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••" required minLength={6} />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '…' : t('Сохранить пароль')}
          </button>
        </form>
      </div>
    </div>
  )
}
