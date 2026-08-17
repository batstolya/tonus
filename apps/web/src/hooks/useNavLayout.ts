import { useSyncExternalStore } from 'react'

// Which navigation layout the app shows on wide screens: the historical top bar
// or the opt-in left sidebar. Per-device on purpose — this is a trial layout,
// not a profile setting (see the design spec).
export type NavLayout = 'top' | 'side'

const LAYOUT_KEY = 'navLayout'
const COLLAPSED_KEY = 'navCollapsed'

export function resolveNavLayout(saved: string | null): NavLayout {
  return saved === 'side' ? 'side' : 'top'
}

export function resolveNavCollapsed(saved: string | null): boolean {
  return saved === '1'
}

// localStorage throws in private-mode Safari and when storage is full. The
// layout is a cosmetic preference: swallow the failure and use the default
// rather than taking the whole app down.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* preference is not worth an error */
  }
}

// Module-level store shared by every call site, so a change made by one
// component (e.g. the Settings switch) is immediately visible to every other
// component (e.g. the sidebar itself) without a page reload. useState alone
// cannot do this: each call site would hold its own disconnected copy.
let layoutState: NavLayout = resolveNavLayout(read(LAYOUT_KEY))
let collapsedState: boolean = resolveNavCollapsed(read(COLLAPSED_KEY))
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  for (const listener of listeners) listener()
}

// Reconciles the cached module state against localStorage before returning
// it. This keeps the store correct even when storage changes outside our own
// setters — most notably, a fresh page load runs this module once and the
// cache starts from whatever was persisted last session. Cheap to call on
// every render: a single synchronous localStorage read, no allocation.
function getLayoutSnapshot(): NavLayout {
  const fromStorage = resolveNavLayout(read(LAYOUT_KEY))
  if (fromStorage !== layoutState) layoutState = fromStorage
  return layoutState
}

function getCollapsedSnapshot(): boolean {
  const fromStorage = resolveNavCollapsed(read(COLLAPSED_KEY))
  if (fromStorage !== collapsedState) collapsedState = fromStorage
  return collapsedState
}

function setLayout(next: NavLayout) {
  write(LAYOUT_KEY, next)
  layoutState = next
  notify()
}

function toggleCollapsed() {
  const next = !collapsedState
  write(COLLAPSED_KEY, next ? '1' : '0')
  collapsedState = next
  notify()
}

export function useNavLayout() {
  const layout = useSyncExternalStore(subscribe, getLayoutSnapshot)
  const collapsed = useSyncExternalStore(subscribe, getCollapsedSnapshot)

  return { layout, setLayout, collapsed, toggleCollapsed }
}
