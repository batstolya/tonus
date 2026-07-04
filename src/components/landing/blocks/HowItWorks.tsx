import { useEffect, useState } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { useT } from '../../../lib/i18n'
import { useInView } from '../useInView'
import { Counter } from '../../ui/Counter'
import { DEMO_INSIGHTS } from '../liveDemo.logic'

// Сцена 1: часы → поток точек → карточка приложения
function SyncScene() {
  return (
    <div className="hiw-scene" aria-hidden="true">
      <span className="hiw-watch">⌚</span>
      <span className="hiw-dots"><i /><i /><i /></span>
      <span className="hiw-app">📊</span>
    </div>
  )
}

// Сцена 2: граф связей + карточка-инсайт (первый из общих демо-инсайтов)
function AiScene() {
  const { t } = useT()
  return (
    <div className="hiw-scene" aria-hidden="true">
      <svg className="hiw-web" viewBox="0 0 260 120">
        <circle cx="40" cy="30" r="5" /><circle cx="130" cy="70" r="7" />
        <circle cx="220" cy="24" r="5" /><circle cx="80" cy="104" r="5" /><circle cx="200" cy="100" r="5" />
        <path d="M40,30 L130,70" /><path d="M220,24 L130,70" /><path d="M80,104 L130,70" /><path d="M200,100 L130,70" />
      </svg>
      <div className="hiw-insight">
        <b>{t(DEMO_INSIGHTS[0].title)}</b>
        <span>{t(DEMO_INSIGHTS[0].text)}</span>
      </div>
    </div>
  )
}

// Сцена 3: A/B периоды + результат
function ExperimentScene({ animate }: { animate: boolean }) {
  const { t } = useT()
  return (
    <div className="hiw-scene" aria-hidden="true">
      <div className="hiw-ab">
        <div className="hiw-period a"><span>{t('Период A')}</span></div>
        <div className="hiw-period b"><span>{t('Период B')}</span></div>
      </div>
      <div className="hiw-result">
        <span>{t('Результат')}</span>
        <b>+{animate ? <Counter value={12} /> : 12}%</b>
        <span>{t('глубокий сон')}</span>
      </div>
    </div>
  )
}

const STEPS = [
  { title: 'Часы синхронизируются сами', text: 'Раз в час Apple Health отправляет свежие данные — без кнопок и кабелей.' },
  { title: 'AI находит связи', text: 'Сон, кофе, стресс, анализы — Tonus связывает всё и показывает, что на что влияет.' },
  { title: 'Проверяешь экспериментом', text: 'Меняешь привычку — Tonus честно считает «до» и «после».' },
]

function Scene({ index, animate }: { index: number; animate: boolean }) {
  if (index === 0) return <SyncScene />
  if (index === 1) return <AiScene />
  return <ExperimentScene animate={animate} />
}

function StepText({ index, active, onActive, children }: {
  index: number; active: boolean; onActive: (i: number) => void; children: React.ReactNode
}) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.6, once: false })
  useEffect(() => { if (inView) onActive(index) }, [inView, index, onActive])
  return (
    <div ref={ref} className={`hiw-step${active ? ' active' : ''}`}>
      {children}
    </div>
  )
}

export function HowItWorks() {
  const { t } = useT()
  const [active, setActive] = useState(0)
  return (
    <section className="landing-block">
      <p className="block-kicker">{t('Как это работает')}</p>
      <div className="hiw-grid">
        <div className="hiw-steps">
          {STEPS.map((s, i) => (
            <StepText key={s.title} index={i} active={active === i} onActive={setActive}>
              <span className="hiw-num">{i + 1}</span>
              <h3>{t(s.title)}</h3>
              <p>{t(s.text)}</p>
              {/* мобильная встроенная сцена; на десктопе скрыта */}
              <div className="hiw-inline-scene"><Scene index={i} animate /></div>
            </StepText>
          ))}
        </div>
        <div className="hiw-sticky lp-glass">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={active}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4 }}
            >
              <Scene index={active} animate />
            </m.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
