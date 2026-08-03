import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// tokens()/rule() match on rule boundaries via a plain regex and cannot see
// through comments, so a doc comment sitting right before a selector or a
// declaration would silently break the match (or, later, a hex value quoted
// inside a comment could make a "does not contain #fff" style assertion
// falsely fail). Stripping comments once here keeps both helpers correct
// without needing to duplicate that logic in each of them.
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

const css = stripComments(readFileSync(join(__dirname, 'index.css'), 'utf8'))

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Merged custom properties from every rule whose selector matches exactly. */
export function tokens(source: string, selector: string): Record<string, string> {
  const re = new RegExp(`(^|\\})\\s*${escape(selector)}\\s*\\{([^}]*)\\}`, 'g')
  const out: Record<string, string> = {}
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    for (const decl of m[2].split(';')) {
      const d = /^\s*(--[a-z0-9-]+)\s*:\s*(.+)$/i.exec(decl)
      if (d) out[d[1]] = d[2].trim()
    }
  }
  return out
}

/** Raw declaration text of the first rule with that exact selector. */
export function rule(source: string, selector: string): string {
  const re = new RegExp(`(^|\\})\\s*${escape(selector)}\\s*\\{([^}]*)\\}`)
  const m = re.exec(source)
  if (!m) throw new Error(`rule not found: ${selector}`)
  return m[2]
}

const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

