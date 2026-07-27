import { describe, expect, it } from 'vitest'
import { loadTodayData, DISPLAY_DAYS, FETCH_DAYS } from './todayData'

// Поддельный клиент: цепочка supabase-js возвращает саму себя, пока не дойдёт
// до await. Так модуль проверяется без сети, без устройства и без аккаунта —
// ради этого клиент и передаётся аргументом, а не берётся синглтоном.
function fakeClient(rows: Record<string, unknown[]>) {
  const chain = (table: string) => {
    const self: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'lte', 'order', 'limit']) self[m] = () => self
    self.then = (resolve: (v: unknown) => void) => resolve({ data: rows[table] ?? [], error: null })
    self.maybeSingle = () => Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null })
    return self
  }
  return { from: (table: string) => chain(table) }
}

const NOW = new Date('2026-07-27T09:00:00Z')

function dayBefore(offset: number): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() - offset)
  return d.toISOString().slice(0, 10)
}

/** Ряд длиной FETCH_DAYS: по четыре метрики на день, как в metrics_daily. */
function metricRows(days = FETCH_DAYS) {
  const rows: unknown[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = dayBefore(i)
    rows.push(
      { date, metric: 'hrv', avg_val: 40 + (i % 7) },
      { date, metric: 'restingHeartRate', avg_val: 55 },
      { date, metric: 'steps', sum_val: 8000 },
      { date, metric: 'exerciseMinutes', sum_val: 35 },
    )
  }
  return rows
}

const sleepRows = (days = FETCH_DAYS) =>
  Array.from({ length: days }, (_, i) => ({
    date: dayBefore(i), duration_hours: 7.5, deep_hours: 1.2, rem_hours: 1.8,
  }))

describe('loadTodayData', () => {
  it('fetches enough history for the baselines, not just the visible window', () => {
    // computeDailyScores отбрасывает дни, у которых меньше 5 предшествующих, и
    // строит базовую линию по 30. Запросить ровно окно показа значит показать
    // меньше точек И посчитать их по обрезанной истории — числа разойдутся с
    // вебом, причём выглядеть будут правдоподобно.
    expect(FETCH_DAYS).toBeGreaterThanOrEqual(DISPLAY_DAYS + 30)
  })

  it('returns at most DISPLAY_DAYS trend points, oldest first', async () => {
    const data = await loadTodayData(
      fakeClient({ metrics_daily: metricRows(), sleep_sessions: sleepRows() }) as never,
      'u',
      NOW,
    )
    expect(data.trend.length).toBeGreaterThan(0)
    expect(data.trend.length).toBeLessThanOrEqual(DISPLAY_DAYS)
    expect(data.trend.at(-1)?.date).toBe(dayBefore(0))
    expect(data.trend[0].date < data.trend[data.trend.length - 1].date).toBe(true)
  })

  it('reports no data rather than zeroes on an empty account', async () => {
    const data = await loadTodayData(fakeClient({}) as never, 'u', NOW)
    expect(data.hasData).toBe(false)
    expect(data.latest).toBeNull()
    expect(data.trend).toEqual([])
  })

  it('falls back to the freshest day that has a score, and says so', async () => {
    // Утро: сегодняшние данные ещё не приехали. Показывать пустой экран, когда
    // вчерашние цифры есть, — хуже, чем показать вчерашние и пометить дату.
    // Убираем за сегодня ВСЁ, включая сон: одной ночи достаточно, чтобы день
    // получил оценку, — частичные данные это тоже данные.
    const rows = metricRows().filter(r => (r as { date: string }).date !== dayBefore(0))
    const nights = sleepRows().filter(r => r.date !== dayBefore(0))
    const data = await loadTodayData(
      fakeClient({ metrics_daily: rows, sleep_sessions: nights }) as never,
      'u',
      NOW,
    )
    expect(data.latest?.date).toBe(dayBefore(1))
    expect(data.latest?.isToday).toBe(false)
  })

  it('picks the freshest day that actually has a readiness, not merely a score row', async () => {
    // У дня может быть строка оценок, но readiness = null (нет ВСР и пульса
    // покоя, есть только сон). Показывать такой день героем — значит вывести
    // «недостаточно данных» поверх экрана, полного данных.
    const rows = metricRows().filter(r => {
      const row = r as { date: string; metric: string }
      return row.date !== dayBefore(0) || row.metric === 'steps'
    })
    // И сон тоже: по одному сну готовность считается, а нам нужен день,
    // где данных на оценку не хватает, — как это было 26 июля на настоящем
    // аккаунте.
    const nights = sleepRows().filter(r => r.date !== dayBefore(0))
    const data = await loadTodayData(
      fakeClient({ metrics_daily: rows, sleep_sessions: nights }) as never,
      'u',
      NOW,
    )
    expect(data.latest?.score.readiness).not.toBeNull()
    expect(data.latest?.date).toBe(dayBefore(1))
  })

  it('counts staleness from the freshest of import and auto-sync', async () => {
    const data = await loadTodayData(
      fakeClient({
        metrics_daily: metricRows(),
        sleep_sessions: sleepRows(),
        ingest_tokens: [{ last_ingest_at: '2026-07-24T00:00:00Z' }],
        imports: [{ imported_at: '2026-07-26T00:00:00Z' }],
      }) as never,
      'u',
      NOW,
    )
    // Свежайший сигнал — импорт 26-го: один день, а не три по автосинку.
    expect(data.staleDays).toBe(1)
  })

  it('reads exercise minutes, which the daily_metrics view does not carry', async () => {
    // Ловушка из истории проекта: exerciseMinutes живёт только в длинной
    // таблице, во вью его нет. Отсюда и запрос к metrics_daily напрямую.
    const data = await loadTodayData(
      fakeClient({ metrics_daily: metricRows(), sleep_sessions: sleepRows() }) as never,
      'u',
      NOW,
    )
    expect(data.activity.exerciseMinutes).toBe(35)
    expect(data.activity.goalMet).toBe(true)
  })

  it('treats the day goal the same way the web does', async () => {
    const rows = metricRows().map(r => {
      const row = r as { metric: string; sum_val?: number }
      if (row.metric === 'steps') return { ...row, sum_val: 3000 }
      if (row.metric === 'exerciseMinutes') return { ...row, sum_val: 10 }
      return row
    })
    const data = await loadTodayData(
      fakeClient({ metrics_daily: rows, sleep_sessions: sleepRows() }) as never,
      'u',
      NOW,
    )
    // 7000 шагов ИЛИ 30 минут — ни того, ни другого.
    expect(data.activity.goalMet).toBe(false)
  })

  it('takes the longest sleep session of the night when there are fragments', async () => {
    const nights = [
      { date: dayBefore(0), duration_hours: 1.1, deep_hours: 0.2, rem_hours: 0.1 },
      { date: dayBefore(0), duration_hours: 7.4, deep_hours: 1.3, rem_hours: 1.9 },
    ]
    const data = await loadTodayData(
      fakeClient({ metrics_daily: metricRows(), sleep_sessions: nights }) as never,
      'u',
      NOW,
    )
    expect(data.sleep?.hours).toBeCloseTo(7.4)
  })
})
