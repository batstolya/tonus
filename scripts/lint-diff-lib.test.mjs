import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAddedLines, offendingMessages } from './lint-diff-lib.mjs'

const DIFF = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -10,0 +11,2 @@
+const a: any = 1
+const b = 2
`

test('parseAddedLines maps added lines in new-file numbering', () => {
  const m = parseAddedLines(DIFF)
  assert.deepEqual([...m.get('src/x.ts')], [11, 12])
})

test('offendingMessages keeps only error-severity messages on added lines', () => {
  const added = parseAddedLines(DIFF)
  const results = [{
    filePath: '/repo/src/x.ts',
    messages: [
      { severity: 2, line: 11, ruleId: '@typescript-eslint/no-explicit-any', message: 'no any' }, // added line
      { severity: 2, line: 5, ruleId: 'x', message: 'legacy' },                                     // untouched line
      { severity: 1, line: 12, ruleId: 'y', message: 'warn' },                                       // warning, not error
    ],
  }]
  const off = offendingMessages(results, added)
  assert.equal(off.length, 1)
  assert.equal(off[0].line, 11)
})
