// Pure decision for a debt ratchet: the ceiling file is the single source of truth
// for how many legacy errors are tolerated; it may only move down over time.
export function decideCeiling(count, ceiling, {
  label = 'lint errors',
  file = '.lint-ceiling',
  hint = "run 'npm run lint' and fix the new ones",
} = {}) {
  if (count > ceiling) {
    return { ok: false, message: `${label} ${count} exceed ceiling ${ceiling}; ${hint}` }
  }
  if (count < ceiling) {
    return { ok: false, message: `${label} dropped to ${count} (ceiling ${ceiling}); lower ${file} to ${count} to lock in the win` }
  }
  return { ok: true, message: `${label} ${count} == ceiling ${ceiling}` }
}
