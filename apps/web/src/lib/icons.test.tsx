import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ICONS, Icon, type IconName } from './icons'

const names = Object.keys(ICONS) as IconName[]

// Independent restatement of the spec's name -> Phosphor component mapping,
// NOT derived from ICONS: a transposed registry (e.g. focus <-> streak) would
// still be internally self-consistent, so the expected values must come from
// somewhere other than the file under test. Phosphor v2 components set a
// stable displayName of the form `${ComponentName}Icon` (verified against the
// installed @phosphor-icons/react@2.1.10 package), which lets us check
// identity without importing all 18 components individually.
const expectedComponentName: Record<IconName, string> = {
  stressed: 'SmileyNervousIcon',
  calm: 'SmileyMehIcon',
  warning: 'WarningIcon',
  warningPlain: 'WarningIcon',
  focus: 'TargetIcon',
  auto: 'ArrowsClockwiseIcon',
  dayMet: 'CheckCircleIcon',
  dayMissed: 'CircleIcon',
  streak: 'FireIcon',
  weekly: 'LightningIcon',
  calendar: 'CalendarBlankIcon',
  planDone: 'CheckCircleIcon',
  frozen: 'SnowflakeIcon',
  analyze: 'SparkleIcon',
  noData: 'BroadcastIcon',
  alertHigh: 'HeartbeatIcon',
  alertWatch: 'EyeIcon',
  steps: 'PersonSimpleWalkIcon',
  exercise: 'PersonSimpleRunIcon',
  allClear: 'ThumbsUpIcon',
  sportVolleyball: 'VolleyballIcon',
  sportFootball: 'SoccerBallIcon',
  sportGym: 'BarbellIcon',
  settings: 'GearIcon',
  chevronRight: 'CaretRightIcon',
  signOut: 'SignOutIcon',
  magic: 'SparkleIcon',
  heart: 'HeartIcon',
  moon: 'MoonIcon',
  shoes: 'SneakerIcon',
  pulse: 'PulseIcon',
  sleepDebt: 'MoonStarsIcon',
  sleeping: 'BedIcon',
  chart: 'ChartBarIcon',
  breathing: 'WindIcon',
  lab: 'TestTubeIcon',
  world: 'GlobeIcon',
  search: 'MagnifyingGlassIcon',
  dotBad: 'CircleIcon',
  dotWarn: 'CircleIcon',
  dotOk: 'CircleIcon',
  trophy: 'TrophyIcon',
  idea: 'LightbulbIcon',
  arrowUpRight: 'ArrowUpRightIcon',
  arrowDownRight: 'ArrowDownRightIcon',
  swap: 'ArrowsLeftRightIcon',
  pending: 'HourglassIcon',
  pause: 'PauseIcon',
  sun: 'SunIcon',
  coffee: 'CoffeeIcon',
  alcohol: 'WineIcon',
  temperature: 'ThermometerIcon',
  weather: 'CloudSunIcon',
  link: 'LinkIcon',
  compass: 'CompassIcon',
  magnet: 'MagnetIcon',
  trendUp: 'TrendUpIcon',
  trendDown: 'TrendDownIcon',
  dotInfo: 'CircleIcon',
  calendarRange: 'CalendarDotsIcon',
  schedule: 'CalendarIcon',
  clock: 'ClockIcon',
  microscope: 'MicroscopeIcon',
  photo: 'CameraIcon',
  locked: 'LockIcon',
  reminder: 'AlarmIcon',
  meal: 'ForkKnifeIcon',
  edit: 'PencilIcon',
  editSimple: 'PencilSimpleIcon',
  snapshot: 'ImageSquareIcon',
  location: 'MapPinIcon',
  archive: 'PackageIcon',
  print: 'PrinterIcon',
  import: 'DownloadSimpleIcon',
  water: 'DropIcon',
  meds: 'PillIcon',
  illness: 'VirusIcon',
  travel: 'SuitcaseIcon',
  note: 'NotePencilIcon',
  stressAnxious: 'SmileyNervousIcon',
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('icon registry', () => {
  it('covers every name with a Phosphor component and the emoji it replaces', () => {
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const entry = ICONS[name]
      expect(typeof entry.icon, `${name}.icon`).toBe('object')
      expect(entry.emoji, `${name}.emoji`).toMatch(/\S/)
    }
  })

  it('renders an svg for every name', () => {
    for (const name of names) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector('svg'), `${name} should render an svg`).not.toBeNull()
      unmount()
    }
  })

  it('renders the Phosphor component the spec assigns to each name', () => {
    // expect.soft: keep checking after a mismatch so a transposition that
    // touches multiple keys (e.g. focus <-> streak) names all of them in one
    // failure, instead of stopping at the first.
    for (const name of names) {
      expect.soft(ICONS[name].icon.displayName, `${name}.icon`).toBe(expectedComponentName[name])
    }
  })

  it('renders the emoji instead when VITE_ICONS is 0', () => {
    vi.stubEnv('VITE_ICONS', '0')
    for (const name of names) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector('svg'), `${name} should not render an svg`).toBeNull()
      expect(container.textContent, `${name} should render its emoji`).toBe(ICONS[name].emoji)
      unmount()
    }
  })

  it('hides decorative icons from screen readers', () => {
    const { container } = render(<Icon name="streak" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('role')).toBeNull()
  })

  it('exposes a label when the icon carries the meaning', () => {
    const { container } = render(<Icon name="streak" title="Серия" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toBe('Серия')
    expect(svg.getAttribute('aria-hidden')).toBeNull()
  })

  it('labels the emoji fallback the same way', () => {
    vi.stubEnv('VITE_ICONS', '0')
    const { container } = render(<Icon name="streak" title="Серия" />)
    const span = container.querySelector('span')!
    expect(span.getAttribute('role')).toBe('img')
    expect(span.getAttribute('aria-label')).toBe('Серия')
  })

  it('renders a real tooltip alongside the label, not just the accessible name', () => {
    const { container } = render(<Icon name="streak" title="Серия" />)
    const svg = container.querySelector('svg')!
    const titleEl = svg.querySelector('title')
    expect(titleEl, 'svg should contain a <title> child').not.toBeNull()
    expect(titleEl!.textContent).toBe('Серия')
  })

  it('gives the emoji fallback a title attribute too', () => {
    vi.stubEnv('VITE_ICONS', '0')
    const { container } = render(<Icon name="streak" title="Серия" />)
    const span = container.querySelector('span')!
    expect(span.getAttribute('title')).toBe('Серия')
  })
})
