import { useEffect, useState } from 'react'
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'
import { useInView } from '../useInView'
import { Icon } from '../../../lib/icons'

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// Печатает text посимвольно, когда start=true. При reduce-motion — сразу весь.
function useTypewriter(text: string, start: boolean, cps = 45): { out: string; done: boolean } {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!start) return
    if (reducedMotion()) {
      const id = setTimeout(() => setN(text.length), 0)
      return () => clearTimeout(id)
    }
    let i = 0
    const id = setInterval(() => {
      i += 1
      setN(i)
      if (i >= text.length) clearInterval(id)
    }, 1000 / cps)
    return () => clearInterval(id)
  }, [start, text, cps])
  return { out: text.slice(0, n), done: n >= text.length }
}

const EXCHANGES = [
  {
    q: 'Почему я так устаю днём?',
    a: 'По твоим данным: за последнюю неделю сон в среднем 6.2 ч и поздний кофе 4 дня из 7. Попробуй сдвинуть кофе на утро.',
  },
  {
    q: 'Что показали мои анализы?',
    a: 'Ферритин 28 — ниже нормы, это может объяснять усталость из твоих заметок. Обсуди с врачом добавку железа.',
  },
]

function Exchange({ q, a, start, onDone }: { q: string; a: string; start: boolean; onDone: () => void }) {
  const { t } = useT()
  const [showTyping, setShowTyping] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const answer = useTypewriter(t(a), showAnswer)

  useEffect(() => {
    if (!start) return
    const t1 = setTimeout(() => setShowTyping(true), 500)
    const t2 = setTimeout(() => { setShowTyping(false); setShowAnswer(true) }, reducedMotion() ? 500 : 1600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [start])

  useEffect(() => { if (answer.done) onDone() }, [answer.done, onDone])

  if (!start) return null
  return (
    <>
      <m.div className="appchat-msg user" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }}>
        {t(q)}
      </m.div>
      {showTyping && <div className="appchat-typing">{t('печатает…')}</div>}
      {showAnswer && <div className="appchat-msg bot">{answer.out}{!answer.done && <span className="appchat-caret" />}</div>}
    </>
  )
}

export function ChatBlock() {
  const { t } = useT()
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.4 })
  const [stage, setStage] = useState(0) // сколько обменов запущено/завершено

  return (
    <section className="landing-block" ref={ref}>
      <h2 className="block-title"><Icon name="chat" size={20} /> {t('Спрашивай о своём здоровье — отвечает по твоим данным')}</h2>
      <div className="chat-stage lp-glass">
        <div className="appchat">
          <Exchange {...EXCHANGES[0]} start={inView} onDone={() => setStage(s => Math.max(s, 1))} />
          <Exchange {...EXCHANGES[1]} start={stage >= 1} onDone={() => setStage(s => Math.max(s, 2))} />
        </div>
      </div>
      <p className="block-sub" style={{ textAlign: 'center' }}>{t('ИИ отвечает по твоим данным, а не из интернета.')}</p>
    </section>
  )
}
