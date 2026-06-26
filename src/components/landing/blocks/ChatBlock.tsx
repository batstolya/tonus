import { useT } from '../../../lib/i18n'

export function ChatBlock() {
  const { t } = useT()
  return (
    <section className="landing-block">
      <h2 className="block-title">💬 {t('Спрашивай о своём здоровье — отвечает по твоим данным')}</h2>
      <div className="chat-stage">
        <AppChatDemo />
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
