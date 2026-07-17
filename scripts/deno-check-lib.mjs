// Target selection for the zero-tolerance deno check of edge functions.
// Deno checks only what Deno runs in prod: *.test.ts files execute under
// vitest (node project) and must not be checked against the Deno resolver
// (their `import 'vitest'` is unresolvable there by design).
export function denoCheckTargets(files) {
  return files.filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort()
}
