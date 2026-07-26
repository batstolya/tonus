import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput } from 'react-native'
import { enableDemo } from '@tonus/shared'
import { getSupabase } from '../supabase'
import { form } from './formStyles'

interface Props {
  onDemo: () => void
  onForgotPassword: () => void
}

export function AuthScreen({ onDemo, onForgotPassword }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    setNotice(null)
    const auth = getSupabase().auth
    const credentials = { email: email.trim(), password }
    const { data, error } = mode === 'signup'
      ? await auth.signUp(credentials)
      : await auth.signInWithPassword(credentials)
    setBusy(false)

    if (error) {
      // A user who signed up with Google on the web has no password at all, so
      // the server's generic "Invalid login credentials" reads as if they
      // mistyped. Mobile has no Google sign-in (spec decision 1), so say it.
      setError(
        error.message.toLowerCase().includes('invalid login')
          ? 'Неверная почта или пароль. Если вы регистрировались через Google, задайте пароль в веб-версии.'
          : error.message,
      )
      return
    }
    // Sign-up with email confirmation on returns no session — without this the
    // screen would just sit there looking broken.
    if (mode === 'signup' && !data.session) {
      setNotice('Проверьте почту — мы отправили письмо для подтверждения.')
    }
  }

  return (
    <KeyboardAvoidingView
      style={form.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={form.title}>Tonus</Text>
      <TextInput
        style={form.input}
        placeholder="Почта"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextInput
        style={form.input}
        placeholder="Пароль"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType={mode === 'signup' ? 'newPassword' : 'password'}
      />
      {error ? <Text style={form.error}>{error}</Text> : null}
      {notice ? <Text style={form.hint}>{notice}</Text> : null}

      <Pressable style={form.primary} onPress={submit} disabled={busy}>
        {busy
          ? <ActivityIndicator color="#fff" />
          : <Text style={form.primaryText}>{mode === 'signup' ? 'Зарегистрироваться' : 'Войти'}</Text>}
      </Pressable>

      <Pressable onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null) }}>
        <Text style={form.link}>{mode === 'signin' ? 'Создать аккаунт' : 'У меня уже есть аккаунт'}</Text>
      </Pressable>
      <Pressable onPress={onForgotPassword}>
        <Text style={form.link}>Забыли пароль?</Text>
      </Pressable>
      <Pressable onPress={() => { enableDemo(); onDemo() }}>
        <Text style={form.link}>Посмотреть демо</Text>
      </Pressable>
    </KeyboardAvoidingView>
  )
}
