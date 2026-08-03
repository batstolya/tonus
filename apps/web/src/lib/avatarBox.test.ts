import { describe, it, expect } from 'vitest'
import { fitBox, AVATAR_BOX } from './avatarBox'

describe('fitBox', () => {
  it('shrinks a wide photo until its long side fits', () => {
    expect(fitBox(4000, 3000, 256)).toEqual({ width: 256, height: 192 })
  })

  it('shrinks a tall photo until its long side fits', () => {
    expect(fitBox(3000, 4000, 256)).toEqual({ width: 192, height: 256 })
  })

  it('fills the box exactly for a square photo', () => {
    expect(fitBox(1000, 1000, 256)).toEqual({ width: 256, height: 256 })
  })

  // Enlarging a small picture would cost bytes and gain nothing: the circle it
  // is drawn into is smaller still.
  it('leaves a photo already inside the box alone', () => {
    expect(fitBox(120, 90, 256)).toEqual({ width: 120, height: 90 })
  })

  it('leaves a photo exactly the size of the box alone', () => {
    expect(fitBox(256, 256, 256)).toEqual({ width: 256, height: 256 })
  })

  // Rounding, not truncation: a 999x333 photo scaled by 256/999 gives 85.28 on
  // the short side, and flooring every awkward ratio would slowly squash them.
  it('rounds the short side rather than truncating it', () => {
    expect(fitBox(999, 333, 256)).toEqual({ width: 256, height: 85 })
  })

  // A degenerate file should not produce a zero-sized canvas, which throws.
  it('never returns a zero dimension', () => {
    const { width, height } = fitBox(4000, 3, 256)
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
  })

  it('exports a box size the avatar circle can afford', () => {
    expect(AVATAR_BOX).toBeGreaterThanOrEqual(128)
    expect(AVATAR_BOX).toBeLessThanOrEqual(512)
  })
})
