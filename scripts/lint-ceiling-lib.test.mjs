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

test('default labels describe the eslint ratchet', () => {
  assert.match(decideCeiling(293, 292).message, /lint errors/)
  assert.match(decideCeiling(290, 292).message, /\.lint-ceiling/)
})

test('custom labels flow into all three messages', () => {
  const opts = { label: 'deno type errors', file: '.deno-check-ceiling', hint: 'fix them' }
  assert.match(decideCeiling(45, 44, opts).message, /deno type errors 45 exceed ceiling 44; fix them/)
  assert.match(decideCeiling(40, 44, opts).message, /lower \.deno-check-ceiling to 40/)
  assert.match(decideCeiling(44, 44, opts).message, /deno type errors 44 == ceiling 44/)
})
