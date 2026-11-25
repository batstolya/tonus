import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { DoctorReport } from './DoctorReport'
import { METRIC_DEFS } from '../../lib/doctorReport'
import { translations } from '../../lib/translations'
import type { DailyMetrics } from '../../types'
import type { User } from '@supabase/supabase-js'

const ui = (ru: string) => translations[ru]?.en ?? ru
const user = { id: 'u1' } as User
const daily: DailyMetrics[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - i)
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    restingHeartRate: 58, sleepHours: 7, steps: 9000, walkingSpeed: 4.7,
  }
})

describe('DoctorReport additional metrics', () => {
  it('prints the additional section in the print view', async () => {
    const { container } = renderWithProviders(<DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getByText('Дополнительные показатели (Apple Watch / iPhone)')).toBeTruthy())
    const section = screen.getByText('Дополнительные показатели (Apple Watch / iPhone)').closest('section')!
    expect(section.textContent).toContain('Скорость ходьбы, км/ч')
    expect(container.textContent).toContain('Пульс покоя, уд/мин')
  })

  it('gives the weekly trend its own top-level heading, not a sub-heading of the additional section', async () => {
    renderWithProviders(<DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getByText('Динамика по неделям')).toBeTruthy())
    expect(screen.getByText('Динамика по неделям').tagName).toBe('H2')
  })

  it('has uk + en for every report metric label and the section title', () => {
    const keys = [...METRIC_DEFS.map(m => m.label), 'Дополнительные показатели (Apple Watch / iPhone)']
    for (const k of keys) {
      expect(translations[k]?.uk, `uk ${k}`).toBeTruthy()
      expect(translations[k]?.en, `en ${k}`).toBeTruthy()
    }
  })
})
