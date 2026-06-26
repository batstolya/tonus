import { useState } from 'react'
import { useT } from '../../../lib/i18n'
import TelegramDemo from '../../auth/TelegramDemo'

export function ChatBlock() {
  const { t } = useT()
  const [tab, setTab] = useState<'app' | 'tg'>('app')

  return (
    <section className="landing-block">
      <h2 className="block-title">💬 {t('Спрашивай о своём здоровье — отвечает по твоим данным')}</h2>

      <div className="chat-tabs">
        <button className={`chat-tab ${tab === 'app' ? 'active' : ''}`} onClick={() => setTab('app')}>{t('В приложении')}</button>
        <button className={`chat-tab ${tab === 'tg' ? 'active' : ''}`} onClick={() => setTab('tg')}>{t('В Telegram')}</button>
      </div>

      <div className="chat-stage">
        {tab === 'app' ? <AppChatDemo /> : <TelegramDemo />}
      </div>
    </section>
  )
}

// Лёгкая CSS-демка чата в приложении (статичная сцена с задержками).
function AppChatDemo() {
  const { t } = useT()
  return (
    <div className="appchat">
      <div className="appchat-msg user">{t('Почему я так устаю днём?')}</div>
      <div className="appchat-typing">{t('печатает…')}</div>
      <div className="appchat-msg bot">
        {t('По твоим данным: за последнюю неделю сон в среднем 6.2 ч и поздний кофе 4 дня из 7. Попробуй сдвинуть кофе на утро.')}
      </div>
    </div>
  )
}
