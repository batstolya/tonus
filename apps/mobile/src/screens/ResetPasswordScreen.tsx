import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput } from 'react-native'
import { getSupabase } from '../supabase'
import { form } from './formStyles'

// Reached only through the recovery deep link: useResetDeepLink() feeds the
// tokens to setSession(), supabase emits PASSWORD_RECOVERY, and App routes here.
export function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    const { error } = await getSupabase().auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <KeyboardAvoidingView
      style={form.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={form.title}>Новый пароль</Text>
      <TextInput
        style={form.input}
        placeholder="Новый пароль"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
      />
      {error ? <Text style={form.error}>{error}</Text> : null}
      <Pressable style={form.primary} onPress={submit} disabled={busy}>
        {busy
          ? <ActivityIndicator color="#fff" />
          : <Text style={form.primaryText}>Сохранить</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  )
}
