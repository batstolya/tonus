import type { ReactNode } from 'react'
import { motion } from 'motion/react'

interface Props {
  icon: ReactNode        // emoji or small element
  title: string          // already-translated string
  text?: string          // already-translated string
  cta?: { label: string; onClick: () => void }
}

// Reusable friendly empty / locked state. Callers pass already-translated text.
export function EmptyState({ icon, title, text, cta }: Props) {
  return (
    <motion.div className="empty-state" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}>
      <div className="empty-state-icon" aria-hidden>{icon}</div>
      <div className="empty-state-title">{title}</div>
      {text && <p className="empty-state-text">{text}</p>}
      {cta && (
        <button className="empty-state-cta" onClick={cta.onClick}>{cta.label}</button>
      )}
    </motion.div>
  )
}
