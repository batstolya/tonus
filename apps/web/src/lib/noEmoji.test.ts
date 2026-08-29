import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ICONS } from './icons'

// Files the icon pilot has converted. Later tasks append to this list.
// Kept as a literal list (rather than deriving it inline) so a removed call
// site is a visible diff here too — but derivePilotFiles() below cross-checks
// it against the real source tree, so a call site added without updating
// this list fails loudly instead of slipping through unguarded.
const PILOT_FILES = [
  'App.tsx',
  'components/dashboard/Dashboard.tsx',
  'components/dashboard/StreakStats.tsx',
  'components/dashboard/WorkoutPlanCard.tsx',
  'components/dashboard/NotificationBell.tsx',
  'components/dashboard/StreakMenu.tsx',
  'components/dashboard/ActivityCalendar.tsx',
  'components/dashboard/AiAnalysisBlock.tsx',
  'components/dashboard/CoachFocusCard.tsx',
  'components/dashboard/FocusBadge.tsx',
  'components/research/ExperimentCard.tsx',
  'components/research/ExperimentsScreen.tsx',
  'components/research/ResearchScreen.tsx',
  'components/goals/GoalsScreen.tsx',
  'components/insights/CorrelationsBlock.tsx',
  'components/metrics/MetricsScreen.tsx',
  'components/insights/InsightsScreen.tsx',
  'components/activity/ActivityScreen.tsx',
  'components/heart-rate/HeartRateScreen.tsx',
  'components/stress-map/StressMapScreen.tsx',
  'components/supplements/AdherenceBlock.tsx',
  'components/supplements/SupplementSchedule.tsx',
  'components/supplements/SupplementsScreen.tsx',
  'components/supplements/TreatmentTracker.tsx',
  'components/concerns/ConcernsScreen.tsx',
  'components/intake/QuickLog.tsx',
  'components/navigation/Sidebar.tsx',
  'components/nutrition/MealLogger.tsx',
  'components/nutrition/NutritionScreen.tsx',
  'components/settings/DoctorReport.tsx',
  'components/settings/sections/EnvironmentSection.tsx',
  'components/settings/sections/ExportSection.tsx',
  'components/settings/sections/ImportSection.tsx',
  'components/settings/sections/TelegramSection.tsx',
  'components/upload/UploadScreen.tsx',
  'components/onboarding/guide/StepSchedule.tsx',
  'components/landing/LandingScreen.tsx',
  'components/landing/blocks/ChatBlock.tsx',
  'components/landing/blocks/FeatureGrid.tsx',
  'components/landing/blocks/TelegramBlock.tsx',
  'components/landing/blocks/TrustStrip.tsx',
  'components/auth/AuthScreen.tsx',
  'components/ui/Avatar.tsx',
  'components/ui/TopbarAvatar.tsx',
  'components/habits/HabitCard.tsx',
]

const REPLACED = Object.values(ICONS).map(e => e.emoji)

// Scans src/** (not just components/**) for non-test source files that
// import the icon registry — those are the files that render icons and so
// must carry no leftover emoji. Test files are excluded: they import Icon to
// build props for the component under test, not to render emoji-replacing UI
// themselves. Walking all of src (rather than just components/) is what
// catches App.tsx, which lives at the src root.
function derivePilotFiles(): string[] {
  const srcDir = join(__dirname, '..')
  const out: string[] = []
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) continue
      const source = readFileSync(full, 'utf8')
      if (/from\s+['"][^'"]*\/lib\/icons['"]/.test(source)) {
        out.push(relative(srcDir, full).split('\\').join('/'))
      }
    }
  }
  walk(srcDir)
  return out.sort()
}

