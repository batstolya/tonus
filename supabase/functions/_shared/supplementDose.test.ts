import { describe, it, expect } from 'vitest'
import { doseProgressText } from './supplementDose.ts'

describe('doseProgressText', () => {
  it('keeps the old wording for a once-a-day supplement', () => {
    expect(doseProgressText('Магний', { count: 1, perDay: 1 }))
      .toBe('✅ <b>Магний</b> — принято. Молодец!')
  })

  it('shows the progress while doses remain', () => {
    expect(doseProgressText('Магний', { count: 2, perDay: 3 }))
      .toBe('✅ <b>Магний</b> — принято, 2/3 за сегодня.')
  })

  it('drops the progress once the day is complete', () => {
    expect(doseProgressText('Магний', { count: 3, perDay: 3 }))
      .toBe('✅ <b>Магний</b> — принято. Молодец!')
  })

  it('falls back to the plain wording when the count is unknown', () => {
    expect(doseProgressText('Магний', null))
      .toBe('✅ <b>Магний</b> — принято. Молодец!')
  })
})
