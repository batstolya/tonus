import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import { createElement, type ReactNode, type FunctionComponent } from 'react'

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

// ---------------------------------------------------------------------------
// Network isolation: the jsdom project never touches the network. Real
// requests from mount effects used to resolve after jsdom teardown and fail
// unrelated tests (#93). Tests that need data still vi.mock their api module;
// this is the inert safety net underneath.
// ---------------------------------------------------------------------------

const inertResult = { data: null, error: null, count: null }

// Chainable thenable: every method returns the chain, `await` resolves inert.
function chain(): unknown {
  const proxy: unknown = new Proxy(() => proxy, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => Promise.resolve(inertResult).then(resolve)
      }
      return () => proxy
    },
    apply: () => proxy,
  })
  return proxy
}

vi.mock('./src/lib/supabase', () => ({
  supabase: {
    from: () => chain(),
    rpc: () => chain(),
    storage: { from: () => chain() },
    functions: { invoke: async () => inertResult },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOtp: async () => ({ data: {}, error: null }),
      signOut: async () => ({ error: null }),
    },
    channel: () => chain(),
    removeChannel: () => {},
  },
}))

// Direct fetch sites (geocoding, food search, callFunction) get an inert 200.
vi.stubGlobal('fetch', vi.fn(async () =>
  new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
))
