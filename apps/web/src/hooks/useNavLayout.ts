import { useState } from 'react'

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

export function useNavLayout() {
  const [layout, setLayoutState] = useState<NavLayout>(() => resolveNavLayout(read(LAYOUT_KEY)))
  const [collapsed, setCollapsedState] = useState<boolean>(() => resolveNavCollapsed(read(COLLAPSED_KEY)))

  function setLayout(next: NavLayout) {
    write(LAYOUT_KEY, next)
    setLayoutState(next)
  }

  function toggleCollapsed() {
    setCollapsedState(prev => {
      const next = !prev
      write(COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  return { layout, setLayout, collapsed, toggleCollapsed }
}
