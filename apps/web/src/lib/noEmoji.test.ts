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
  'components/ui/DataGapsBadge.tsx',
  'components/research/ExperimentCard.tsx',
  'components/research/ExperimentsScreen.tsx',
  'components/research/ResearchScreen.tsx',
  'components/goals/GoalsScreen.tsx',
  'components/insights/CorrelationsBlock.tsx',
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
  'components/nutrition/MealLogger.tsx',
  'components/nutrition/NutritionScreen.tsx',
  'components/settings/DoctorReport.tsx',
  'components/settings/sections/EnvironmentSection.tsx',
  'components/settings/sections/ExportSection.tsx',
  'components/settings/sections/ImportSection.tsx',
  'components/settings/sections/TelegramSection.tsx',
  'components/upload/UploadScreen.tsx',
  'components/onboarding/guide/StepSchedule.tsx',
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

// ActivityCalendar's month-nav buttons render a literal '›'/'‹' pagination
// arrow that predates the icon registry and has nothing to do with any entry
// in it (it never went through an emoji->icon conversion). It only collides
// here because the mobile-drawer chevron's fallback emoji happens to be the
// same glyph. This is a narrow, understood exemption, not a loosening of the
// check for genuine leftover emoji.
const KNOWN_NON_REGISTRY_COLLISIONS: Partial<Record<string, string[]>> = {
  'components/dashboard/ActivityCalendar.tsx': ['›'],
  // Same story: SupplementsScreen's month-nav '›' and ConcernsScreen's card
  // disclosure '›' predate the icon registry and aren't emoji->icon
  // conversion sites — they just happen to share chevronRight's glyph.
  // (SupplementsScreen's month-nav also renders a '‹' — no registry entry
  // uses that glyph, so it was never flagged and needs no exemption here.)
  'components/supplements/SupplementsScreen.tsx': ['›'],
  'components/concerns/ConcernsScreen.tsx': ['›'],
  // QuickLog's day-nav arrows, same story as the three files above: they
  // arrived with the day-paging feature and match ActivityCalendar's and
  // SupplementsScreen's month-nav. The event-type emoji that used to be
  // exempt here are gone — the labels no longer carry them.
  'components/intake/QuickLog.tsx': ['›'],
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

      // No per-file exemptions any more. QuickLog's translation-key emoji were
      // the only ones, and they carried a pinned-count mechanism so an extra
      // occurrence could not hide behind a bare allow-list. Decoupling the
      // icon from the key removed the last of them, so the sweep is now
      // unconditional: any pictographic character outside ALLOWED fails.
      const unexpected = matches.filter(ch => !ALLOWED.has(ch))
      expect(unexpected, `${file} still contains ${unexpected.join(' ')}`).toEqual([])
    })
  }
})
