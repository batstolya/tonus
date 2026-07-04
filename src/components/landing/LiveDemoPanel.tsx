import { useMemo, useState } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis } from 'recharts'
import { useT } from '../../lib/i18n'
import { makeDemoDaily } from '../../lib/demoFixture'
import { DEMO_TABS, TAB_LABELS, DEMO_INSIGHTS, prepareLiveDemoData, type DemoTab } from './liveDemo.logic'

const RING_C = 2 * Math.PI * 52

function ReadinessView({ score, recovery, sleep }: { score: number; recovery: number | null; sleep: number | null }) {
  const { t } = useT()
  return (
    <div className="ld-readiness">
      <div className="ld-ring-wrap">
        <svg viewBox="0 0 120 120" className="ld-ring">
          <circle cx="60" cy="60" r="52" className="ld-ring-track" />
          <m.circle
            cx="60" cy="60" r="52" className="ld-ring-fill"
            strokeDasharray={RING_C}
            initial={{ strokeDashoffset: RING_C }}
            animate={{ strokeDashoffset: RING_C * (1 - score / 100) }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />
        </svg>
        <div className="ld-ring-num">{score}</div>
      </div>
      <div className="ld-ring-bars">
        {[
          { label: t('Восстановление'), v: recovery },
          { label: t('Сон'), v: sleep },
          { label: t('Пульс покоя'), v: score },
        ].map(b => (
          <div key={b.label} className="ld-bar-row">
            <span>{b.label}</span>
            <div className="ld-bar-track">
              <m.div
                className="ld-bar-fill"
                initial={{ width: 0 }}
                animate={{ width: `${b.v ?? 0}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LiveDemoPanel({ onDemo }: { onDemo?: () => void }) {
  const { t } = useT()
  const [tab, setTab] = useState<DemoTab>('readiness')
  const data = useMemo(() => prepareLiveDemoData(makeDemoDaily()), [])

  return (
    <div className="ld-panel lp-glass">
      <div className="ld-tabs" role="tablist">
        {DEMO_TABS.map(id => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`ld-tab${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            {t(TAB_LABELS[id])}
            {tab === id && <m.span layoutId="ld-tab-underline" className="ld-tab-underline" />}
          </button>
        ))}
      </div>

      <div className="ld-body">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            {tab === 'readiness' && (
              <ReadinessView
                score={Math.round(data.score.readiness ?? 0)}
                recovery={data.score.recovery_score}
                sleep={data.score.sleep_score}
              />
            )}
            {tab === 'sleep' && (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={data.sleep14} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={[0, 12]} />
                  <Bar dataKey="deep" stackId="s" fill="#6c8fff" isAnimationActive={false} />
                  <Bar dataKey="rem" stackId="s" fill="#5bc896" isAnimationActive={false} />
                  <Bar dataKey="core" stackId="s" fill="#8888a0" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {tab === 'heart' && (
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={data.heart14} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                  <Line dataKey="resting" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="max" stroke="#ff6b6b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
            {tab === 'insights' && (
              <div className="ld-insights">
                {DEMO_INSIGHTS.map(i => (
                  <div key={i.title} className="ld-insight">
                    <span className="ld-insight-title">{t(i.title)}</span>
                    <span className="ld-insight-text">{t(i.text)}</span>
                  </div>
                ))}
              </div>
            )}
          </m.div>
        </AnimatePresence>
      </div>

      <div className="ld-footer">
        <span>{t('Это живые данные — потрогай')}</span>
        {onDemo && <button className="ld-demo-link" onClick={onDemo}>{t('Открыть полное демо')} →</button>}
      </div>
    </div>
  )
}