function luminance(hex: string): number {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const [r, g, b] = [0, 2, 4].map(i => channel(parseInt(full.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const MAX_VAR_HOPS = 10

// tokens() returns raw declaration text on purpose (the alias test asserts on
// the literal string `var(--ok)`, and that assertion would become a
// tautology if tokens() resolved it). Contrast checks need an actual color
// though, so aliases like `--accent-text: var(--accent)` are walked down to
// a literal here, at the point of use, instead. Some chains in these maps
// are two hops deep (e.g. --radius -> --r-surface, or --green -> --ok), so
// this walks until it hits a literal rather than assuming one hop, and it
// throws immediately — naming the offending token — if the chain doesn't
// terminate or a referenced token is missing, rather than let a bad value
// surface later as a silent NaN.
function resolveToken(scope: Record<string, string>, name: string): string {
  let current = name
  const seen = new Set<string>()
  for (let hop = 0; hop <= MAX_VAR_HOPS; hop++) {
    if (!(current in scope)) throw new Error(`resolveToken: token not found: ${current}`)
    const value = scope[current]
    const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(value.trim())
    if (!ref) return value
    if (seen.has(current)) throw new Error(`resolveToken: circular reference at ${current}`)
    seen.add(current)
    current = ref[1]
  }
  throw new Error(`resolveToken: chain too deep starting from ${name} (stopped at ${current})`)
}

// One palette, defined once. :root is the dark default and carries it; the
// light block restates it; .app overrides shape only. The landing and the auth
// screen render outside .app and so read the same colours the app does.
const rootTokens = tokens(css, ':root')
const appScope = tokens(css, '.app')
const darkTokens = rootTokens
const lightTokens = { ...rootTokens, ...tokens(css, '[data-theme="light"]') }

const RADII = ['--r-surface', '--r-control', '--r-field', '--r-inner', '--radius']

describe('one palette, two shapes', () => {
  // The rule that keeps the product from drifting into two products again: if
  // .app ever redefines a colour, the landing stops matching it.
  it('the app overrides shape and nothing else', () => {
    const nonRadius = Object.keys(appScope).filter(t => !RADII.includes(t))
    expect(nonRadius).toEqual([])
  })

  it('every token the app overrides has a :root default', () => {
    expect(Object.keys(appScope).filter(t => !(t in rootTokens))).toEqual([])
  })

  // Deliberate, and the thing most likely to be revisited: the landing keeps
  // softer corners than the app. Written out so changing it is a decision
  // rather than an accident.
  it('the landing keeps its own radii, softer than the app', () => {
    expect(rootTokens['--r-surface']).toBe('14px')
    expect(rootTokens['--r-control']).toBe('10px')
    expect(rootTokens['--r-field']).toBe('10px')
    expect(rootTokens['--r-inner']).toBe('6px')
    expect(rootTokens['--radius']).toBe('var(--r-surface)')
    expect(appScope['--r-surface']).toBe('4px')
    expect(appScope['--r-control']).toBe('999px')
  })

  it('the landing takes the app palette, pine and not the old blue', () => {
    expect(darkTokens['--accent']).toBe('#D3E6DD')
    expect(lightTokens['--accent']).toBe('#24443B')
    // A label on the accent fill must come from the pair, not a fixed white:
    // white on the dark theme's pale mint measures 1.30:1.
    expect(darkTokens['--on-accent']).toBe('#0F1422')
    expect(lightTokens['--on-accent']).toBe('#FFFFFF')
  })

  // :root is the dark default, so it must hold the dark chart steps. It used to
  // hold the light ones, which left the landing's demo chart drawing
  // light-theme steps on a dark page.
  it('each theme holds its own chart steps', () => {
    expect(darkTokens['--chart-1']).toBe('#3FA68A')
    expect(lightTokens['--chart-1']).toBe('#0F7F63')
    expect(darkTokens['--heat-1']).toBe('#296556')
    expect(lightTokens['--heat-1']).toBe('#60C7AE')
  })
})

describe('role tokens', () => {
  it('keeps the colour-named tokens as aliases so existing call sites work', () => {
    for (const scope of [darkTokens, lightTokens]) {
      expect(scope['--green']).toBe('var(--ok)')
      expect(scope['--red']).toBe('var(--bad)')
      expect(scope['--yellow']).toBe('var(--warn)')
    }
  })

  it('converges dark and light on one bright set of -fill values', () => {
    // The point of the split: unlike --warn (which must go brown in light
    // theme to stay text-safe), --warn-fill carries no text and both themes
    // land on (almost) the same bright amber.
    expect(darkTokens['--ok-fill']).toBe(lightTokens['--ok-fill'])
    expect(darkTokens['--bad-fill']).toBe(lightTokens['--bad-fill'])
    expect(darkTokens['--warn-fill']).toBe('#E08A3C')
    expect(lightTokens['--warn-fill']).toBe('#E0A33E')
    expect(darkTokens['--warn-fill']).not.toBe(lightTokens['--warn-fill'])
  })
})

describe.each([
  ['dark', darkTokens],
  ['light', lightTokens],
])('%s theme contrast', (_name, t) => {
  const pairs: Array<[string, string, string]> = [
    ['body text on background', '--text', '--bg'],
    ['body text on surface', '--text', '--surface'],
    ['muted text on background', '--text-muted', '--bg'],
    ['muted text on surface', '--text-muted', '--surface'],
    ['accent text on surface', '--accent-text', '--surface'],
    ['button label on accent fill', '--on-accent', '--accent'],
    ['ok on surface', '--ok', '--surface'],
    ['warn on surface', '--warn', '--surface'],
    ['bad on surface', '--bad', '--surface'],
    ['on-ok label on ok fill', '--on-ok', '--ok'],
    ['on-bad label on bad fill', '--on-bad', '--bad'],
  ]

  it.each(pairs)('%s clears 4.5:1', (_label, fg, bg) => {
    expect(contrast(resolveToken(t, fg), resolveToken(t, bg))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('shared shell rules use tokens', () => {
  it('primary button reads its label colour from the accent pair', () => {
    const decls = rule(css, '.btn-primary')
    expect(decls).toMatch(/color:\s*var\(--on-accent\)/)
    expect(decls).not.toMatch(/#fff/)
  })

  it.each(['.btn-primary', '.btn-secondary', '.nav-btn', '.theme-toggle'])(
    '%s uses the control radius token',
    selector => {
      expect(rule(css, selector)).toMatch(/border-radius:\s*var\(--r-control\)/)
    },
  )

  it('metric card uses the surface radius token', () => {
    expect(rule(css, '.metric-card')).toMatch(/border-radius:\s*var\(--r-surface\)/)
  })

  it('the wordmark is accent text, so it takes the readable accent', () => {
    expect(rule(css, '.logo-btn')).toMatch(/color:\s*var\(--accent-text\)/)
  })
})

describe('dashboard status surfaces use tokens', () => {
  it.each(['.readiness-card', '.stress-days-card', '.early-warning', '.context-journal', '.coach-focus-card'])(
    '%s uses the surface radius token',
    selector => {
      expect(rule(css, selector)).toMatch(/border-radius:\s*var\(--r-surface\)/)
    },
  )

  it('status tints are derived from role tokens, not literal rgba', () => {
    // Each tint's percentage is pinned to its own selector: a plain
    // "some color-mix, some percentage" match would stay green even if a
    // conversion silently changed 5% to 50%, which is the exact class of
    // regression this test exists to catch.
    const tints: Array<[string, RegExp]> = [
      ['.sd-item.sd-bad', /background:\s*color-mix\(in srgb,\s*var\(--bad\)\s+5%,\s*transparent\)/],
      ['.sd-item.sd-good', /background:\s*color-mix\(in srgb,\s*var\(--ok\)\s+5%,\s*transparent\)/],
      ['.early-warning', /background:\s*color-mix\(in srgb,\s*var\(--bad\)\s+8%,\s*transparent\)/],
      ['.early-warning', /border:\s*1px solid color-mix\(in srgb,\s*var\(--bad\)\s+30%,\s*transparent\)/],
    ]
    for (const [selector, pattern] of tints) {
      const decls = rule(css, selector)
      expect(decls).toMatch(pattern)
      expect(decls).not.toMatch(/rgba\(\s*\d/)
    }
  })

  it('the accent link colour uses the readable accent, not the fill', () => {
    expect(rule(css, '.link-btn')).toMatch(/color:\s*var\(--accent-text\)/)
    expect(rule(css, '.coach-focus-label')).toMatch(/color:\s*var\(--accent-text\)/)
    expect(rule(css, '.coach-focus-btn')).toMatch(/color:\s*var\(--accent-text\)/)
  })

  it('the done state of the focus button pairs its fill with on-ok', () => {
    expect(rule(css, '.coach-focus-btn.done')).toMatch(/color:\s*var\(--on-ok\)/)
  })

  it('text fields use the field radius, and inner bars the inner one', () => {
    // --r-control goes fully round in the light theme, which is right for a
    // button and wrong for a multi-line textarea — hence the split token.
    for (const selector of ['.cj-textarea', '.settings-input', '.supp-input']) {
      expect(rule(css, selector)).toMatch(/border-radius:\s*var\(--r-field\)/)
    }
    expect(rule(css, '.r-bar-track')).toMatch(/border-radius:\s*var\(--r-inner\)/)
    expect(rule(css, '.r-bar-fill')).toMatch(/border-radius:\s*var\(--r-inner\)/)
  })
})

describe('gamified home surfaces use tokens', () => {
  it.each(['.streak-menu-panel', '.bell-panel', '.bell-item', '.activity-cal', '.empty-state'])(
    '%s uses the surface radius token',
    selector => {
      expect(rule(css, selector)).toMatch(/border-radius:\s*var\(--r-surface\)/)
    },
  )

  it.each(['.streak-menu-trigger', '.bell-trigger', '.empty-state-cta'])(
    '%s uses the control radius token',
    selector => {
      expect(rule(css, selector)).toMatch(/border-radius:\s*var\(--r-control\)/)
    },
  )

  it('every accent-filled surface pairs its text with on-accent', () => {
    for (const selector of ['.empty-state-cta']) {
      const decls = rule(css, selector)
      expect(decls).toMatch(/color:\s*var\(--on-accent\)/)
      expect(decls).not.toMatch(/#fff/)
    }
  })

  it('every role-filled surface pairs its text with the matching on-role token', () => {
    const roleFills: Array<[string, string]> = [
      ['.bell-badge', '--on-bad'],
      ['.activity-cal-week.done', '--on-ok'],
      ['.activity-cal-cell.status-active', '--on-ok'],
    ]
    for (const [selector, onToken] of roleFills) {
      const decls = rule(css, selector)
      expect(decls).toMatch(new RegExp(`color:\\s*var\\(${onToken}\\)`))
      expect(decls).not.toMatch(/#fff/)
    }
  })

  it('the streak today-bar is a bare fill with nothing on it, so it uses --ok-fill not --ok', () => {
    expect(rule(css, '.streak-menu-today-fill')).toMatch(/background:\s*var\(--ok-fill\)/)
  })

  it('bell-item level tints keep their percentages when moved onto role tokens', () => {
    // Pinning the percentage as a literal number bound to its selector and
    // role token, per Task 3's postmortem: a bare "some color-mix, some
    // percentage" match would stay green even if a conversion silently
    // changed e.g. 15% to 50%.
    const tints: Array<[string, RegExp]> = [
      ['.bell-item.level-red .bell-item-icon', /background:\s*color-mix\(in srgb,\s*var\(--bad\)\s+15%,\s*transparent\)/],
      ['.bell-item.level-yellow .bell-item-icon', /background:\s*color-mix\(in srgb,\s*var\(--warn\)\s+20%,\s*transparent\)/],
      // 32%, not 16%: the streak row shares --accent with the base
      // .bell-item-icon tint (12%), so it needs enough density to still
      // read as a distinct row rather than nearly duplicating the base —
      // see the fix-report entry in task-4-report.md for the review finding.
      ['.bell-item.level-streak .bell-item-icon', /background:\s*color-mix\(in srgb,\s*var\(--accent\)\s+32%,\s*transparent\)/],
    ]
    for (const [selector, pattern] of tints) {
      expect(rule(css, selector)).toMatch(pattern)
    }
  })
})
