import { describe, it, expect } from 'vitest'
import { fetchAllPages, PAGE_SIZE } from './supabasePaging'

const rows = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ i: i + offset }))

describe('fetchAllPages', () => {
  it('returns a short first page as the whole answer', async () => {
    const seen: [number, number][] = []
    const out = await fetchAllPages(async (from, to) => {
      seen.push([from, to])
      return { data: rows(3), error: null }
    })
    expect(out).toHaveLength(3)
    expect(seen).toEqual([[0, PAGE_SIZE - 1]])
  })

  // A full page is indistinguishable from a truncated one, so it must be
  // followed by another request — this is the case the report was losing rows to.
  it('keeps asking while pages come back full', async () => {
    const pages = [rows(PAGE_SIZE), rows(PAGE_SIZE, PAGE_SIZE), rows(7, PAGE_SIZE * 2)]
    const seen: [number, number][] = []
    const out = await fetchAllPages(async (from, to) => {
      seen.push([from, to])
      return { data: pages[seen.length - 1], error: null }
    })
    expect(out).toHaveLength(PAGE_SIZE * 2 + 7)
    expect(seen).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, PAGE_SIZE * 2 - 1],
      [PAGE_SIZE * 2, PAGE_SIZE * 3 - 1],
    ])
  })

  it('stops on an exact multiple of the page size', async () => {
    const pages = [rows(PAGE_SIZE), []]
    let call = 0
    const out = await fetchAllPages(async () => ({ data: pages[call++], error: null }))
    expect(out).toHaveLength(PAGE_SIZE)
    expect(call).toBe(2)
  })

  it('throws the error instead of returning a partial answer', async () => {
    await expect(fetchAllPages(async () => ({ data: null, error: { message: 'boom' } })))
      .rejects.toMatchObject({ message: 'boom' })
  })

  it('treats a null page as the end', async () => {
    expect(await fetchAllPages(async () => ({ data: null, error: null }))).toEqual([])
  })
})
