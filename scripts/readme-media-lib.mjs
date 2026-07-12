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

function readUint16(bytes, offset) {
  if (offset + 1 >= bytes.length) throw new Error('Unexpected end of GIF data')
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function skipSubBlocks(bytes, offset) {
  let cursor = offset
  while (cursor < bytes.length) {
    const size = bytes[cursor]
    cursor += 1
    if (size === 0) return cursor
    cursor += size
    if (cursor > bytes.length) throw new Error('Invalid GIF sub-block length')
  }
  throw new Error('GIF sub-block terminator is missing')
}

export function inspectGif(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const header = Buffer.from(bytes.subarray(0, 6)).toString('ascii')
  if (header !== 'GIF87a' && header !== 'GIF89a') throw new Error('Not a GIF file')
  if (bytes.length < 13) throw new Error('GIF logical screen descriptor is missing')

  const width = readUint16(bytes, 6)
  const height = readUint16(bytes, 8)
  const packed = bytes[10]
  const hasGlobalPalette = (packed & 0x80) !== 0
  let cursor = 13
  if (hasGlobalPalette) cursor += 3 * (2 ** ((packed & 0x07) + 1))
  if (cursor > bytes.length) throw new Error('GIF global palette is truncated')

  let frames = 0
  let durationCs = 0
  let pendingDelayCs = 0
  let hasLocalPalettes = false

  while (cursor < bytes.length) {
    const introducer = bytes[cursor]
    cursor += 1

    if (introducer === 0x3b) break
    if (introducer === 0x21) {
      const label = bytes[cursor]
      cursor += 1
      const size = bytes[cursor]
      cursor += 1
      if (label === 0xf9) {
        if (size !== 4 || cursor + 4 >= bytes.length) throw new Error('Invalid GIF graphic control extension')
        cursor += 1 // packed flags
        pendingDelayCs = readUint16(bytes, cursor)
        cursor += 2
        cursor += 1 // transparent colour index
        if (bytes[cursor] !== 0) throw new Error('GIF graphic control terminator is missing')
        cursor += 1
      } else {
        cursor += size
        if (cursor > bytes.length) throw new Error('GIF extension is truncated')
        cursor = skipSubBlocks(bytes, cursor)
      }
      continue
    }

    if (introducer !== 0x2c) throw new Error(`Unsupported GIF block 0x${introducer.toString(16)}`)
    if (cursor + 9 > bytes.length) throw new Error('GIF image descriptor is truncated')
    const imagePacked = bytes[cursor + 8]
    cursor += 9
    if ((imagePacked & 0x80) !== 0) {
      hasLocalPalettes = true
      cursor += 3 * (2 ** ((imagePacked & 0x07) + 1))
    }
    if (cursor >= bytes.length) throw new Error('GIF image data is truncated')
    cursor += 1 // LZW minimum code size
    cursor = skipSubBlocks(bytes, cursor)
    frames += 1
    durationCs += pendingDelayCs
    pendingDelayCs = 0
  }

  if (!frames) throw new Error('GIF contains no frames')
  const durationMs = durationCs * 10
  return {
    width,
    height,
    frames,
    durationMs,
    fps: durationMs ? frames / (durationMs / 1000) : 0,
    hasGlobalPalette,
    hasLocalPalettes,
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
