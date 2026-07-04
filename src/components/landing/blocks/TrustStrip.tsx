import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

const ITEMS = [
  { icon: '⌚', label: 'Apple Watch — синк сам' },
  { icon: '✈️', label: 'Telegram-бот' },
  { icon: '✨', label: 'AI на Gemini' },
  { icon: '🔐', label: 'Данные твои — экспорт в один клик' },
]

export function TrustStrip() {
  const { t } = useT()
  return (
    <section className="lp-trust">
      {ITEMS.map((it, i) => (
        <m.span
          key={it.label}
          className="lp-trust-item"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ delay: i * 0.08, duration: 0.45 }}
        >
          <span aria-hidden="true">{it.icon}</span> {t(it.label)}
        </m.span>
      ))}
    </section>
  )
}