// ActivityCalendar's, SupplementsScreen's and QuickLog's month/day-nav
// buttons render literal '‹'/'›' pagination arrows that predate the icon
// registry and have nothing to do with any entry in it (they never went
// through an emoji->icon conversion). They only collide here because the
// registry's chevronRight entry — used by the mobile drawer — happens to
// reuse the same glyph. This is a narrow, understood
// exemption, not a loosening of the check for genuine leftover emoji.
const KNOWN_NON_REGISTRY_COLLISIONS: Partial<Record<string, string[]>> = {
  'components/dashboard/ActivityCalendar.tsx': ['›'],
  // Same story: ConcernsScreen's card disclosure '›' predates the icon
  // registry and isn't an emoji->icon conversion site — it just happens to
  // share chevronRight's glyph.
  'components/supplements/SupplementsScreen.tsx': ['›'],
  'components/concerns/ConcernsScreen.tsx': ['›'],
  // QuickLog's day-nav arrows, same story as the files above: they arrived
  // with the day-paging feature and match ActivityCalendar's and
  // SupplementsScreen's month-nav. The event-type emoji that used to be
  // exempt here are gone — the labels no longer carry them.
  'components/intake/QuickLog.tsx': ['›'],
  // Not a conversion site: these three sit inside mock Telegram messages that
  // depict what the bot actually sends. Telegram is a place where emoji are
  // native, so drawing our icon set there would make the mock-up look less
  // like Telegram, not more like us. Same reason TelegramDemo.tsx keeps its
  // whole chat in emoji and never imports the registry at all.
  'components/landing/blocks/TelegramBlock.tsx': ['💊', '☕', '📊'],
}

// The broad pictographic sweep below has no per-file mechanism of its own, so
// the one file with a legitimate exemption gets its counts pinned here. A bare
// allow-list would let a fourth, genuinely stray emoji hide behind the three
// that belong; pinning the count fails the moment the number moves.
const MOCK_MESSAGE_EMOJI: Partial<Record<string, Record<string, number>>> = {
  'components/landing/blocks/TelegramBlock.tsx': { '💊': 1, '☕': 1, '📊': 1 },
}

describe('converted files carry no emoji', () => {
  for (const file of PILOT_FILES) {
    it(file, () => {
      const source = readFileSync(join(__dirname, '..', file), 'utf8')
      const exempt = KNOWN_NON_REGISTRY_COLLISIONS[file] ?? []
      const found = REPLACED.filter(emoji => source.includes(emoji) && !exempt.includes(emoji))
      expect(found, `${file} still contains ${found.join(' ')}`).toEqual([])
    })
  }

  // A ninth converted file (or a removed one) must show up here, not just
  // silently go unguarded because PILOT_FILES above wasn't updated.
  it('PILOT_FILES matches every non-test component that imports the icon registry', () => {
    expect(derivePilotFiles()).toEqual([...PILOT_FILES].sort())
  })

  // The registry-emoji check above only rejects the 19 emoji ICONS already
  // replaced, so a brand-new emoji (or a variation-selector mismatch, e.g.
  // '❄️' vs a bare '❄') would slip through silently. Sweep every pictographic
  // codepoint instead, excluding the two typographic glyphs ('✓' U+2713 and
  // '✕' U+2715) this branch deliberately keeps outside the icon registry.
  const PICTOGRAPHIC = /\p{Extended_Pictographic}/gu
  const ALLOWED = new Set(['\u2713', '\u2715'])
  for (const file of PILOT_FILES) {
    it(`${file} carries no unregistered pictographic character`, () => {
      const source = readFileSync(join(__dirname, '..', file), 'utf8')
      const matches = [...source.matchAll(PICTOGRAPHIC)].map(m => m[0])
      const pinned = MOCK_MESSAGE_EMOJI[file] ?? {}

      const unexpected = matches.filter(ch => !ALLOWED.has(ch) && !(ch in pinned))
      expect(unexpected, `${file} still contains ${unexpected.join(' ')}`).toEqual([])

      // Exempt glyphs are exempt only up to their pinned count.
      const counts: Record<string, number> = {}
      for (const ch of matches) counts[ch] = (counts[ch] ?? 0) + 1
      for (const [ch, expected] of Object.entries(pinned)) {
        expect(
          counts[ch] ?? 0,
          `${file}: expected exactly ${expected} occurrence(s) of ${ch}, found ${counts[ch] ?? 0}`,
        ).toBe(expected)
      }
    })
  }
})
