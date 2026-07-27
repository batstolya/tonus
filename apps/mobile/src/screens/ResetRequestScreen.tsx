import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput } from 'react-native'
import { getSupabase } from '../supabase'
import { form } from './formStyles'

// The redirect must match an entry in Supabase → Authentication → URL
// Configuration → Redirect URLs, otherwise the email link refuses to redirect.
// The tonus:// scheme is declared in app.json.
const RESET_REDIRECT = 'tonus://reset'

interface Props {
  onBack: () => void
  /** Почему человек здесь оказался: например, ссылка из письма уже протухла. */
  notice?: string | null
}

export function ResetRequestScreen({ onBack, notice }: Props) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: RESET_REDIRECT,
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <KeyboardAvoidingView
      style={form.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={form.title}>Сброс пароля</Text>
      {notice && !sent ? <Text style={form.error}>{notice}</Text> : null}
      {sent ? (
        <Text style={form.hint}>
          Письмо отправлено. Откройте ссылку из него на этом телефоне — приложение
          само предложит задать новый пароль.
        </Text>
      ) : (
        <>
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
          {error ? <Text style={form.error}>{error}</Text> : null}
          <Pressable style={form.primary} onPress={submit} disabled={busy}>
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={form.primaryText}>Отправить письмо</Text>}
          </Pressable>
        </>
      )}
      <Pressable onPress={onBack}>
        <Text style={form.link}>Назад</Text>
      </Pressable>
    </KeyboardAvoidingView>
  )
}
