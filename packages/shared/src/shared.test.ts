import { describe, expect, it } from 'vitest'
import { Constants, APP_NAME } from './index'
import type { Database } from './index'

// Smoke test proving the workspace chain resolves end to end: the generated
// Supabase types load from @tonus/shared and expose both a runtime value
// (Constants) and the Database type surface the clients depend on.
describe('@tonus/shared database types', () => {
  it('re-exports the generated runtime Constants', () => {
    expect(Constants.public.Enums.football_watch_response).toEqual([
      'watching',
      'not_watching',
    ])
  })

  it('exposes the public schema on the Database type', () => {
    // Type-level assertion: a table from the public schema is addressable.
    type Row = Database['public']['Tables']['ai_analyses']['Row']
    const focusIsPresent: keyof Row extends never ? false : true = true
    expect(focusIsPresent).toBe(true)
  })
})

describe('@tonus/shared app metadata', () => {
  it('exports the product name for every client to render', () => {
    expect(APP_NAME).toBe('Tonus')
  })
})
