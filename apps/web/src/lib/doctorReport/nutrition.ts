import { quantile, timeOfDayStats, type TimeStat } from './math'
import { INTAKE_ORIGIN_MIN, summarizeIntakeType, type IntakeLine } from './intake'
import type { PeriodFrame } from './metrics'

/**
 * What the patient ate and drank. Coffee sits here rather than with alcohol
 * and medication: a doctor reading diet wants the day's drinks together, and
 * splitting water from coffee across two sections made the same question
 * answerable only by flipping pages.
 */
export const NUTRITION_TYPES = ['meal', 'water', 'coffee'] as const

/** Print order: water is the baseline, coffee the exposure on top of it. */
export const DRINK_TYPES = ['water', 'coffee'] as const

/** An intake row widened with the columns only meals fill in. */
export interface NutritionEvent {
  ts: string
  type: string
  amount: number | null
  unit: string | null
  note: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
}

/** One printed meal. Every macro is optional: the patient may log only a name. */
export interface NutritionMeal {
  date: string
  time: string
  note: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
}

export interface NutritionSection {
  /** Calendar days of the period carrying at least one meal. */
  days: number
  calendarDays: number
  meals: number
  /** Days carrying a calorie figure — the medians below rest on these, not on `days`. */
  macroDays: number
  /**
   * Medians of the per-day totals over days with a mark, never over meals: a
   * day of three meals would otherwise read like a day of one. `null` when the
   * macro was never entered, which is normal for a patient who logs only names.
   */
  medianCalories: number | null
  medianProtein: number | null
  medianCarbs: number | null
  medianFat: number | null
  mealTime: TimeStat | null
  /**
   * One line per drink present in the period, counted by the very same rules
   * as the intake section. A drink the patient never logged is omitted, not
   * printed as zero.
   */
  drinks: IntakeLine[]
  /** Every meal of the period, chronological. */
  list: NutritionMeal[]
}

const dayOf = (ts: string): string => {
  const d = new Date(ts)
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const timeOf = (ts: string): string => {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type MacroKey = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'

/**
 * Sums one macro per day, then takes the median across days that carry it.
 * A day where the patient logged meals but left this macro empty is skipped
 * rather than counted as zero — an unfilled field is not a measured nothing.
 */
function medianPerDay(meals: NutritionEvent[], key: MacroKey): number | null {
  const perDay = new Map<string, number>()
  for (const m of meals) {
    const v = m[key]
    if (v == null) continue
    const day = dayOf(m.ts)
    perDay.set(day, (perDay.get(day) ?? 0) + v)
  }
  const totals = [...perDay.values()]
  return totals.length ? +quantile(totals, 0.5).toFixed(1) : null
}

/**
 * The nutrition section, or `null` when the period holds neither food nor
 * water: an empty table would read as a measurement that the patient ate
 * nothing, which is exactly what this data cannot say.
 */
export function buildNutrition(events: NutritionEvent[], frame: PeriodFrame): NutritionSection | null {
  const inPeriod = events.filter(e => {
    const day = dayOf(e.ts)
    return day >= frame.effectiveStart && day <= frame.end
  })
  const meals = inPeriod.filter(e => e.type === 'meal')
  const drinks = DRINK_TYPES
    .map(type => summarizeIntakeType(inPeriod, type, frame))
    .filter((l): l is IntakeLine => l != null)
  if (!meals.length && !drinks.length) return null

  return {
    days: new Set(meals.map(e => dayOf(e.ts))).size,
    calendarDays: frame.calendarDays,
    meals: meals.length,
    macroDays: new Set(meals.filter(m => m.calories != null).map(e => dayOf(e.ts))).size,
    medianCalories: medianPerDay(meals, 'calories'),
    medianProtein: medianPerDay(meals, 'protein_g'),
    medianCarbs: medianPerDay(meals, 'carbs_g'),
    medianFat: medianPerDay(meals, 'fat_g'),
    mealTime: timeOfDayStats(meals.map(e => e.ts), INTAKE_ORIGIN_MIN),
    drinks,
    list: meals
      .slice()
      .sort((a, b) => a.ts.localeCompare(b.ts))
      .map(m => ({
        date: dayOf(m.ts),
        time: timeOf(m.ts),
        note: m.note?.trim() || null,
        calories: m.calories,
        protein_g: m.protein_g,
        carbs_g: m.carbs_g,
        fat_g: m.fat_g,
      })),
  }
}
