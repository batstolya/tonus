import { StatusBar } from 'expo-status-bar'
import { StyleSheet, Text, View } from 'react-native'
import { APP_NAME } from '@tonus/shared'

// Phase 2 scaffold: the only job of this screen is to render a value that came
// from the shared workspace package, proving Metro resolves it at runtime and
// not just at type level.
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{APP_NAME}</Text>
      <Text style={styles.subtitle}>mobile skeleton</Text>
      <StatusBar style="auto" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
  },
})
