import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'
import type { ExperimentRow } from '../../lib/experiments'

const api = vi.hoisted(() => ({
  getExperiments: vi.fn(),
  createExperiment: vi.fn(),
  saveExperimentResult: vi.fn(),
  deleteExperiment: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/api/research', () => api)
vi.mock('../../lib/edgeFunctions', () => ({ callFunction: vi.fn() }))
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))
// Cards carry their own heavy rendering; the screen test only needs the wiring.
vi.mock('./ExperimentCard', () => ({
  ExperimentCard: ({ exp, onDelete }: { exp: ExperimentRow; onDelete: (id: string) => void }) => (
    <div data-testid="exp-card">
      {exp.hypothesis}
      <button onClick={() => onDelete(exp.id)}>del</button>
    </div>
  ),
}))

import { ExperimentsScreen } from './ExperimentsScreen'

const user = { id: 'u1' } as User
const row: ExperimentRow = {
  id: 'e1', hypothesis: 'Без кофе лучше сон', change_rule: 'Без кофе после 16:00',
  target_metric: 'sleepHours', baseline_days: 14, baseline_start: '2026-06-19',
  start_date: '2026-07-03', end_date: '2026-07-10', status: 'completed',
  result: null, ai_explanation: null, created_at: '2026-07-03T10:00:00Z',
}

beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear() })

describe('ExperimentsScreen', () => {
  it('loads experiments into the sections and deletes through the api module', async () => {
    api.getExperiments.mockResolvedValue([row])
    renderWithProviders(<ExperimentsScreen user={user} daily={[]} />)
    expect(await screen.findByTestId('exp-card')).toHaveTextContent('Без кофе лучше сон')
    expect(api.getExperiments).toHaveBeenCalledWith('u1')

    fireEvent.click(screen.getByText('del'))
    await waitFor(() => expect(api.deleteExperiment).toHaveBeenCalledWith('e1'))
    expect(screen.queryByTestId('exp-card')).toBeNull()
  })

  it('shows the load-error banner when the api signals an error', async () => {
    api.getExperiments.mockResolvedValue(null)
    const { container } = renderWithProviders(<ExperimentsScreen user={user} daily={[]} />)
    await waitFor(() => expect(container.querySelector('.load-error')).not.toBeNull())
  })
})
