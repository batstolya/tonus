import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import type { DailyMetrics, HeartRateSample } from '../../types'
import { sendChatMessage, buildContextSnapshot, loadLabSummary, loadSupplementSummary, loadNotesSummary, loadConcernsSummary, loadHairSummary, loadCoachProfile, loadCalendarSummary, type ChatMessage, type IntakeEvent } from '../../lib/chat'
import { useT } from '../../lib/i18n'

interface Props {
  user: User
  daily: DailyMetrics[]
  intakeEvents?: IntakeEvent[]
  heartRateSamples?: HeartRateSample[]
}

type Period = '14d' | '30d' | '90d'

const PERIOD_LABELS: Record<Period, string> = {
  '14d': '2 недели',
  '30d': '30 дней',
  '90d': '3 месяца',
}

function MsgBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`chat-bubble ${isUser ? 'user' : 'assistant'}`}>
      <p>{msg.content}</p>
    </div>
  )
}

export function ChatWidget({ user, daily, intakeEvents = [], heartRateSamples = [] }: Props) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<Period>('14d')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [labSummary, setLabSummary] = useState<string>('')
  const [supplementSummary, setSupplementSummary] = useState<string>('')
  const [notesSummary, setNotesSummary] = useState<string>('')
  const [concernsSummary, setConcernsSummary] = useState<string>('')
  const [hairSummary, setHairSummary] = useState<string>('')
  const [coachProfile, setCoachProfile] = useState<string>('')
  const [calendarSummary, setCalendarSummary] = useState<string>('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    loadLabSummary(user.id).then(setLabSummary)
    loadConcernsSummary(user.id).then(setConcernsSummary)
    loadHairSummary(user.id).then(setHairSummary)
    loadCoachProfile().then(setCoachProfile)
  }, [user.id])

  // Rebuild snapshot when period changes (also reloads supplement compliance for the new period)
  useEffect(() => {
    const days = period === '14d' ? 14 : period === '30d' ? 30 : 90
    loadSupplementSummary(user.id, days).then(setSupplementSummary)
    loadNotesSummary(user.id, days).then(setNotesSummary)
    loadCalendarSummary(user.id, days).then(setCalendarSummary)
  }, [user.id, period])

  useEffect(() => {
    const days = period === '14d' ? 14 : period === '30d' ? 30 : 90
    setSnapshot(daily.length ? buildContextSnapshot(daily, days, labSummary || undefined, intakeEvents, supplementSummary || undefined, heartRateSamples, notesSummary || undefined, concernsSummary || undefined, hairSummary || undefined, coachProfile || undefined, calendarSummary || undefined) : null)
    setSessionId(null)
    setMessages([])
  }, [period, daily, labSummary, intakeEvents, supplementSummary, heartRateSamples, notesSummary, concernsSummary, hairSummary, coachProfile, calendarSummary])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      bottomRef.current?.scrollIntoView()
    }
  }, [open, messages.length])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      // Only send snapshot on first message of a session
      const ctxToSend = sessionId ? null : snapshot
      const { reply, sessionId: newSessionId } = await sendChatMessage(
        text,
        sessionId,
        ctxToSend,
        PERIOD_LABELS[period],
      )
      if (!sessionId) setSessionId(newSessionId)

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e: any) {
      setError(e.message ?? t('Ошибка'))
    }
    setLoading(false)
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        className={`chat-fab ${open ? 'open' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={t('Чат с ИИ')}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div className="chat-window">
          <div className="chat-header">
            <span className="chat-title">{t('ИИ-ассистент')}</span>
            <div className="chat-period-tabs">
              {(['14d', '30d', '90d'] as Period[]).map(p => (
                <button
                  key={p}
                  className={`chat-period-btn ${period === p ? 'active' : ''}`}
                  onClick={() => setPeriod(p)}
                >
                  {t(PERIOD_LABELS[p])}
                </button>
              ))}
            </div>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <p>{t('Привет! Я знаю твои данные здоровья за')} {t(PERIOD_LABELS[period])}. {t('Задай любой вопрос.')}</p>
                <div className="chat-suggestions">
                  {['Как мой сон за период?', 'Что с HRV?', 'Когда лучшие показатели?'].map(s => (
                    <button key={s} className="chat-suggestion" onClick={() => { setInput(s); inputRef.current?.focus() }}>{t(s)}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(m => <MsgBubble key={m.id} msg={m} />)}
            {loading && (
              <div className="chat-bubble assistant">
                <span className="chat-typing"><span /><span /><span /></span>
              </div>
            )}
            {error && <p className="auth-error" style={{ margin: '8px 12px' }}>{error}</p>}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-row">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder={t('Спроси о своих данных…')}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
            />
            <button className="chat-send" onClick={handleSend} disabled={loading || !input.trim()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
