import { useState } from 'react'
import { supabase } from '../../lib/supabase'

type Mode = 'login' | 'sent'

export function AuthScreen() {
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState<Mode>('login')
  const [loading, setLoading] = useState(false)
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
    if (error) {
      setError(error.message)
    } else {
      setMode('sent')
    }
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
              {loading ? 'Отправляем…' : 'Войти по ссылке'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
