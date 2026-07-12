import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import {
  samplePalettePixels,
  encodeGif,
  validateScenarioMeta,
} from './readme-media-lib.mjs'

const testOutput = new URL('../work/readme-media-lib-test.gif', import.meta.url)

after(() => {
  fs.rmSync(fileURLToPath(testOutput), { force: true })
})

function png(width, height, color) {
  const image = new PNG({ width, height })
  for (let i = 0; i < image.data.length; i += 4) {
    image.data.set([...color, 255], i)
  }
  return PNG.sync.write(image)
}

test('samplePalettePixels returns bounded RGBA samples from every frame', () => {
  const frames = [
    new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]),
    new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 255, 255]),
  ]
  const result = samplePalettePixels(frames, 2)
  assert.equal(result.length, 8)
  assert.deepEqual(new Set([result[0], result[4]]), new Set([255, 0]))
})

test('encodeGif writes one animated GIF with shared dimensions', async () => {
  const result = await encodeGif(
    [png(4, 3, [20, 30, 40]), png(4, 3, [80, 90, 100])],
    testOutput,
    { delay: 100, colors: 16, maxPalettePixels: 24 },
  )
  assert.equal(result.width, 4)
  assert.equal(result.height, 3)
  assert.equal(result.frames, 2)
  assert.equal(result.durationMs, 200)
  assert.equal(Buffer.from(result.bytes).subarray(0, 6).toString(), 'GIF89a')
})

test('validateScenarioMeta reports duration, dimensions, fps and size failures', () => {
  assert.deepEqual(validateScenarioMeta({
    name: 'ok', width: 960, height: 600, frames: 60,
    durationMs: 6000, bytes: 1_000_000,
  }), [])
  const errors = validateScenarioMeta({
    name: 'bad', width: 1760, height: 1100, frames: 100,
    durationMs: 5000, bytes: 2_000_000,
  })
  assert.ok(errors.some(e => e.includes('960x600')))
  assert.ok(errors.some(e => e.includes('6–8 seconds')))
  assert.ok(errors.some(e => e.includes('1.5 MB')))
})
