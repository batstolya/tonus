import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { APP_NAME, disableDemo } from '@tonus/shared'
import { useAuth } from './src/useAuth'
import { useResetDeepLink } from './src/useResetDeepLink'
import { getSupabase } from './src/supabase'
import { AuthScreen } from './src/screens/AuthScreen'
import { ResetRequestScreen } from './src/screens/ResetRequestScreen'
import { ResetPasswordScreen } from './src/screens/ResetPasswordScreen'
import { TodayScreen } from './src/screens/TodayScreen'

// env and platform are wired by src/bootstrap.ts, imported first from index.ts.

export default function App() {
  const { user, loading, passwordRecovery, setPasswordRecovery } = useAuth()
  const [screen, setScreen] = useState<'auth' | 'reset-request'>('auth')
  const [demo, setDemo] = useState(false)
  useResetDeepLink()

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

  // Дом вошедшего пользователя — экран Today. Демо пока показывает ту же
  // заглушку: фикстурные данные для него появятся вместе с демо-режимом.
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
      />
      <StatusBar style="auto" />
    </>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '600' },
  subtitle: { fontSize: 16, opacity: 0.6 },
  signOut: { marginTop: 18, fontSize: 15, color: '#555' },
})
