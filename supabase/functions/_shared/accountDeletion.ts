// Complete account deletion orchestrator (beta-safety PR 6).
// Order is load-bearing: Storage objects → user-owned rows (delete_user_data
// RPC) → the auth account itself. Any failure aborts before the auth user is
// removed, so a failed run can be retried with the same credentials; after
// success the JWT is invalid and repeats fail with 401.
// Pure module (no Deno-URL imports) → tested by vitest.

export interface DeletionDeps {
  listUserObjects(): Promise<{ paths: string[]; error: { message: string } | null }>
  removeObjects(paths: string[]): Promise<{ error: { message: string } | null }>
  deleteUserRows(): Promise<{ data: Record<string, number> | null; error: { message: string } | null }>
  deleteAuthUser(): Promise<{ error: { message: string } | null }>
}

export type DeletionResult =
  | { ok: true; tables: Record<string, number> }
  | { ok: false; stage: 'storage' | 'rows' | 'auth' }

export function isValidDeletionConfirmation(value: unknown): boolean {
  return value === 'DELETE'
}

export async function deleteAccount(deps: DeletionDeps, _userId: string): Promise<DeletionResult> {
  try {
    const listed = await deps.listUserObjects()
    if (listed.error) return { ok: false, stage: 'storage' }
    if (listed.paths.length > 0) {
      const removed = await deps.removeObjects(listed.paths)
      if (removed.error) return { ok: false, stage: 'storage' }
    }
  } catch {
    return { ok: false, stage: 'storage' }
  }

  let tables: Record<string, number>
  try {
    const rows = await deps.deleteUserRows()
    if (rows.error || !rows.data) return { ok: false, stage: 'rows' }
    tables = rows.data
  } catch {
    return { ok: false, stage: 'rows' }
  }

  try {
    const auth = await deps.deleteAuthUser()
    if (auth.error) return { ok: false, stage: 'auth' }
  } catch {
    return { ok: false, stage: 'auth' }
  }

  return { ok: true, tables }
}
