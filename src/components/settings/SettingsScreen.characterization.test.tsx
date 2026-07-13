import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

// Характеризационный тест: фиксирует поведение SettingsScreen ДО декомпозиции
// (воркстрим C). Экран тяжёлый — дёргает Supabase и data-layer напрямую, поэтому
// весь слой данных замокан. Проверяем то, что декомпозиция ставит под угрозу:
// присутствие секций и сквозную логику архива (родитель раздаёт isArchived/onArchive).

// ── Мок Supabase: любой билдер-чейн thenable → { data: null } ────────────────
function chain(): unknown {
  const p: Record<string, unknown> = {}
  const ret = () => p
  for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'in', 'insert', 'update', 'upsert', 'delete', 'maybeSingle', 'single']) {
    p[m] = ret
  }
  ;(p as { then: unknown }).then = (res: (v: { data: null; error: null }) => unknown) => res({ data: null, error: null })
  return p
}
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => chain() } }))

vi.mock('../../lib/aiUsage', () => ({
  loadMonthUsage: vi.fn().mockResolvedValue({ costUsd: 0, totalTokens: 0, bySource: {} }),
  loadBudget: vi.fn().mockResolvedValue(5),
  saveBudget: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/dailyNote', () => ({
  loadDailyNoteSettings: vi.fn().mockResolvedValue({ enabled: false, time: '21:00' }),
  saveDailyNoteSettings: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/reportSettings', () => ({
  loadReportSettings: vi.fn().mockResolvedValue(null),
  saveReportSettings: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/exportData', () => ({
  exportAllJSON: vi.fn().mockResolvedValue(undefined),
  exportMetricsCSV: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/edgeFunctions', () => ({ callFunction: vi.fn().mockResolvedValue({}) }))
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))
vi.mock('../onboarding/guideState', () => ({ clearGuideProgress: vi.fn() }))

// Дочерние компоненты со своим data-layer — заглушки, чтобы не тянуть их зависимости.
vi.mock('./AutoSyncSettings', () => ({ AutoSyncSettings: () => <div data-testid="autosync" /> }))
vi.mock('./WorkoutScheduleSettings', () => ({ WorkoutScheduleSettings: () => <div data-testid="workout" /> }))
vi.mock('./PrivacySettings', () => ({ PrivacySettings: () => <div data-testid="privacy" /> }))
vi.mock('./DoctorReport', () => ({ DoctorReport: () => <div data-testid="doctor-report" /> }))
vi.mock('../onboarding/ConnectGuide', () => ({ ConnectGuide: () => <div data-testid="connect-guide" /> }))

import { SettingsScreen } from './SettingsScreen'

const user = { id: 'u1', email: 't@t.io' } as User

function renderScreen(extra: Record<string, unknown> = {}) {
  return renderWithProviders(
    <SettingsScreen
      user={user}
      onGoogleSync={() => {}}
      onNavigate={() => {}}
      onDeviceTypeChange={() => {}}
      deviceType="apple_watch"
      daily={[]}
      {...extra}
    />,
  )
}

describe('SettingsScreen (characterization, pre-decomposition)', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => cleanup())

  it('renders the always-present sections (language, cal, ai, environment, export)', async () => {
    const { container } = renderScreen()
    await waitFor(() => expect(container.querySelectorAll('.settings-section').length).toBeGreaterThanOrEqual(5))
    // маркеры, не зависящие от языка
    expect(screen.getByText('Telegram')).toBeInTheDocument()
    expect(screen.getByText('Cal.beskarstaff.com')).toBeInTheDocument()
    // языковой переключатель (константы LANGS)
    expect(screen.getByRole('button', { name: /Українська/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /English/ })).toBeInTheDocument()
    // устройство (кнопка выбора источника)
    expect(screen.getByRole('button', { name: 'Apple Watch' })).toBeInTheDocument()
  })

  it('archives a section and shows it in the archive list, then restores it', async () => {
    const { container } = renderScreen()
    await waitFor(() => expect(container.querySelector('.section-archive-btn')).toBeTruthy())

    const before = container.querySelectorAll('.settings-section.is-archived').length
    expect(before).toBe(0)
    expect(container.querySelector('.settings-archive-toggle')).toBeNull()

    // архивируем первую секцию
    fireEvent.click(container.querySelector('.section-archive-btn')!)

    await waitFor(() => expect(container.querySelector('.settings-section.is-archived')).toBeTruthy())
    // появился свод «Архив»
    const toggle = container.querySelector('.settings-archive-toggle')!
    expect(toggle).toBeTruthy()
    // localStorage хранит архивированный id
    expect(JSON.parse(localStorage.getItem('settings_archived') ?? '[]').length).toBe(1)

    // разворачиваем архив и возвращаем
    fireEvent.click(toggle)
    const restore = container.querySelector('.settings-archive-list .link-btn')!
    expect(restore).toBeTruthy()
    fireEvent.click(restore)
    await waitFor(() => expect(container.querySelector('.settings-section.is-archived')).toBeNull())
    expect(JSON.parse(localStorage.getItem('settings_archived') ?? '[]').length).toBe(0)
  })

  it('switches interface language when a language button is clicked', async () => {
    const { container } = renderScreen()
    const uk = screen.getByRole('button', { name: /Українська/ })
    fireEvent.click(uk)
    // активная кнопка получает класс on
    await waitFor(() => expect(uk.className).toMatch(/\bon\b/))
    // после переключения на UK часть UI переводится
    expect(container.querySelector('.settings-screen')).toBeTruthy()
  })
})
