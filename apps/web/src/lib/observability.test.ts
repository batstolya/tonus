import { describe, expect, it, vi } from 'vitest'
import {
  captureClientFailure,
  installClientObservability,
  type ClientObservabilityDeps,
} from './observability'

const RELEASE = 'b'.repeat(40)
const REQUEST_ID = '018f6f5e-6d4a-7fd1-9d0f-9c3d0f834eee'

function deps(overrides: Partial<ClientObservabilityDeps> = {}): ClientObservabilityDeps {
  return {
    environment: 'production',
    release: RELEASE,
    isDemo: () => false,
    randomUUID: () => REQUEST_ID,
    invoke: vi.fn(async () => ({ error: null })),
    ...overrides,
  }
}

describe('captureClientFailure', () => {
  it('sends only the fixed technical contract', async () => {
    const d = deps()

    expect(await captureClientFailure('web.global_error', 'client_error', undefined, d)).toBe(true)

    expect(d.invoke).toHaveBeenCalledWith('report-client-error', {
      body: {
        environment: 'production',
        operation: 'web.global_error',
        requestId: REQUEST_ID,
        errorCode: 'client_error',
        release: RELEASE,
      },
    })
    const serialized = JSON.stringify((d.invoke as ReturnType<typeof vi.fn>).mock.calls[0])
    for (const field of ['message', 'stack', 'email', 'token', 'prompt', 'health', 'telegram']) {
      expect(serialized).not.toContain(`"${field}"`)
    }
  })

  it('never reports from demo mode', async () => {
    const d = deps({ isDemo: () => true })

    expect(await captureClientFailure('web.global_error', 'client_error', undefined, d)).toBe(false)
    expect(d.invoke).not.toHaveBeenCalled()
  })

  it('fails closed when exact build metadata is missing', async () => {
    const d = deps({ release: '' })

    expect(await captureClientFailure('web.global_error', 'client_error', undefined, d)).toBe(false)
    expect(d.invoke).not.toHaveBeenCalled()
  })

  it('reports transport failure without throwing into the product flow', async () => {
    const d = deps({ invoke: vi.fn(async () => ({ error: new Error('offline') })) })

    await expect(captureClientFailure(
      'web.edge_function_failure',
      'edge_request_failed',
      REQUEST_ID,
      d,
    )).resolves.toBe(false)
  })
})

describe('installClientObservability', () => {
  it('installs once and maps global failures to static codes without reading their contents', async () => {
    const listeners = new Map<string, EventListener>()
    const target = {
      addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
      removeEventListener: vi.fn(),
    } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>
    const d = deps()

    const cleanup = installClientObservability({ ...d, target })
    installClientObservability({ ...d, target })
    listeners.get('error')?.(Object.assign(new Event('error'), { message: 'private medication name' }))
    listeners.get('unhandledrejection')?.(Object.assign(new Event('unhandledrejection'), {
      reason: new Error('private health prompt'),
    }))
    await vi.waitFor(() => expect(d.invoke).toHaveBeenCalledTimes(2))

    expect(d.invoke).toHaveBeenNthCalledWith(1, 'report-client-error', {
      body: expect.objectContaining({ operation: 'web.global_error', errorCode: 'client_error' }),
    })
    expect(d.invoke).toHaveBeenNthCalledWith(2, 'report-client-error', {
      body: expect.objectContaining({ operation: 'web.unhandled_rejection', errorCode: 'unhandled_rejection' }),
    })
    expect(JSON.stringify((d.invoke as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('private')

    cleanup()
    expect(target.removeEventListener).toHaveBeenCalledTimes(2)
  })
})
