import type { ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { I18nProvider } from '../lib/i18n'

// Renders a component inside the app's i18n context (useT throws without it).
// Re-exports Testing Library so tests import screen/fireEvent from one place.
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, {
    wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
    ...options,
  })
}

// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react'
