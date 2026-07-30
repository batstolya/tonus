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

const rootTokens = tokens(css, ':root')
const appDark = tokens(css, '.app')
const appLight = tokens(css, '[data-theme="light"] .app')

describe('token isolation from the landing', () => {
  it('every token overridden in .app has a :root default', () => {
    const missing = Object.keys(appDark).filter(t => !(t in rootTokens))
    expect(missing).toEqual([])
  })

  it('preserves the legacy values the landing renders today', () => {
    // Landing.css:195 reads var(--radius); .btn-primary is used by landing and auth.
    expect(rootTokens['--radius']).toBe('var(--r-surface)')
    expect(rootTokens['--r-surface']).toBe('14px')
    expect(rootTokens['--r-control']).toBe('10px')
    expect(rootTokens['--on-accent']).toBe('#fff')
    expect(rootTokens['--accent']).toBe('#6c8fff')
  })
})

describe('role tokens', () => {
  it('keeps the colour-named tokens as aliases so existing call sites work', () => {
    for (const scope of [rootTokens, appDark, appLight]) {
      expect(scope['--green']).toBe('var(--ok)')
      expect(scope['--red']).toBe('var(--bad)')
      expect(scope['--yellow']).toBe('var(--warn)')
    }
  })
})

describe.each([
  ['dark', appDark],
  ['light', appLight],
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
