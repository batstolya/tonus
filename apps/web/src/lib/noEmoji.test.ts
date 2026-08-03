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
  'components/ui/DataGaps.tsx',
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
  // Different story from the rest of this map: QuickLog.tsx's EVENT_TYPES
  // labels (e.g. '☕ Кофе') embed these emoji as part of a translation key.
  // translate() falls back to the Russian source string on a missing key,
  // so rewriting a label without updating every dictionary entry would
  // silently regress uk/en users to Russian — out of scope for the icon
  // rollout, left for the i18n pass. Only the standalone caffeine-icon and
  // date-picker emoji in this file were converted to <Icon>.
  //
  // The label's weight-lifter glyph carries a variation selector ('🏋️'),
  // byte-for-byte identical to `sportGym`'s registered emoji — that's the
  // only weight-lifter form registered now. An earlier draft of this
  // rollout also registered a `workout` entry for the bare, selector-less
  // codepoint ('🏋', no variation selector), but that codepoint appears
  // nowhere in the codebase (this label's glyph has always carried the
  // selector) and `workout` reused `sportGym`'s Barbell component with no
  // colour to distinguish them, so `workout` was removed as dead and
  // colliding.
  'components/intake/QuickLog.tsx':
    ['☕', '🍷', '🍽', '💧', '💊', '🏋️', '🤒', '😰', '🧳', '📝'],
}

// Mirrors KNOWN_NON_REGISTRY_COLLISIONS above but for the broader
// Extended_Pictographic sweep below, which has no per-file exemption
// mechanism of its own. Same QuickLog.tsx translation-key rationale as the
// comment on that map — kept as a separate list because the two checks
// exist to catch different failure modes (a registered emoji left behind
// vs. any new, unregistered pictographic character), and conflating their
// exemptions would let a genuinely new stray emoji in QuickLog.tsx slip
// through unnoticed.
//
// Each value is pinned to the exact number of times that glyph appears in
// today's EVENT_TYPES label array (every glyph below appears exactly once,
// as the first character of its label). A plain "these glyphs are exempt"
// list would filter the glyph out of the *whole file's* source text, so an
// extra occurrence added elsewhere in QuickLog.tsx — e.g. a fresh standalone
// JSX node — would silently pass. Pinning the count instead means the sweep
// below fails the moment the observed count no longer matches, catching
// exactly the regression a bare allow-list would miss.
const KNOWN_TRANSLATION_KEY_EMOJI_COUNTS: Partial<Record<string, Record<string, number>>> = {
  'components/intake/QuickLog.tsx': {
    '☕': 1, '🍷': 1, '🍽': 1, '💧': 1, '💊': 1, '🏋': 1, '🤒': 1, '😰': 1, '🧳': 1, '📝': 1,
  },
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
      const exemptCounts = KNOWN_TRANSLATION_KEY_EMOJI_COUNTS[file] ?? {}
      const matches = [...source.matchAll(PICTOGRAPHIC)].map(m => m[0])

      // Anything pictographic that isn't globally allowed and isn't one of
      // this file's pinned-count exemptions is an unconditional failure.
      const unexpected = matches.filter(ch => !ALLOWED.has(ch) && !(ch in exemptCounts))
      expect(unexpected, `${file} still contains ${unexpected.join(' ')}`).toEqual([])

      // Exempted glyphs are only exempt up to their pinned count: an extra
      // occurrence (e.g. the same glyph reintroduced as a standalone JSX
      // node) pushes the observed count past the pin and fails here.
      const counts: Record<string, number> = {}
      for (const ch of matches) counts[ch] = (counts[ch] ?? 0) + 1
      for (const [ch, expectedCount] of Object.entries(exemptCounts)) {
        expect(
          counts[ch] ?? 0,
          `${file}: expected exactly ${expectedCount} occurrence(s) of ${ch}, found ${counts[ch] ?? 0}`,
        ).toBe(expectedCount)
      }
    })
  }
})
