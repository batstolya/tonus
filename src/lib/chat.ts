import { supabase } from './supabase'

// Чат с ИИ. Контекст здоровья собирается НА СЕРВЕРЕ (chat-health →
// _shared/healthContext.ts, F2 smart-tonus): 30 дней данных + цели,
// эксперименты, профиль коуча. Клиент шлёт только сообщение и историю —
// клиентского билдера контекста больше нет, дрейф двух копий закрыт.

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

// Используется QuickLog/MetricsScreen для типизации событий быстрого лога.
export interface IntakeEvent {
  id: string
  ts: string
  type: string
  amount: number | null
  unit: string | null
  note: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
}

// Заметки дня за период (текст + оценка самочувствия) — нужно ResearchScreen.
export async function loadNotesSummary(userId: string, periodDays: number): Promise<string> {
  const since = new Date(); since.setDate(since.getDate() - periodDays)
  const { data } = await supabase
    .from('context_notes')
    .select('date, note, wellbeing')
    .eq('user_id', userId)
    .gte('date', since.toISOString().slice(0, 10))
    .order('date', { ascending: false })
  if (!data?.length) return ''
  return data.map((n: { date: string; note: string | null; wellbeing: number | null }) => {
    const wb = typeof n.wellbeing === 'number' ? ` [самочувствие ${n.wellbeing}/5]` : ''
    return `${n.date}: ${n.note ?? ''}${wb}`
  }).join('\n')
}

export async function sendChatMessage(
  message: string,
  sessionId: string | null,
  lang = 'ru',
): Promise<{ reply: string; sessionId: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Не авторизован')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/chat-health`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ sessionId, message, lang }),
  })

  if (!res.ok) {
    if (res.status === 402) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.message || 'Достигнут месячный лимит ИИ-расходов. Увеличь бюджет в Настройках.')
    }
    const text = await res.text()
    throw new Error(text || 'Ошибка чата')
  }

  return res.json()
}

export async function loadChatHistory(sessionId: string): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  return (data ?? []) as ChatMessage[]
}
