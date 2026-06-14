import { useState } from 'react'
import { supabase } from '../../lib/supabase'

type Mode = 'login' | 'sent'

export function AuthScreen() {
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState<Mode>('login')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setLoading(false)
    if (error) setError(error.message)
    else setMode('sent')
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) { setError(error.message); setGoogleLoading(false) }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Tonus</h1>
        <p className="auth-subtitle">Личный хаб здоровья</p>

        {mode === 'sent' ? (
          <div className="auth-sent">
            <div className="auth-sent-icon">✉️</div>
            <h2>Проверь почту</h2>
            <p>Мы отправили ссылку для входа на <strong>{email}</strong></p>
            <button className="btn-ghost" onClick={() => setMode('login')}>
              Изменить email
            </button>
          </div>
        ) : (
          <>
            <button className="btn-google" onClick={handleGoogle} disabled={googleLoading}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.705A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.705V4.963H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.963L3.964 6.295C4.672 4.169 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              {googleLoading ? 'Открываем Google…' : 'Войти через Google'}
            </button>

            <div className="auth-divider"><span>или</span></div>

            <form onSubmit={handleSubmit} className="auth-form">
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </label>
              {error && <p className="auth-error">{error}</p>}
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Отправляем…' : 'Войти по ссылке на почту'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
