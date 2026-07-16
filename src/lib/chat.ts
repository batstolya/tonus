import { supabase } from './supabase'
import { isDemoActive } from './demo'
import { demoList } from './demoDb'
import { demoChatReply } from './demoAi'

// Чат с ИИ. Контекст здоровья собирается НА СЕРВЕРЕ (chat-health →
// _shared/healthContext.ts, F2 smart-tonus): 30 дней данных + цели,
// эксперименты, профиль коуча. Клиент шлёт только сообщение и историю —
// клиентского билдера контекста больше нет, дрейф двух копий закрыт.

export interface ChatDebug {
  reason: string
  tools: string[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  debug?: ChatDebug // только у свежеполученного ответа; в БД/истории отсутствует
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
  if (isDemoActive()) {
    return demoList('context_notes')
      .filter(n => n.date >= since.toISOString().slice(0, 10))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(n => `${n.date}: ${n.note}${n.wellbeing ? ` [самочувствие ${n.wellbeing}/5]` : ''}`)
      .join('\n')
  }
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
): Promise<{ reply: string; sessionId: string; debug?: ChatDebug }> {
  // В демо нет сессии, а значит и edge-функции: отвечаем фикстурой (см. demoAi.ts).
  if (isDemoActive()) return demoChatReply(message, sessionId)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Не авторизован')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const res = await fetch(`${supabaseUrl}/functions/v1/chat-health`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({ sessionId, message, lang }),
  })

  if (!res.ok) {
    if (res.status === 402 || res.status === 403) {
      const j = await res.json().catch(() => ({})) as { error?: string; message?: string }
      if (res.status === 403 && j.error === 'ai_consent_required') {
        throw Object.assign(new Error(j.message || 'AI processing consent is required. Open Settings to grant it.'), {
          code: j.error,
        })
      }
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
