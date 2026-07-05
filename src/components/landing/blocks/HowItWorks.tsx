import { useEffect, useState } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { useT } from '../../../lib/i18n'
import { useInView } from '../useInView'
import { Counter } from '../../ui/Counter'
import { DEMO_INSIGHTS } from '../liveDemo.logic'

// Сцена 1: часы с кольцами активности → поток данных → живой бар-чарт
function SyncScene() {
  return (
    <div className="hiw-scene hiw-sync" aria-hidden="true">
      <svg className="hiw-sync-svg" viewBox="0 0 200 260" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="hiwCase" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#565662" />
            <stop offset="1" stopColor="#1e1e26" />
          </linearGradient>
          <linearGradient id="hiwScreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#101017" />
            <stop offset="1" stopColor="#050509" />
          </linearGradient>
          <linearGradient id="hiwBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id="hiwGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.45" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* объёмное свечение под часами */}
        <ellipse className="hiw-sync-glow" cx="100" cy="50" rx="62" ry="54" fill="url(#hiwGlow)" />

        {/* ремешки */}
        <rect x="84" y="2" width="32" height="20" rx="8" fill="#20202a" />
        <rect x="84" y="78" width="32" height="20" rx="8" fill="#20202a" />

        {/* корпус + колёсико */}
        <rect x="72" y="14" width="56" height="70" rx="18" fill="url(#hiwCase)" stroke="#5c5c6a" strokeOpacity="0.55" />
        <rect x="127" y="40" width="6" height="14" rx="3" fill="#6c6c7a" />

        {/* экран */}
        <rect x="79" y="21" width="42" height="56" rx="13" fill="url(#hiwScreen)" />

        {/* кольца активности */}
        <g transform="translate(100 49)">
          <circle className="hiw-ring hiw-ring-1" r="15" pathLength="100" stroke="var(--red)" strokeWidth="3.5" strokeLinecap="round" />
          <circle className="hiw-ring hiw-ring-2" r="11" pathLength="100" stroke="var(--green)" strokeWidth="3.5" strokeLinecap="round" />
          <circle className="hiw-ring hiw-ring-3" r="7" pathLength="100" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" />
        </g>

        {/* поток данных */}
        <line x1="100" y1="100" x2="100" y2="168" stroke="var(--accent)" strokeOpacity="0.16" strokeWidth="2" strokeLinecap="round" />
        <circle className="hiw-sync-dot hiw-sync-dot-1" cx="100" cy="100" r="3.6" fill="var(--accent)" />
        <circle className="hiw-sync-dot hiw-sync-dot-2" cx="100" cy="100" r="3.6" fill="var(--accent)" />
        <circle className="hiw-sync-dot hiw-sync-dot-3" cx="100" cy="100" r="3.6" fill="var(--accent)" />

        {/* карточка бар-чарта */}
        <rect x="60" y="168" width="80" height="84" rx="14" fill="var(--surface)" stroke="var(--border)" />
        <line x1="70" y1="236" x2="130" y2="236" stroke="var(--border)" strokeWidth="1" />
        <rect className="hiw-bar hiw-bar-1" x="74" y="204" width="10" height="32" rx="3" fill="url(#hiwBar)" />
        <rect className="hiw-bar hiw-bar-2" x="90" y="192" width="10" height="44" rx="3" fill="url(#hiwBar)" />
        <rect className="hiw-bar hiw-bar-3" x="106" y="212" width="10" height="24" rx="3" fill="url(#hiwBar)" />
        <rect className="hiw-bar hiw-bar-4" x="122" y="186" width="10" height="50" rx="3" fill="url(#hiwBar)" />
      </svg>
    </div>
  )
}

// Сцена 2: живой граф корреляций — AI «нащупывает» связь кофе ↔ сон
function AiScene() {
  const { t } = useT()
  return (
    <div className="hiw-scene hiw-ai" aria-hidden="true">
      <svg className="hiw-graph" viewBox="0 0 260 140" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="hiwNode" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.65" />
          </radialGradient>
        </defs>

        {/* контекстная сеть факторов — тускло, погуще */}
        <g className="hiw-graph-web" stroke="var(--accent)" strokeWidth="1.2">
          <line x1="54" y1="50" x2="92" y2="24" />
          <line x1="92" y1="24" x2="160" y2="18" />
          <line x1="160" y1="18" x2="206" y2="36" />
          <line x1="92" y1="24" x2="150" y2="60" />
          <line x1="150" y1="60" x2="120" y2="104" />
          <line x1="120" y1="104" x2="32" y2="92" />
          <line x1="32" y1="92" x2="54" y2="50" />
          <line x1="120" y1="104" x2="182" y2="96" />
          <line x1="182" y1="96" x2="232" y2="84" />
          <line x1="232" y1="84" x2="206" y2="36" />
          <line x1="150" y1="60" x2="182" y2="96" />
          <line x1="150" y1="60" x2="206" y2="36" />
          <line x1="54" y1="50" x2="120" y2="104" />
          <line x1="160" y1="18" x2="150" y2="60" />
        </g>

        {/* второстепенная связь — тусклый импульс */}
        <line className="hiw-graph-pulse hiw-graph-pulse-b" x1="120" y1="104" x2="206" y2="36" pathLength="100" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />

        {/* найденная связь: кофе ↔ сон */}
        <line className="hiw-graph-link" x1="54" y1="50" x2="206" y2="36" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
        <line className="hiw-graph-pulse" x1="54" y1="50" x2="206" y2="36" pathLength="100" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />

        {/* контекстные узлы */}
        <circle className="hiw-node hiw-node-a" cx="92" cy="24" r="4" fill="url(#hiwNode)" />
        <circle className="hiw-node hiw-node-b" cx="120" cy="104" r="4.5" fill="url(#hiwNode)" />
        <circle className="hiw-node hiw-node-c" cx="182" cy="96" r="4" fill="url(#hiwNode)" />
        <circle className="hiw-node hiw-node-d" cx="150" cy="60" r="5" fill="url(#hiwNode)" />
        <circle className="hiw-node hiw-node-e" cx="32" cy="92" r="3.5" fill="url(#hiwNode)" />
        <circle className="hiw-node hiw-node-f" cx="232" cy="84" r="3.5" fill="url(#hiwNode)" />
        <circle className="hiw-node hiw-node-g" cx="160" cy="18" r="4" fill="url(#hiwNode)" />

        {/* ключевые узлы: радар-пинг + ядро */}
        <circle className="hiw-ping hiw-ping-1" cx="54" cy="50" r="6" stroke="var(--accent)" strokeWidth="1.5" />
        <circle className="hiw-ping hiw-ping-2" cx="206" cy="36" r="6" stroke="var(--accent)" strokeWidth="1.5" />
        <circle cx="54" cy="50" r="6.5" fill="var(--accent)" />
        <circle cx="206" cy="36" r="6.5" fill="var(--accent)" />
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
  // Активен шаг, пересекающий центральную полосу вьюпорта (10% по высоте).
  // threshold 0.6 ломался: все шаги видны одновременно и события кончались.
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0, rootMargin: '-45% 0px -45% 0px', once: false })
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
