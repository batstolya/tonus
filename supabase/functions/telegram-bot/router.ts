// Pure routing for webhook updates: string in, route tag out. No Deno globals
// and no network imports — vitest runs router.test.ts alongside _shared tests.

export type TextRoute =
  | { kind: 'start'; token: string }
  | { kind: 'menu' } | { kind: 'report' } | { kind: 'status' } | { kind: 'last' }
  | { kind: 'sync' } | { kind: 'pause' } | { kind: 'resume' }
  | { kind: 'football' } | { kind: 'matches' } | { kind: 'football_on' } | { kind: 'football_off' }
  | { kind: 'tokens' } | { kind: 'usage' } | { kind: 'ideas' } | { kind: 'widget' }
  | { kind: 'idea'; idea: string }
  | { kind: 'unknown_command' }
  | { kind: 'chat' }

const EXACT_TEXT = new Set([
  'menu', 'report', 'status', 'last', 'sync', 'pause', 'resume',
  'football', 'matches', 'football_on', 'football_off',
  'tokens', 'usage', 'ideas', 'widget',
] as const)
type ExactText = typeof EXACT_TEXT extends Set<infer T> ? T : never

export function routeText(text: string): TextRoute {
  // Historical startsWith semantics: bare /start and /start<garbage> greet,
  // /start <token> links the account.
  if (text.startsWith('/start')) return { kind: 'start', token: text.split(' ')[1] ?? '' }
  if (text === '/idea' || text.startsWith('/idea ')) {
    return { kind: 'idea', idea: text.slice('/idea'.length).trim() }
  }
  if (text.startsWith('/')) {
    const cmd = text.slice(1)
    if ((EXACT_TEXT as Set<string>).has(cmd)) return { kind: cmd as ExactText }
    return { kind: 'unknown_command' }
  }
  return { kind: 'chat' }
}

export type CallbackRoute =
  | { kind: 'menu' } | { kind: 'report' } | { kind: 'status' } | { kind: 'supplements' }
  | { kind: 'goals' } | { kind: 'settings' } | { kind: 'exp_suggest' }
  | { kind: 'pause' } | { kind: 'resume' } | { kind: 'disconnect' }
  | { kind: 'fb_matches' } | { kind: 'fb_on' } | { kind: 'fb_off' } | { kind: 'nudge_no' }
  | { kind: 'expsug'; eventId: string }
  | { kind: 'wellbeing'; date: string; score: number }
  | { kind: 'take'; supplementId: string }
  | { kind: 'reminder'; action: 'take' | 'snz' | 'skip'; eventId: string; minutes: number }
  | { kind: 'nudge_acc'; subtype: string }
  | { kind: 'football_response'; data: string }
  | { kind: 'ignore' }

const PLAIN_CALLBACKS = new Set([
  'menu', 'report', 'status', 'supplements', 'goals', 'settings', 'exp_suggest',
  'pause', 'resume', 'disconnect', 'fb_matches', 'fb_on', 'fb_off', 'nudge_no',
] as const)
type PlainCallback = typeof PLAIN_CALLBACKS extends Set<infer T> ? T : never

export function routeCallback(data: string): CallbackRoute {
  if ((PLAIN_CALLBACKS as Set<string>).has(data)) return { kind: data as PlainCallback }
  if (data.startsWith('expsug:')) return { kind: 'expsug', eventId: data.slice('expsug:'.length) }
  if (data.startsWith('wb:')) {
    const [, date, scoreStr] = data.split(':')
    return { kind: 'wellbeing', date: date ?? '', score: Number(scoreStr) }
  }
  if (data.startsWith('rem_skip_')) return { kind: 'reminder', action: 'skip', eventId: data.slice('rem_skip_'.length), minutes: 60 }
  if (data.startsWith('rem_snz_')) {
    const rest = data.slice('rem_snz_'.length)
    const idx = rest.lastIndexOf('_')
    return { kind: 'reminder', action: 'snz', eventId: rest.slice(0, idx), minutes: parseInt(rest.slice(idx + 1), 10) || 60 }
  }
  if (data.startsWith('rem_take_')) return { kind: 'reminder', action: 'take', eventId: data.slice('rem_take_'.length), minutes: 60 }
  if (data.startsWith('take_')) return { kind: 'take', supplementId: data.slice('take_'.length) }
  if (data.startsWith('nudge_acc:')) return { kind: 'nudge_acc', subtype: data.slice('nudge_acc:'.length) }
  if (data.startsWith('fw:')) return { kind: 'football_response', data }
  return { kind: 'ignore' }
}
