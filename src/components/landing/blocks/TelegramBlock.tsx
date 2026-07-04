import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

const MESSAGES: { from: 'bot' | 'user'; text: string; chip?: string }[] = [
  { from: 'bot', text: '💊 Магний 400мг — пора принять', chip: '✓ Принял' },
  { from: 'user', text: 'кофе' },
  { from: 'bot', text: '☕ Записал: кофе в 14:20' },
  { from: 'bot', text: '📊 За 2 недели: сон +40 мин, HRV +6 мс' },
]

const BULLETS = [
  'Напоминания о препаратах в нужное время',
  'Лог одной строкой: «кофе», «магний», «пробежка»',
  'Отчёт раз в две недели — что улучшилось, что просело',
]

export function TelegramBlock() {
  const { t } = useT()
  return (
    <section className="landing-block">
      <div className="tg-grid">
        <div className="tg-copy">
          <h2 className="block-title">✈️ {t('Telegram — пульт от твоего здоровья')}</h2>
          <ul className="tg-bullets">
            {BULLETS.map(b => <li key={b}>{t(b)}</li>)}
          </ul>
        </div>
        <div className="tg-phone lp-glass" aria-hidden="true">
          <div className="tg-phone-screen">
            {MESSAGES.map((msg, i) => (
              <m.div
                key={i}
                className={`tg-msg ${msg.from}`}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ delay: 0.3 + i * 0.35, duration: 0.4 }}
              >
                {t(msg.text)}
                {msg.chip && <span className="tg-chip">{t(msg.chip)}</span>}
              </m.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
