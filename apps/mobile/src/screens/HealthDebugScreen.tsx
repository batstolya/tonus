import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { HealthReadings } from '@tonus/shared'
import { checkAvailability, readHealthReadings, requestHealthAccess } from '../health/read'

const DAYS = 7

// Экран-стенд фазы 3a: показывает, ЧТО приложение прочитало из Здоровья, и
// ничего не отправляет. Смысл в том, чтобы сверить цифры с приложением
// «Здоровье» на том же устройстве до того, как эти данные поедут на сервер:
// расхождение здесь — ошибка сопоставления метрик, и чинить её надо раньше,
// чем она попадёт в базу.
export function HealthDebugScreen({ onBack }: { onBack: () => void }) {
  const [readings, setReadings] = useState<HealthReadings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setBusy(true)
    setError(null)
    try {
      const availability = checkAvailability()
      if (!availability.available) {
        setError(availability.reason ?? 'Здоровье недоступно.')
        return
      }
      await requestHealthAccess()
      setReadings(await readHealthReadings(DAYS))
    } catch (e) {
      // Отказ в доступе и пустое разрешение выглядят одинаково — показываем
      // текст ошибки как есть, чтобы не гадать за пользователя.
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // Читаем сразу при открытии: экран отладочный, лишний тап тут только мешает,
  // в том числе автоматической проверке. Через setTimeout, потому что load()
  // первым делом ставит busy, а синхронный setState внутри эффекта — это
  // каскадные перерисовки (правило react-hooks ловит его справедливо).
  useEffect(() => {
    const id = setTimeout(() => { void load() }, 0)
    return () => { clearTimeout(id) }
  }, [])

  const sums = readings?.sums ?? []
  const averages = readings?.averages ?? []
  const sleep = readings?.sleep ?? []
  const isEmpty = readings !== null && !sums.length && !averages.length && !sleep.length

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Здоровье: что прочитали</Text>
      <Text style={styles.subtitle}>Последние {DAYS} дней. Ничего не отправляется.</Text>

      <Pressable style={styles.primary} onPress={load} disabled={busy}>
        {busy
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.primaryText}>{readings ? 'Обновить' : 'Прочитать'}</Text>}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isEmpty ? (
        <Text style={styles.hint}>
          Данных нет. В симуляторе это нормально: Здоровье там пустое, пока не
          добавишь записи вручную в приложении «Здоровье».
        </Text>
      ) : null}

      {sums.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Суммы за день (по источникам)</Text>
          {sums.map((r, i) => (
            <View key={`${r.hae}-${r.date}-${r.device}-${i}`} style={styles.row}>
              <Text style={styles.rowKey}>{r.date}  {r.hae}</Text>
              <Text style={styles.rowValue}>{round(r.value)} {r.units} · {r.device}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {averages.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Средние за день</Text>
          {averages.map((r, i) => (
            <View key={`${r.hae}-${r.date}-${i}`} style={styles.row}>
              <Text style={styles.rowKey}>{r.date}  {r.hae}</Text>
              <Text style={styles.rowValue}>{round(r.avg)} ({round(r.min)}–{round(r.max)}) {r.units}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {sleep.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Сон</Text>
          {sleep.map(s => (
            <View key={s.date} style={styles.row}>
              <Text style={styles.rowKey}>{s.date}</Text>
              <Text style={styles.rowValue}>
                {round(s.totalHours)} ч · глубокий {round(s.deepHours)} · REM {round(s.remHours)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable onPress={onBack}>
        <Text style={styles.link}>Назад</Text>
      </Pressable>
    </ScrollView>
  )
}

function round(value: number | null): string {
  if (value == null) return '—'
  return value >= 100 ? String(Math.round(value)) : value.toFixed(1)
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 72, gap: 12 },
  title: { fontSize: 26, fontWeight: '600' },
  subtitle: { fontSize: 14, opacity: 0.6, marginBottom: 4 },
  primary: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  section: { marginTop: 16, gap: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowKey: { fontSize: 13, opacity: 0.7, flexShrink: 1 },
  rowValue: { fontSize: 13, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 15, lineHeight: 21, color: '#333' },
  error: { color: '#c0362c', fontSize: 14 },
  link: { textAlign: 'center', color: '#555', paddingVertical: 16, fontSize: 15 },
})
