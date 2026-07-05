import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { sendChatMessage, type ChatMessage } from '../../lib/chat'
import { useT } from '../../lib/i18n'

// Контекст для ИИ собирается на сервере (chat-health → _shared/healthContext,
// F2 smart-tonus): данные за 30 дней + цели/эксперименты/профиль. Клиент шлёт
// только сообщение — билдеры контекста здесь больше не живут.

interface Props {
  user: User
}

function MsgBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`chat-bubble ${isUser ? 'user' : 'assistant'}`}>
      <p>{msg.content}</p>
    </div>
  )
}

export function ChatWidget(_props: Props) {
  const { t, lang } = useT()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
      const { reply, sessionId: newSessionId } = await sendChatMessage(text, sessionId, lang)
      if (!sessionId) setSessionId(newSessionId)

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Ошибка'))
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
            <button className="chat-close" onClick={() => setOpen(false)} aria-label={t('Закрыть')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <p>{t('Привет! Я вижу твои данные, цели и эксперименты за последние 30 дней. Задай любой вопрос.')}</p>
                <div className="chat-suggestions">
                  {['Как мой сон за период?', 'Что с HRV?', 'Как продвигаются мои цели?'].map(s => (
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
