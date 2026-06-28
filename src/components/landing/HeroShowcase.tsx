import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useT } from '../../lib/i18n'
import Counter from '../ui/Counter'
import { useInView } from './useInView'
import { MODES, MODE_LABELS, nextMode, type ShowcaseMode } from './heroShowcase.logic'
import './HeroShowcase.css'

// Hero showcase: a "your Apple Watch data comes alive on the site" animation that
// replaces the Telegram demo in the landing hero. Two scenes the visitor can flip
// between — `morph` (watch face unfolds into a live dashboard) and `flow` (data
// packets stream watch → site ⇄ Telegram). Pure-CSS keyframes; the whole thing
// pauses when off-screen or hovered/focused (see §4/§6 of the design spec).

const AUTO_SWITCH_MS = 9000
const CYCLE_MS: Record<ShowcaseMode, number> = { morph: 5200, flow: 6500 }

// Inline animation-delay helper (seconds from scene mount).
const d = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` })

function prefersReduced(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// ── Apple Watch face with three activity rings ──
const RINGS = [
  { r: 40, color: '#ff2d55', c: 251.3, end: 52, delay: 0.1 }, // move (red)
  { r: 31, color: '#a8ff2e', c: 194.8, end: 56, delay: 0.25 }, // exercise (green)
  { r: 22, color: '#2ee6e0', c: 138.2, end: 28, delay: 0.4 }, // stand (cyan)
]

function Watch({ variant }: { variant: ShowcaseMode }) {
  return (
    <div className={`hs-watch hs-watch-${variant}`} aria-hidden="true">
      <div className="hs-watch-screen">
        <svg viewBox="0 0 100 100" className="hs-rings">
          {RINGS.map((ring) => {
            const ringStyle: Record<string, string | number> = {
              stroke: ring.color,
              strokeDasharray: ring.c,
              animationDelay: `${ring.delay}s`,
              ['--c']: ring.c,
              ['--end']: ring.end,
            }
            return (
              <g key={ring.r}>
                <circle className="hs-ring-track" cx="50" cy="50" r={ring.r} strokeDasharray={ring.c} />
                <circle className="hs-ring" cx="50" cy="50" r={ring.r} style={ringStyle as CSSProperties} />
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ── Mini "site" dashboard card: readiness count-up, drawn line, growing bars, bpm ──
function Dashboard({ base, animate }: { base: number; animate: boolean }) {
  const { t } = useT()
  const readyDelay = base + 0.2
  const lineDelay = base + 0.3
  const hrDelay = base + 0.9
  return (
    <div className="hs-dash">
      <div className="hs-dash-bar">
        <span className="hs-dash-dot" />
        <span className="hs-dash-dot" />
        <span className="hs-dash-dot" />
        <span className="hs-dash-title">Tonus</span>
      </div>
      <div className="hs-dash-body">
        <div className="hs-ready hs-fade" style={d(readyDelay)}>
          <span className="hs-ready-num">{animate ? <Counter value={86} delay={readyDelay} /> : 86}</span>
          <span className="hs-ready-label">{t('Готовность')}</span>
        </div>
        <svg className="hs-line" viewBox="0 0 120 44" preserveAspectRatio="none" aria-hidden="true">
          <path className="hs-line-path" style={d(lineDelay)} d="M2,34 L24,28 L46,32 L68,16 L90,22 L118,6" />
        </svg>
        <div className="hs-bars" aria-hidden="true">
          {[0.5, 0.82, 0.45, 0.95, 0.68].map((h, i) => {
            const barStyle: Record<string, string | number> = { animationDelay: `${base + 0.6 + i * 0.08}s`, ['--h']: h }
            return <span key={i} className="hs-bar hs-grow" style={barStyle as CSSProperties} />
          })}
        </div>
        <div className="hs-hr hs-fade" style={d(hrDelay)}>
          <span className="hs-hr-heart">❤️</span>
          <span className="hs-hr-num">{animate ? <Counter value={58} delay={hrDelay} /> : 58}</span>
          <span className="hs-hr-unit">{t('уд/мин')}</span>
        </div>
      </div>
    </div>
  )
}

// ── Scene 1: watch face morphs into the live dashboard ──
function MorphScene() {
  return (
    <div className="hs-scene hs-morph" aria-hidden="true">
      <div className="hs-morph-watch">
        <Watch variant="morph" />
      </div>
      <div className="hs-morph-dash">
        <Dashboard base={1.5} animate />
      </div>
    </div>
  )
}

// ── Scene 2: data packets stream watch → site ⇄ Telegram ──
function FlowScene() {
  const { t } = useT()
  return (
    <div className="hs-scene hs-flow" aria-hidden="true">
      <div className="hs-flow-watch">
        <Watch variant="flow" />
      </div>
      <div className="hs-wire hs-wire-l">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="hs-pkt hs-fly-r" style={d(i * 0.4)} />
        ))}
      </div>
      <div className="hs-flow-dash">
        <Dashboard base={1.6} animate />
      </div>
      <div className="hs-wire hs-wire-r">
        {[0, 1, 2].map((i) => (
          <span key={`r${i}`} className="hs-pkt hs-fly-r" style={d(2.2 + i * 0.6)} />
        ))}
        {[0, 1, 2].map((i) => (
          <span key={`l${i}`} className="hs-pkt hs-pkt-tg hs-fly-l" style={d(2.5 + i * 0.6)} />
        ))}
      </div>
      <div className="hs-tg">
        <div className="hs-tg-tile">✈️</div>
        <div className="hs-tg-bubble hs-fade" style={d(3.2)}>
          💡 {t('Инсайт')}
        </div>
      </div>
    </div>
  )
}

// ── Reduced-motion: a single static frame (watch + finished dashboard) ──
function StaticFrame() {
  return (
    <div className="hs-scene hs-static-frame" aria-hidden="true">
      <Watch variant="flow" />
      <Dashboard base={0} animate={false} />
    </div>
  )
}

export default function HeroShowcase() {
  const { t } = useT()
  const [mode, setMode] = useState<ShowcaseMode>('morph')
  const [cycle, setCycle] = useState(0)
  const [paused, setPaused] = useState(false)
  const [ref, inView] = useInView<HTMLDivElement>({ once: false })
  const reduced = prefersReduced()
  const playing = inView && !paused && !reduced

  // Auto-advance between scenes; re-armed (timer reset) on every mode change,
  // including a manual dot click.
  useEffect(() => {
    if (!playing) return
    const id = setTimeout(() => setMode((m) => nextMode(m)), AUTO_SWITCH_MS)
    return () => clearTimeout(id)
  }, [playing, mode])

  // Replay the current scene's CSS animations + counters by remounting on a cycle.
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setCycle((c) => c + 1), CYCLE_MS[mode])
    return () => clearInterval(id)
  }, [playing, mode])

  return (
    <div
      className="hero-showcase"
      role="img"
      aria-label={t('Анимация: данные с Apple Watch оживают на сайте')}
      ref={ref}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="hs-stage">
        {reduced ? (
          <StaticFrame />
        ) : (
          <div className="hs-cycle" key={`${mode}-${cycle}`}>
            {mode === 'morph' ? <MorphScene /> : <FlowScene />}
          </div>
        )}
      </div>

      <div className="hs-switch">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            className={`hs-switch-btn ${mode === m ? 'is-active' : ''}`}
            aria-label={t(MODE_LABELS[m])}
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m)
              setCycle((c) => c + 1)
            }}
          >
            <span className="hs-switch-dot" />
            <span className="hs-switch-label">{t(MODE_LABELS[m])}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
