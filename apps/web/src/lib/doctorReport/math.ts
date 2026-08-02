// Pure numeric helpers shared across the doctor report. Kept free of any
// dependency on the rest of the package, same as dates.ts — metrics.ts and
// reliability.ts both depend on this file, never on each other, for math.

export const avg = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length

/** Linear-interpolated quantile; p is 0..1 over the sorted values. */
export function quantile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b)
  const i = (s.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo)
}
