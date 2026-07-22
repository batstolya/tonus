import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useT } from '../../lib/i18n'
import Counter from '../ui/Counter'
import './TelegramDemo.css'

// Telegram-style bot demo for the auth screen: three looping scenes showing
// what the Tonus bot does. Animations are pure CSS (no framer-motion); per-element
// timing comes from inline animation-delay. Scenes remount on `key` change so the
// CSS animations replay on every loop.

const SCENE_COUNT = 3
const SCENE_DURATIONS_MS = [4500, 10000, 11000]

// Inline animation-delay helper (seconds from scene mount).
const d = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` })

// ── Chat bubble (bot = left/gray, user = right/blue) ──
function ChatBubble({
  text,
  type = 'bot',
  timestamp,
  avatar = '🤖',
  delay = 0,
  children,
}: {
  text?: string
  type?: 'bot' | 'user'
  timestamp: string
  avatar?: string
  delay?: number
  children?: ReactNode
}) {
  const isUser = type === 'user'
  return (
    <div
      className={`tg-message tg-${type} ${isUser ? 'tg-slide-right' : 'tg-slide-left'}`}
      style={d(delay)}
    >
      {!isUser && <div className="tg-avatar">{avatar}</div>}
      <div className={`tg-bubble tg-bubble-${type}`}>
        {children ?? <p className="tg-bubble-text">{text}</p>}
        <span className="tg-timestamp">{timestamp}</span>
        <span className="tg-checkmark">{isUser ? '✓✓' : '✓'}</span>
      </div>
    </div>
  )
}

// ── "Bot is typing…" indicator that fades in then out before the reply lands ──
function TypingIndicator({ text, delay, life }: { text: string; delay: number; life: number }) {
  return (
    <div className="tg-typing tg-typing-inout" style={{ animationDelay: `${delay}s`, animationDuration: `${life}s` }}>
      <span>{text}</span>
      <span className="tg-typing-dots">…</span>
    </div>
  )
}

// ── Scene 1: text logging ──
function Scene1() {
  const { t } = useT()
  return (
    <>
      <ChatBubble type="bot" text={t('Привет! 👋 Отправь что-нибудь интересное')} timestamp="14:23" delay={0} />
      <ChatBubble type="user" text={t('пил кофе в 14:00 ☕')} timestamp="14:25" delay={0.8} />
      <TypingIndicator text={t('⏳ Анализирую')} delay={1.4} life={1.0} />
      <ChatBubble type="bot" timestamp="14:26" delay={2.5}>
        <div className="tg-response">
          <p className="tg-fade" style={d(2.7)}>{t('✅ Записал!')}</p>
          <div className="tg-metric tg-fade" style={d(2.9)}>{t('☕ Кофе в 14:00')}</div>
          <div className="tg-metric tg-fade" style={d(3.05)}>{t('95 мг кофеина')}</div>
          <div className="tg-metric tg-info tg-fade" style={d(3.2)}>{t('📊 Добавлено в дашборд')}</div>
        </div>
      </ChatBubble>
    </>
  )
}

// ── Scene 2: food photo analysis ──
function Scene2() {
  const { t } = useT()
  const photoUrl =
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="130"%3E%3Crect fill="%23F4C430" width="200" height="130"/%3E%3Ctext x="58" y="86" font-size="56"%3E%F0%9F%8D%94%3C/text%3E%3C/svg%3E'
  return (
    <>
      <ChatBubble type="bot" text={t('Покажи, что ты ешь 🍽️')} timestamp="14:30" delay={0} />
      <div className="tg-message tg-user tg-slide-right" style={d(0.8)}>
        <div className="tg-bubble tg-bubble-user">
          <img src={photoUrl} alt={t('Фото еды')} className="tg-food-photo tg-blur" style={d(0.8)} />
          <span className="tg-timestamp">14:32</span>
          <span className="tg-checkmark">✓✓</span>
        </div>
      </div>
      <TypingIndicator text={t('⏳ Анализирую фото')} delay={1.8} life={3.2} />
      <ChatBubble type="bot" timestamp="14:34" delay={5.2}>
        <div className="tg-response">
          <p className="tg-fade" style={d(5.4)}>{t('🔍 Я вижу:')}</p>
          <div className="tg-metric tg-fade" style={d(5.6)}>🍔 Big Mac</div>
          <div className="tg-metric tg-fade" style={d(5.75)}>{t('🍟 Картошка фри')}</div>
          <div className="tg-metric tg-fade" style={d(5.9)}>🥤 Coca-Cola</div>
          <p className="tg-section tg-fade" style={d(6.2)}>{t('📊 Нутриенты:')}</p>
          <div className="tg-metric tg-fade" style={d(6.4)}>
            <Counter value={550} delay={6.4} className="tg-counter" /> {t('ккал · 25 г белка')}
          </div>
          <div className="tg-metric tg-fade" style={d(6.7)}>{t('30 г жиров · 45 г углеводов')}</div>
          <div className="tg-metric tg-saved" style={d(7.0)}>{t('✅ Сохранено в дневник питания')}</div>
        </div>
      </ChatBubble>
    </>
  )
}

// ── Scene 3: AI health query ──
function Scene3() {
  const { t } = useT()
  const insights = [
    { n: '1️⃣', title: t('☕ Кофе после 15:00'), text: t('→ сон на 1.5 ч короче следующей ночью') },
    { n: '2️⃣', title: t('🍽️ Поздняя еда (после 21:00)'), text: t('→ HRV падает на 15%') },
    { n: '3️⃣', title: t('💼 Стрессовые дни'), text: t('→ пульс покоя выше на 8 уд/мин') },
  ]
  return (
    <>
      <ChatBubble type="bot" text={t('Как дела? 👋')} timestamp="14:40" delay={0} />
      <ChatBubble type="user" text={t('Почему я так устаю днём?')} timestamp="14:42" delay={0.8} />
      <TypingIndicator text={t('⏳ Анализирую твои данные')} delay={1.6} life={3.0} />
      <ChatBubble type="bot" timestamp="14:46" delay={4.8}>
        <div className="tg-response">
          <p className="tg-fade" style={d(5.0)}>{t('🧠 Я нашёл 3 закономерности:')}</p>
          {insights.map((it, i) => {
            const t0 = 5.2 + i * 0.7
            return (
              <div className="tg-insight" key={i}>
                <div className="tg-insight-head">
                  <span className="tg-insight-num tg-zoom" style={d(t0)}>{it.n}</span>
                  <span className="tg-insight-title tg-fade" style={d(t0 + 0.15)}>{it.title}</span>
                </div>
                <span className="tg-insight-text tg-fade" style={d(t0 + 0.3)}>{it.text}</span>
              </div>
            )
          })}
          <div className="tg-reco" style={d(7.5)}>{t('💡 Совет: ложись спать на 20 минут раньше')}</div>
          <button className="tg-action" style={d(7.9)} type="button" tabIndex={-1}>
            {t('🔬 Запустить эксперимент?')} <strong>{t('ДА')}</strong>
          </button>
        </div>
      </ChatBubble>
    </>
  )
}

export default function TelegramDemo() {
  const { t } = useT()
  const [scene, setScene] = useState(0)

  // Auto-advance through the scenes; re-runs (and resets the timer) whenever
  // `scene` changes, including manual dot selection. Each scene is sized to fit
  // the demo box (see TelegramDemo.css), so there is no auto-scroll — the chat
  // never moves on its own.
  useEffect(() => {
    const id = setTimeout(() => setScene((s) => (s + 1) % SCENE_COUNT), SCENE_DURATIONS_MS[scene])
    return () => clearTimeout(id)
  }, [scene])

  return (
    <div className="tg-demo" role="img" aria-label={t('Демо Telegram-бота Tonus')}>
      <div className="tg-header">
        <span className="tg-header-avatar">🤖</span>
        <div className="tg-header-info">
          <span className="tg-header-title">Tonus</span>
          <span className="tg-header-status">bot</span>
        </div>
      </div>

      <div className="tg-content">
        <div className="tg-scene" key={scene}>
          {scene === 0 && <Scene1 />}
          {scene === 1 && <Scene2 />}
          {scene === 2 && <Scene3 />}
        </div>
      </div>

      <div className="tg-input" aria-hidden="true">
        <span className="tg-input-icon">📎</span>
        <span className="tg-input-field">{t('Сообщение…')}</span>
        <span className="tg-send">➤</span>
      </div>

      <div className="tg-dots">
        {Array.from({ length: SCENE_COUNT }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`tg-dot ${scene === i ? 'tg-dot-active' : ''}`}
            aria-label={`${t('Сцена')} ${i + 1}`}
            onClick={() => setScene(i)}
          />
        ))}
      </div>
    </div>
  )
}
