import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { TodayData } from '@tonus/shared'
import { Sparkline } from '../components/Sparkline'
import { useTodayData } from '../useTodayData'

interface Props {
  userId: string | undefined
  email: string | null | undefined
  onSignOut: () => void
}

// Экран «как я сегодня». Одна страница, без вкладок: телефон отвечает на этот
// вопрос за десять секунд, а копать вглубь остаётся веб.
export function TodayScreen({ userId, email, onSignOut }: Props) {
  const { data, loading, refreshing, error, refresh } = useTodayData(userId)

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {data?.staleDays != null && data.staleDays >= 2 ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Данные не обновлялись {data.staleDays} {plural(data.staleDays, 'день', 'дня', 'дней')}.
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error}>
          Не удалось обновить данные{data ? ' — показаны последние загруженные' : ''}. {error}
        </Text>
      ) : null}

      {data && !data.hasData ? <EmptyState /> : null}

      {data?.latest ? <Scores data={data} /> : null}

      <Pressable onPress={onSignOut} style={styles.footer}>
        <Text style={styles.footerText}>{email ?? 'Выйти'} · выйти</Text>
      </Pressable>
    </ScrollView>
  )
}

function Scores({ data }: { data: TodayData }) {
  const { latest, trend, sleep, activity } = data
  if (!latest) return null
  const { score } = latest

  return (
    <>
      <Text style={styles.label}>
        {latest.isToday ? 'Готовность сегодня' : `Готовность за ${formatDate(latest.date)}`}
      </Text>
      {score.readiness != null
        ? <Text style={styles.hero}>{score.readiness}</Text>
        : <Text style={styles.heroEmpty}>нет оценки</Text>}
      <Text style={styles.reading}>{readingFor(score.readiness)}</Text>

      <View style={styles.trend}>
        <Sparkline
          points={trend.map(p => p.readiness)}
          width={280}
          height={48}
        />
        <Text style={styles.trendLabel}>{trend.length} дней</Text>
      </View>

      <View style={styles.row}>
        <Stat title="Восстановление" value={score.recovery_score} />
        <Stat title="Сон" value={score.sleep_score} />
        <Stat title="Стресс" value={score.stress_score} />
      </View>

      {sleep ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Сон</Text>
          <Text style={styles.cardValue}>{sleep.hours.toFixed(1)} ч</Text>
          <Text style={styles.cardHint}>
            глубокий {fmt(sleep.deep)} · REM {fmt(sleep.rem)}
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Активность</Text>
        <Text style={styles.cardValue}>
          {activity.steps != null ? Math.round(activity.steps).toLocaleString('ru') : '—'} шагов
        </Text>
        <Text style={styles.cardHint}>
          {activity.exerciseMinutes != null ? `${Math.round(activity.exerciseMinutes)} мин упражнений · ` : ''}
          {activity.goalMet ? 'цель дня закрыта' : 'цель дня не закрыта'}
        </Text>
      </View>
    </>
  )
}

function EmptyState() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Данных пока нет</Text>
      <Text style={styles.cardHint}>
        Показатели появятся после первой синхронизации с Apple Health. Если вы
        пользуетесь Health Auto Export, данные подтянутся автоматически.
      </Text>
    </View>
  )
}

function Stat({ title, value }: { title: string; value: number | null }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value ?? '—'}</Text>
      <Text style={styles.statTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{title}</Text>
    </View>
  )
}

const fmt = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)} ч`)

function formatDate(iso: string): string {
  const [, month, day] = iso.split('-')
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
  return `${Number(day)} ${months[Number(month) - 1] ?? ''}`
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

function readingFor(readiness: number | null): string {
  if (readiness == null) return 'Недостаточно данных для оценки'
  if (readiness >= 75) return 'Хороший день для нагрузки'
  if (readiness >= 60) return 'Обычный день, без рекордов'
  if (readiness >= 45) return 'Лучше снизить нагрузку'
  return 'Организму нужен отдых'
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 72, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  banner: { backgroundColor: '#fdf3e7', borderRadius: 10, padding: 12, marginBottom: 16 },
  bannerText: { fontSize: 14, color: '#7a4b12' },
  error: { color: '#c0362c', fontSize: 14, marginBottom: 12 },
  label: { fontSize: 15, opacity: 0.6 },
  hero: { fontSize: 72, fontWeight: '700', lineHeight: 80 },
  heroEmpty: { fontSize: 34, fontWeight: '600', lineHeight: 44, opacity: 0.35 },
  reading: { fontSize: 17, marginTop: -4 },
  trend: { marginTop: 20, gap: 4 },
  trendLabel: { fontSize: 12, opacity: 0.5 },
  row: { flexDirection: 'row', gap: 12, marginTop: 24 },
  stat: { flex: 1, backgroundColor: '#f6f6f6', borderRadius: 12, padding: 12 },
  statValue: { fontSize: 24, fontWeight: '600' },
  statTitle: { fontSize: 11, opacity: 0.6, marginTop: 2 },
  card: { backgroundColor: '#f6f6f6', borderRadius: 12, padding: 16, marginTop: 12 },
  cardTitle: { fontSize: 13, opacity: 0.6 },
  cardValue: { fontSize: 22, fontWeight: '600', marginTop: 2 },
  cardHint: { fontSize: 13, opacity: 0.7, marginTop: 4, lineHeight: 19 },
  footer: { marginTop: 32, alignItems: 'center' },
  footerText: { fontSize: 13, opacity: 0.5 },
})
