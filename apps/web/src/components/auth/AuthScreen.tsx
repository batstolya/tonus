import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useT } from '../../lib/i18n'
import TelegramDemo from './TelegramDemo'
import { Icon } from '../../lib/icons'

type Mode = 'login' | 'signup' | 'reset' | 'sent' | 'reset-sent'

export function AuthScreen({ onBack }: { onBack?: () => void } = {}) {
  const { t } = useT()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function switchMode(m: Mode) { setMode(m); setError(null); setConfirm('') }

  async function handleGoogle() {
    setGoogleLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) { setError(error.message); setGoogleLoading(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (mode === 'signup') {
      if (password !== confirm) { setError(t('Пароли не совпадают')); setLoading(false); return }
      const { error } = await supabase.auth.signUp({ email, password })
      setLoading(false)
      if (error) setError(error.message)
      else setMode('sent')

    } else if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) setError(error.message === 'Invalid login credentials'
        ? t('Неверный email или пароль')
        : error.message)

    } else if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}?reset=1`,
      })
      setLoading(false)
      if (error) setError(error.message)
      else setMode('reset-sent')
    }
  }

  // Confirmation sent
  if (mode === 'sent') return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-sent">
          <div className="auth-sent-icon"><Icon name="envelope" size={40} /></div>
          <h2>{t('Подтверди email')}</h2>
          <p>{t('Письмо отправлено на')} <strong>{email}</strong>.<br />{t('Перейди по ссылке в письме, затем войди.')}</p>
          <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => switchMode('login')}>{t('Войти')}</button>
        </div>
      </div>
    </div>
  )

  // Password reset sent
  if (mode === 'reset-sent') return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-sent">
          <div className="auth-sent-icon"><Icon name="key" size={40} /></div>
          <h2>{t('Письмо отправлено')}</h2>
          <p>{t('Проверь')} <strong>{email}</strong> — {t('там ссылка для сброса пароля.')}</p>
          <button className="btn-ghost" onClick={() => switchMode('login')}>{t('Вернуться ко входу')}</button>
        </div>
      </div>
    </div>
  )

  // Password reset form
  if (mode === 'reset') return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Tonus</h1>
        <p className="auth-subtitle">{t('Восстановление пароля')}</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required autoFocus />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '…' : t('Отправить ссылку')}
          </button>
          <button type="button" className="btn-ghost" onClick={() => switchMode('login')}>
            {t('Вернуться ко входу')}
          </button>
        </form>
      </div>
    </div>
  )

  // Main login / signup
  return (
    <div className="auth-screen">
      <div className="auth-layout">
        <div className="auth-card">
        {onBack && (
          <button type="button" className="btn-ghost auth-back" onClick={onBack}>
            ← {t('На главную')}
          </button>
        )}
        <h1>Tonus</h1>
        <p className="auth-subtitle">{t('Личный хаб здоровья')}</p>

        <button className="btn-google" onClick={handleGoogle} disabled={googleLoading}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.705A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.705V4.963H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.963L3.964 6.295C4.672 4.169 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {googleLoading ? t('Открываем Google…') : t('Войти через Google')}
        </button>

        <div className="auth-divider"><span>{t('или')}</span></div>

        <div className="auth-tabs">
          <button className={mode === 'login' ? 'auth-tab active' : 'auth-tab'} onClick={() => switchMode('login')}>{t('Вход')}</button>
          <button className={mode === 'signup' ? 'auth-tab active' : 'auth-tab'} onClick={() => switchMode('signup')}>{t('Регистрация')}</button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required autoFocus />
          </label>
          <label>
            {t('Пароль')}
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? t('Минимум 6 символов') : '••••••••'} required minLength={6} />
          </label>
          {mode === 'signup' && (
            <label>
              {t('Повтори пароль')}
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••" required minLength={6} />
            </label>
          )}
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '…' : mode === 'signup' ? t('Создать аккаунт') : t('Войти')}
          </button>
          {mode === 'login' && (
            <button type="button" className="btn-ghost" onClick={() => switchMode('reset')}>
              {t('Забыл пароль')}
            </button>
          )}
        </form>
        </div>
        <TelegramDemo />
      </div>
    </div>
  )
}
