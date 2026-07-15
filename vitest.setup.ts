import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { createElement, type ReactNode, type FunctionComponent } from 'react'

// Vitest globals are disabled, so Testing Library cannot auto-register its
// usual cleanup hook. Unmount every rendered tree before jsdom is torn down.
afterEach(() => cleanup())

// motion/react schedules animation frames that can resolve after jsdom is torn
// down ("ReferenceError: window is not defined"). In tests we render motion.*
// as plain host elements so nothing animates. Applies to the jsdom project only.
const MOTION_PROPS = new Set([
  'initial', 'animate', 'exit', 'transition', 'variants', 'custom',
  'whileHover', 'whileTap', 'whileFocus', 'whileInView', 'whileDrag',
  'layout', 'layoutId', 'drag', 'dragConstraints', 'viewport',
  'onAnimationComplete', 'onAnimationStart', 'onHoverStart', 'onHoverEnd',
])
type Props = Record<string, unknown> & { children?: ReactNode }

function stripMotion(props: Props): Props {
  const out: Props = {}
  for (const [k, v] of Object.entries(props)) if (!MOTION_PROPS.has(k)) out[k] = v
  return out
}

vi.mock('motion/react', () => {
  const cache = new Map<string, FunctionComponent<Props>>()
  const motion = new Proxy({} as Record<string, FunctionComponent<Props>>, {
    get: (_target, tag: string) => {
      if (!cache.has(tag)) {
        const Comp: FunctionComponent<Props> = ({ children, ...props }) =>
          createElement(tag, stripMotion(props), children)
        Comp.displayName = `motion.${tag}`
        cache.set(tag, Comp)
      }
      return cache.get(tag)
    },
  })
  const passthrough: FunctionComponent<{ children?: ReactNode }> = ({ children }) => children
  // Inert motion-value hooks: reduced-motion is forced on, so no rAF is scheduled.
  const useMotionValue = <T,>(init: T) => {
    let v = init
    return { get: () => v, set: (n: T) => { v = n }, on: () => () => {} }
  }
  const useTransform = <In, Out>(mv: { get: () => In }, fn: (v: In) => Out): Out => fn(mv.get())
  const animate = () => ({ stop: () => {} })
  return {
    motion,
    m: motion,
    AnimatePresence: passthrough,
    MotionConfig: passthrough,
    LazyMotion: passthrough,
    domAnimation: {},
    domMax: {},
    useReducedMotion: () => true,
    useMotionValue,
    useTransform,
    animate,
  }
})
