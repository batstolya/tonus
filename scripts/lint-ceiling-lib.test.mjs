import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideCeiling } from './lint-ceiling-lib.mjs'

test('fails when count exceeds ceiling', () => {
  const r = decideCeiling(293, 292)
  assert.equal(r.ok, false)
  assert.match(r.message, /293/)
})

test('fails when count is below ceiling and names the new floor', () => {
  const r = decideCeiling(290, 292)
  assert.equal(r.ok, false)
  assert.match(r.message, /290/)
})

test('passes when count equals ceiling', () => {
  const r = decideCeiling(292, 292)
  assert.equal(r.ok, true)
})
