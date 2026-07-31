import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ICONS } from './icons'

// Files the icon pilot has converted. Later tasks append to this list.
const PILOT_FILES = [
  'components/dashboard/Dashboard.tsx',
  'components/dashboard/StreakStats.tsx',
  'components/dashboard/WorkoutPlanCard.tsx',
  'components/dashboard/NotificationBell.tsx',
  'components/dashboard/StreakMenu.tsx',
]

const REPLACED = Object.values(ICONS).map(e => e.emoji)

describe('converted files carry no emoji', () => {
  for (const file of PILOT_FILES) {
    it(file, () => {
      const source = readFileSync(join(__dirname, '..', file), 'utf8')
      const found = REPLACED.filter(emoji => source.includes(emoji))
      expect(found, `${file} still contains ${found.join(' ')}`).toEqual([])
    })
  }
})
