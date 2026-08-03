import {
  Alarm, ArrowDownRight, ArrowsClockwise, ArrowsLeftRight, ArrowUpRight, Barbell, Bed, Broadcast,
  Calendar, CalendarBlank, CalendarDots, Camera, CaretRight, ChartBar, CheckCircle,
  Circle, Clock, CloudSun, Coffee, Compass, DownloadSimple, Drop, Eye, Fire, ForkKnife, Gear,
  Globe, Heart, Heartbeat, Hourglass, ImageSquare, Lightbulb, Lightning, Link, Lock, Magnet,
  MagnifyingGlass, MapPin, Microscope, Moon, MoonStars, NotePencil, Package, Pause, Pencil,
  PencilSimple, PersonSimpleRun, PersonSimpleWalk, Pill, Printer, Pulse, SignOut, Sneaker,
  Snowflake, SoccerBall, Sparkle, SmileyMeh, SmileyNervous, Suitcase, Sun, Target, TestTube,
  Thermometer, ThumbsUp, TrendDown, TrendUp, Trophy, Virus, Volleyball, Warning, Wind, Wine,
  type Icon as PhosphorIcon,
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
  warning:    { icon: Warning,          emoji: '⚠️' },
  // Same Warning shape, deliberately: both entries are the same "heads up"
  // triangle, just carrying the two different literal byte-forms the source
  // files actually used (⚠️ with U+FE0F vs. bare ⚠). Splitting rather than
  // picking a "majority" form — the real tally across every warning site is
  // 6 with the selector to 7 without, not the lopsided split once assumed —
  // keeps VITE_ICONS=0 byte-identical to source everywhere instead of
  // guessing. Mirrors the existing dayMet/planDone precedent of two names
  // sharing one component for the same concept.
  warningPlain: { icon: Warning,        emoji: '⚠' },
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
  heart:      { icon: Heart,          emoji: '❤️' },
  moon:       { icon: Moon,           emoji: '🌙' },
  shoes:      { icon: Sneaker,        emoji: '👟' },
  // Was Heartbeat, same as alertHigh — indistinguishable on an experiment
  // card when one tracks hrv and another restingHeartRate. Pulse (an ECG
  // trace) fits the HRV metric this name is actually used for; alertHigh
  // keeps Heartbeat since it also carries NotificationBell's general
  // high-severity alert, not just this one metric.
  pulse:      { icon: Pulse,          emoji: '💓' },
  // Was Bed, same as sleeping — indistinguishable when one card tracks
  // sleepHours and another sleepREM. MoonStars fits the REM/night-phase
  // concept better than a literal bed; sleeping keeps Bed for the
  // total-hours-in-bed metric.
  sleepDebt:  { icon: MoonStars,      emoji: '💤' },
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
  sun:           { icon: Sun,            emoji: '☀️' },
  coffee:        { icon: Coffee,         emoji: '☕' },
  alcohol:       { icon: Wine,           emoji: '🍷' },
  temperature:   { icon: Thermometer,    emoji: '🌡️' },
  weather:       { icon: CloudSun,       emoji: '🌦️' },
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
  clock:      { icon: Clock,      emoji: '🕐' },
  microscope: { icon: Microscope, emoji: '🔬' },
  photo:      { icon: Camera,     emoji: '📷' },
  locked:     { icon: Lock,       emoji: '🔒' },
  // Not in the task brief's survey — the Extended_Pictographic guard also
  // flags the reminder-editor's alarm clock (⏰), one of the glyphs earlier
  // batches found the plan's grep ranges missed. Mirrors that precedent.
  reminder:   { icon: Alarm,      emoji: '⏰' },
  meal:       { icon: ForkKnife,     emoji: '🍽' },
  edit:       { icon: Pencil,        emoji: '✏️' },
  editSimple: { icon: PencilSimple,  emoji: '✎' },
  // Brief specifies Camera here, same as `photo` — that would violate the
  // no-shared-component rule with no colour to distinguish them, so this
  // uses ImageSquare instead. `photo` already covers Camera (batch 3).
  snapshot:   { icon: ImageSquare,   emoji: '📸' },
  location: { icon: MapPin,         emoji: '📍' },
  archive:  { icon: Package,        emoji: '📦' },
  print:    { icon: Printer,        emoji: '🖨' },
  import:   { icon: DownloadSimple, emoji: '📥' },
  // Quick-log event types. These emoji were the one batch the icon rollout
  // deliberately skipped: they were embedded in the translation keys
  // themselves ('☕ Кофе'), so converting them meant decoupling icon from key
  // across three dictionaries first. `coffee`, `alcohol`, `meal` and
  // `sportGym` above already cover four of the ten.
  water:    { icon: Drop,           emoji: '💧' },
  meds:     { icon: Pill,           emoji: '💊' },
  // 🤒 is a face holding a thermometer, but `temperature` already registers
  // Thermometer for the weather reading. Virus keeps illness distinguishable
  // from a warm afternoon rather than drawing both the same.
  illness:  { icon: Virus,          emoji: '🤒' },
  travel:   { icon: Suitcase,       emoji: '🧳' },
  note:     { icon: NotePencil,     emoji: '📝' },
  // Same SmileyNervous as `stressed`, deliberately: one concept, two literal
  // emoji forms in the source (😓 there, 😰 here). Follows the
  // warning/warningPlain precedent — a name per byte-form keeps VITE_ICONS=0
  // byte-identical to what each call site used to render.
  stressAnxious: { icon: SmileyNervous, emoji: '😰' },
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
