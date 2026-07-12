// Pure decision for the lint ratchet. `.lint-ceiling` is the single source of truth
// for how many legacy lint errors are tolerated; it may only move down over time.
export function decideCeiling(count, ceiling) {
  if (count > ceiling) {
    return { ok: false, message: `lint errors ${count} exceed ceiling ${ceiling}; run 'npm run lint' and fix the new ones` }
  }
  if (count < ceiling) {
    return { ok: false, message: `lint errors dropped to ${count} (ceiling ${ceiling}); lower .lint-ceiling to ${count} to lock in the win` }
  }
  return { ok: true, message: `lint errors ${count} == ceiling ${ceiling}` }
}
