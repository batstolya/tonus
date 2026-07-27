import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { APP_NAME, disableDemo } from '@tonus/shared'
import { useAuth } from './src/useAuth'
import { useResetDeepLink } from './src/useResetDeepLink'
import { useDebugLink } from './src/useDebugLink'
import { useForegroundSync } from './src/useHealthSync'
import { getSupabase } from './src/supabase'
import { AuthScreen } from './src/screens/AuthScreen'
import { ResetRequestScreen } from './src/screens/ResetRequestScreen'
import { ResetPasswordScreen } from './src/screens/ResetPasswordScreen'
import { HealthDebugScreen } from './src/screens/HealthDebugScreen'
import { TodayScreen } from './src/screens/TodayScreen'

// env and platform are wired by src/bootstrap.ts, imported first from index.ts.

export default function App() {
  const { user, loading, passwordRecovery, setPasswordRecovery } = useAuth()
  const [screen, setScreen] = useState<'auth' | 'reset-request'>('auth')
  const [demo, setDemo] = useState(false)
  const [health, setHealth] = useState(false)
  const debugLink = useDebugLink()
  const recoveryLink = useResetDeepLink()
  // Отправка в Здоровье → сервер работает только у вошедшего человека и только
  // если он сам её включил (по умолчанию выключена, см. health/sync.ts).
  useForegroundSync(!!user && !demo)

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <StatusBar style="auto" />
      </View>
    )
  }

  // Recovery wins over everything: the user arrived here from an email link
  // and the only sensible next step is setting a password.
  if (passwordRecovery) {
    return <ResetPasswordScreen onDone={() => setPasswordRecovery(false)} />
  }

  // Ссылка из письма протухла. Показываем это независимо от того, вошёл ли
  // человек: тапнуть по старому письму, уже будучи в аккаунте, — обычное дело,
  // и молчание в этом случае выглядит как поломка.
  if (recoveryLink.error) {
    return (
      <ResetRequestScreen
        onBack={() => { recoveryLink.clearError(); setScreen('auth') }}
        notice={recoveryLink.error}
      />
    )
  }

  if (!user && !demo) {
    return screen === 'reset-request'
      ? <ResetRequestScreen onBack={() => setScreen('auth')} />
      : (
        <AuthScreen
          onDemo={() => setDemo(true)}
          onForgotPassword={() => setScreen('reset-request')}
        />
      )
  }

  // Отладочный экран Здоровья: тапом из подвала Today и по ссылке
  // tonus://health — вторая дорога нужна, чтобы CI снимал его без человека.
  if (health || debugLink.health) {
    return <HealthDebugScreen onBack={() => { setHealth(false); debugLink.close() }} />
  }

  // Демо пока показывает заглушку: фикстурные данные для Today появятся вместе
  // с демо-режимом, а до тех пор честнее не притворяться.
  if (demo) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{APP_NAME}</Text>
        <Text style={styles.subtitle}>демо-режим</Text>
        <Pressable onPress={() => { disableDemo(); setDemo(false) }}>
          <Text style={styles.signOut}>Выйти</Text>
        </Pressable>
        <StatusBar style="auto" />
      </View>
    )
  }

  return (
    <>
      <TodayScreen
        userId={user?.id}
        email={user?.email}
        onSignOut={() => { void getSupabase().auth.signOut() }}
        onOpenHealth={() => setHealth(true)}
      />
      <StatusBar style="auto" />
    </>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '600' },
  subtitle: { fontSize: 16, opacity: 0.6 },
  action: { marginTop: 18, fontSize: 15, color: '#111', fontWeight: '600' },
  signOut: { marginTop: 10, fontSize: 15, color: '#555' },
})
