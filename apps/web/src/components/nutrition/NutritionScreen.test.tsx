import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({ getMeals: vi.fn() }))
vi.mock('../../lib/api/intake', () => api)
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))
// MealLogger drags in the whole AI meal flow — stub it.
vi.mock('./MealLogger', () => ({ MealLogger: () => <div data-testid="meal-logger" /> }))

import { NutritionScreen } from './NutritionScreen'

const user = { id: 'u1' } as User

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('NutritionScreen', () => {
  it('loads meals through the API module and renders them', async () => {
    api.getMeals.mockResolvedValue([
      { ts: new Date().toISOString(), note: 'Овсянка', calories: 350, protein_g: 12, carbs_g: 60, fat_g: 8 },
    ])
    renderWithProviders(<NutritionScreen user={user} />)
    expect(await screen.findByText(/Овсянка/)).toBeInTheDocument()
    expect(api.getMeals).toHaveBeenCalledWith('u1', expect.any(String))
  })

  it('shows the load error with retry when the API signals failure', async () => {
    api.getMeals.mockResolvedValue(null)
    renderWithProviders(<NutritionScreen user={user} />)
    expect(await screen.findByRole('button', { name: /Retry/ })).toBeInTheDocument()
  })
})
