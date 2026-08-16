/**
 * PostgREST answers with at most `db-max-rows` rows and says nothing about
 * having stopped early, so a single request cannot tell a complete answer from
 * a truncated one. Anything that must be complete — the doctor report reads a
 * year of logs — asks page by page until a page comes back short.
 */

export const PAGE_SIZE = 1000

interface PageResult {
  // Rows stay unknown here: every caller passes a Supabase query builder, whose
  // row type is the database's, and the caller names what it wants back.
  data: unknown[] | null
  error: { message: string } | null
}

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult>,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = data ?? []
    all.push(...(rows as T[]))
    // A full page may or may not be the last one; only a short page proves it.
    if (rows.length < PAGE_SIZE) return all
  }
}
