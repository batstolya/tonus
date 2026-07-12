import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import gifenc from 'gifenc'
import { PNG } from 'pngjs'

const { GIFEncoder, quantize, applyPalette } = gifenc

export function samplePalettePixels(rgbaFrames, maxPixels = 750_000) {
  if (!rgbaFrames.length) throw new Error('At least one RGBA frame is required')
  if (maxPixels < 1) throw new Error('maxPixels must be at least 1')

  const totalPixels = rgbaFrames.reduce((total, frame) => total + frame.length / 4, 0)
  const stride = Math.max(1, Math.ceil(totalPixels / maxPixels))
  const sampleCount = Math.ceil(totalPixels / stride)
  const output = new Uint8ClampedArray(sampleCount * 4)
  let seen = 0
  let written = 0

  for (const frame of rgbaFrames) {
    if (frame.length % 4 !== 0) throw new Error('RGBA frames must contain four bytes per pixel')
    for (let i = 0; i < frame.length; i += 4) {
      if (seen % stride === 0) {
        output.set(frame.subarray(i, i + 4), written * 4)
        written += 1
      }
      seen += 1
    }
  }

  return output.subarray(0, written * 4)
}

export async function encodeGif(pngFrames, outputPath, {
  delay = 100,
  colors = 160,
  maxPalettePixels = 750_000,
} = {}) {
  if (!pngFrames.length) throw new Error('At least one PNG frame is required')

  const decoded = pngFrames.map(buffer => PNG.sync.read(buffer))
  const { width, height } = decoded[0]
  if (decoded.some(frame => frame.width !== width || frame.height !== height)) {
    throw new Error('All frames must have identical dimensions')
  }

  const rgbaFrames = decoded.map(frame => new Uint8ClampedArray(frame.data))
  const samples = samplePalettePixels(rgbaFrames, maxPalettePixels)
  const palette = quantize(samples, colors)
  const gif = GIFEncoder()

  rgbaFrames.forEach((frame, index) => {
    gif.writeFrame(applyPalette(frame, palette), width, height, {
      palette: index === 0 ? palette : undefined,
      delay,
      repeat: 0,
    })
  })
  gif.finish()

  const bytes = gif.bytes()
  const target = outputPath instanceof URL ? fileURLToPath(outputPath) : path.resolve(outputPath)
  const temporary = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(temporary, Buffer.from(bytes))
  fs.renameSync(temporary, target)

  return {
    bytes,
    width,
    height,
    frames: rgbaFrames.length,
    durationMs: rgbaFrames.length * delay,
  }
}

export function validateScenarioMeta(meta) {
  const errors = []
  if (meta.width !== 960 || meta.height !== 600) {
    errors.push(`${meta.name}: expected 960x600, got ${meta.width}x${meta.height}`)
  }
  if (meta.durationMs < 6000 || meta.durationMs > 8000) {
    errors.push(`${meta.name}: expected 6–8 seconds, got ${(meta.durationMs / 1000).toFixed(1)}`)
  }
  const fps = meta.frames / (meta.durationMs / 1000)
  if (fps < 8 || fps > 10) {
    errors.push(`${meta.name}: expected 8–10 fps, got ${fps.toFixed(1)}`)
  }
  if (meta.bytes > 1_500_000) {
    errors.push(`${meta.name}: exceeds the 1.5 MB target (${(meta.bytes / 1_000_000).toFixed(2)} MB)`)
  }
  return errors
}
