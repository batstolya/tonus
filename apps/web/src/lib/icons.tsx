import {
  ArrowDownRight, ArrowsClockwise, ArrowsLeftRight, ArrowUpRight, Barbell, Bed, Broadcast,
  Calendar, CalendarBlank, CalendarDots, CaretRight, ChartBar, CheckCircle, Circle, CloudSun,
  Coffee, Compass, Eye, Fire, Gear, Globe, Heart, Heartbeat, Hourglass, Lightbulb, Lightning, Link,
  Magnet, MagnifyingGlass, Moon, Pause, PersonSimpleRun, PersonSimpleWalk, SignOut, Sneaker,
  Snowflake, SoccerBall, Sparkle, SmileyMeh, SmileyNervous, Sun, Target, TestTube, Thermometer,
  ThumbsUp, TrendDown, TrendUp, Trophy, Volleyball, Warning, Wind, Wine, type Icon as PhosphorIcon,
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
  sportVolleyball: { icon: Volleyball, emoji: '🏐' },
  sportFootball:   { icon: SoccerBall, emoji: '⚽' },
  sportGym:        { icon: Barbell,    emoji: '🏋️' },
  settings:        { icon: Gear,       emoji: '⚙️' },
  chevronRight:    { icon: CaretRight, emoji: '›' },
  signOut:         { icon: SignOut,    emoji: '🚪' },
  magic:      { icon: Sparkle,        emoji: '✨' },
  heart:      { icon: Heart,          emoji: '❤' },
  moon:       { icon: Moon,           emoji: '🌙' },
  shoes:      { icon: Sneaker,        emoji: '👟' },
  pulse:      { icon: Heartbeat,      emoji: '💓' },
  sleepDebt:  { icon: Bed,            emoji: '💤' },
  sleeping:   { icon: Bed,            emoji: '😴' },
  chart:      { icon: ChartBar,       emoji: '📊' },
  breathing:  { icon: Wind,           emoji: '🫁' },
  lab:        { icon: TestTube,       emoji: '🧪' },
  world:      { icon: Globe,          emoji: '🌍' },
  search:     { icon: MagnifyingGlass, emoji: '🔍' },
  dotBad:     { icon: Circle,         emoji: '🔴' },
  dotWarn:    { icon: Circle,         emoji: '🟡' },
  dotOk:      { icon: Circle,         emoji: '🟢' },
  trophy:     { icon: Trophy,         emoji: '🏆' },
  idea:       { icon: Lightbulb,      emoji: '💡' },
  arrowUpRight:   { icon: ArrowUpRight,     emoji: '↗' },
  arrowDownRight: { icon: ArrowDownRight,   emoji: '↘' },
  swap:           { icon: ArrowsLeftRight,  emoji: '↔' },
  pending:        { icon: Hourglass,        emoji: '⏳' },
  pause:          { icon: Pause,            emoji: '⏸' },
  sun:           { icon: Sun,            emoji: '☀' },
  coffee:        { icon: Coffee,         emoji: '☕' },
  alcohol:       { icon: Wine,           emoji: '🍷' },
  temperature:   { icon: Thermometer,    emoji: '🌡' },
  weather:       { icon: CloudSun,       emoji: '🌦' },
  link:          { icon: Link,           emoji: '🔗' },
  compass:       { icon: Compass,        emoji: '🧭' },
  magnet:        { icon: Magnet,         emoji: '🧲' },
  trendUp:       { icon: TrendUp,        emoji: '📈' },
  trendDown:     { icon: TrendDown,      emoji: '📉' },
  dotInfo:       { icon: Circle,         emoji: '🔵' },
  calendarRange: { icon: CalendarDots,   emoji: '📆' },
  // Brief specifies CalendarBlank here, but that's already `calendar`'s
  // component (📅) — reusing it would violate the no-shared-component rule
  // for names outside the deliberate dot* exception. Calendar (verified
  // present in @phosphor-icons/react@2.1.10) gives `schedule` its own shape.
  schedule:      { icon: Calendar,       emoji: '🗓' },
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
    return <span className={className} title={title} {...a11y}>{emoji}</span>
  }
  return <Glyph size={size} weight="duotone" className={className} alt={title} {...a11y} />
}
