import {
  ArrowsClockwise, Broadcast, CalendarBlank, CheckCircle, Circle, Eye, Fire,
  Heartbeat, Lightning, PersonSimpleRun, PersonSimpleWalk, Snowflake, Sparkle,
  SmileyMeh, SmileyNervous, Target, ThumbsUp, Warning, type Icon as PhosphorIcon,
} from '@phosphor-icons/react'

// Every entry keeps the emoji it replaces so VITE_ICONS=0 restores the old
// look without reverting code. This is also why this file is the one place
// the no-emoji guard exempts.
type Entry = { icon: PhosphorIcon; emoji: string }

// Registry + Icon are one unit; splitting the file would churn every consumer.
// eslint-disable-next-line react-refresh/only-export-components
export const ICONS = {
  stressed:   { icon: SmileyNervous,    emoji: '😓' },
  calm:       { icon: SmileyMeh,        emoji: '😌' },
  warning:    { icon: Warning,          emoji: '⚠' },
  focus:      { icon: Target,           emoji: '🎯' },
  auto:       { icon: ArrowsClockwise,  emoji: '🔄' },
  dayMet:     { icon: CheckCircle,      emoji: '🟢' },
  dayMissed:  { icon: Circle,           emoji: '⚪' },
  streak:     { icon: Fire,             emoji: '🔥' },
  weekly:     { icon: Lightning,        emoji: '⚡' },
  calendar:   { icon: CalendarBlank,    emoji: '📅' },
  planDone:   { icon: CheckCircle,      emoji: '✅' },
  frozen:     { icon: Snowflake,        emoji: '❄️' },
  analyze:    { icon: Sparkle,          emoji: '✦' },
  noData:     { icon: Broadcast,        emoji: '📡' },
  alertHigh:  { icon: Heartbeat,        emoji: '🫀' },
  alertWatch: { icon: Eye,              emoji: '👀' },
  steps:      { icon: PersonSimpleWalk, emoji: '🚶' },
  exercise:   { icon: PersonSimpleRun,  emoji: '🏃' },
  allClear:   { icon: ThumbsUp,         emoji: '👌' },
} as const satisfies Record<string, Entry>

export type IconName = keyof typeof ICONS

interface Props {
  name: IconName
  size?: number
  /** Set only when the icon is the sole carrier of meaning; otherwise it is
      decorative and hidden from screen readers. */
  title?: string
  className?: string
}

// Read per render rather than at module scope: Vite still inlines the value at
// build time, and tests can stub it with vi.stubEnv without resetting modules.
function iconsEnabled() {
  return import.meta.env.VITE_ICONS !== '0'
}

export function Icon({ name, size = 18, title, className }: Props) {
  const { icon: Glyph, emoji } = ICONS[name]
  const a11y = title
    ? { role: 'img' as const, 'aria-label': title }
    : { 'aria-hidden': true }

  if (!iconsEnabled()) {
    return <span className={className} {...a11y}>{emoji}</span>
  }
  return <Glyph size={size} weight="duotone" className={className} {...a11y} />
}
