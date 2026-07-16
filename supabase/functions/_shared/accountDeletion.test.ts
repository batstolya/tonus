import { describe, expect, it } from 'vitest'
import { deleteAccount, isValidDeletionConfirmation, type DeletionDeps } from './accountDeletion.ts'

function makeDeps(overrides: Partial<DeletionDeps> = {}) {
  const calls: string[] = []
  const deps: DeletionDeps = {
    listUserObjects: async () => { calls.push('list'); return { paths: ['u1/concerns/a.jpg', 'u1/hair/b.jpg'], error: null } },
    removeObjects: async (paths) => { calls.push(`remove:${paths.join(',')}`); return { error: null } },
    deleteUserRows: async () => { calls.push('rows'); return { data: { profiles: 1 }, error: null } },
    deleteAuthUser: async () => { calls.push('auth'); return { error: null } },
    ...overrides,
  }
  return { deps, calls }
}

describe('isValidDeletionConfirmation', () => {
  it("accepts only the literal 'DELETE'", () => {
    expect(isValidDeletionConfirmation('DELETE')).toBe(true)
    expect(isValidDeletionConfirmation('delete')).toBe(false)
    expect(isValidDeletionConfirmation(' DELETE ')).toBe(false)
    expect(isValidDeletionConfirmation('')).toBe(false)
    expect(isValidDeletionConfirmation(undefined)).toBe(false)
    expect(isValidDeletionConfirmation(42)).toBe(false)
  })
})

describe('deleteAccount', () => {
  it('runs storage → rows → auth user in order and reports table counts', async () => {
    const { deps, calls } = makeDeps()
    const result = await deleteAccount(deps, 'u1')
    expect(result).toEqual({ ok: true, tables: { profiles: 1 } })
    expect(calls).toEqual(['list', 'remove:u1/concerns/a.jpg,u1/hair/b.jpg', 'rows', 'auth'])
  })

  it('skips removal when the user has no storage objects', async () => {
    const { deps, calls } = makeDeps({
      listUserObjects: async () => ({ paths: [], error: null }),
    })
    const result = await deleteAccount(deps, 'u1')
    expect(result.ok).toBe(true)
    expect(calls).toEqual(['rows', 'auth'])
  })

  it('aborts before rows and auth when storage listing fails', async () => {
    const { deps, calls } = makeDeps({
      listUserObjects: async () => ({ paths: [], error: { message: 'boom' } }),
    })
    const result = await deleteAccount(deps, 'u1')
    expect(result).toEqual({ ok: false, stage: 'storage' })
    expect(calls).toEqual([])
  })

  it('aborts before rows and auth when storage removal fails', async () => {
    const { deps, calls } = makeDeps({
      removeObjects: async () => ({ error: { message: 'boom' } }),
    })
    const result = await deleteAccount(deps, 'u1')
    expect(result).toEqual({ ok: false, stage: 'storage' })
    expect(calls).toEqual(['list'])
  })

  it('aborts before the auth user when row deletion fails', async () => {
    const { deps, calls } = makeDeps({
      deleteUserRows: async () => ({ data: null, error: { message: 'boom' } }),
    })
    const result = await deleteAccount(deps, 'u1')
    expect(result).toEqual({ ok: false, stage: 'rows' })
    expect(calls).toEqual(['list', 'remove:u1/concerns/a.jpg,u1/hair/b.jpg'])
  })

  it('reports the auth stage when the final account removal fails', async () => {
    const { deps } = makeDeps({
      deleteAuthUser: async () => ({ error: { message: 'boom' } }),
    })
    await expect(deleteAccount(deps, 'u1')).resolves.toEqual({ ok: false, stage: 'auth' })
  })

  it('fails closed when a dependency throws', async () => {
    const { deps, calls } = makeDeps({
      deleteUserRows: async () => { throw new Error('network') },
    })
    await expect(deleteAccount(deps, 'u1')).resolves.toEqual({ ok: false, stage: 'rows' })
    expect(calls).not.toContain('auth')
  })
})
