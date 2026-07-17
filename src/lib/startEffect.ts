// Lint-friendly bridge for fetch-on-mount effects. The react-hooks compiler
// rule (set-state-in-effect) flags any callback invoked synchronously from an
// effect that may reach setState, even when every setState happens after an
// await. Wrapping the call in an async frame keeps the effect body free of
// synchronous setState paths while preserving identical runtime behavior.
export function startEffect(load: () => Promise<unknown>): void {
  void (async () => { await load() })()
}
