// Function-calling инструменты чата (design doc, раздел 9.1): модель сама
// запрашивает точные диапазоны данных сверх базового 30-дневного контекста.
// Каждый инструмент — обычный Supabase-запрос с eq('user_id', userId), те же
// RLS-гарантии, что и у остального контекста.

export const CHAT_TOOL_DECLARATIONS = [
  {
    name: 'get_metrics_range',
    description: 'Вернуть сырые ежедневные метрики (пульс покоя, HRV, сон, шаги, ккал, SpO2) за произвольный диапазон дат, максимум 60 дней за раз. Использовать для сравнений за пределами последних 30 дней или диапазонов, не совпадающих с неделей.',
    parameters: {
      type: 'OBJECT',
      properties: {
        start_date: { type: 'STRING', description: 'Начало диапазона, YYYY-MM-DD' },
        end_date: { type: 'STRING', description: 'Конец диапазона, YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_sleep_range',
    description: 'Вернуть сырые данные сна (включая время засыпания/пробуждения и фазы) за произвольный диапазон дат, максимум 60 дней за раз.',
    parameters: {
      type: 'OBJECT',
      properties: {
        start_date: { type: 'STRING', description: 'Начало диапазона, YYYY-MM-DD' },
        end_date: { type: 'STRING', description: 'Конец диапазона, YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_lab_history',
    description: 'Вернуть всю историю значений одного лабораторного маркера (не только последнее значение и дельту), максимум 50 точек.',
    parameters: {
      type: 'OBJECT',
      properties: {
        marker: { type: 'STRING', description: 'Точное название маркера, как оно упомянуто в контексте (например "Ферритин")' },
      },
      required: ['marker'],
    },
  },
]

const MAX_RANGE_DAYS = 60

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000)
}

export async function executeChatTool(
  supabase: any,
  userId: string,
  name: string,
  args: Record<string, any>,
): Promise<unknown> {
  if (name === 'get_metrics_range' || name === 'get_sleep_range') {
    const { start_date, end_date } = args
    if (!start_date || !end_date) return { error: 'start_date и end_date обязательны' }
    if (daysBetween(start_date, end_date) > MAX_RANGE_DAYS) {
      return { error: `Диапазон слишком большой, максимум ${MAX_RANGE_DAYS} дней` }
    }
    const table = name === 'get_metrics_range' ? 'daily_metrics' : 'sleep_sessions'
    const cols = name === 'get_metrics_range'
      ? 'date, resting_heart_rate, hrv, sleep_hours, steps, active_energy, oxygen_saturation'
      : 'date, bedtime, wake_time, duration_hours, deep_hours, rem_hours, core_hours'
    const { data, error } = await supabase.from(table).select(cols)
      .eq('user_id', userId).gte('date', start_date).lte('date', end_date)
      .order('date', { ascending: true })
    // Ошибку запроса (напр. невалидная дата от модели) не глотаем в пустой
    // список — иначе модель скажет «нет данных» вместо «не смог получить»
    if (error) return { error: error.message ?? 'Ошибка запроса данных' }
    return { rows: data ?? [] }
  }

  if (name === 'get_lab_history') {
    const { marker } = args
    if (!marker) return { error: 'marker обязателен' }
    const { data, error } = await supabase.from('lab_results')
      .select('date, value, unit, ref_range, flag')
      .eq('user_id', userId).eq('marker', marker)
      .order('date', { ascending: true }).limit(50)
    if (error) return { error: error.message ?? 'Ошибка запроса данных' }
    return { rows: data ?? [] }
  }

  return { error: `Неизвестный инструмент: ${name}` }
}
