// A phone photo is three to five megabytes for a circle drawn at 32 CSS pixels,
// so the file is re-encoded inside this box before it is uploaded. 256 leaves
// room for a retina avatar and for the larger preview in settings.
export const AVATAR_BOX = 256

/**
 * The size a picture of `width`x`height` becomes when made to fit a square of
 * `box`, keeping its proportions.
 *
 * Never enlarges: a picture already inside the box costs bytes to upscale and
 * gains nothing, since the circle it lands in is smaller still.
 */
export function fitBox(width: number, height: number, box: number): { width: number; height: number } {
  const scale = Math.min(box / width, box / height, 1)
  return {
    // Round rather than floor: flooring every awkward ratio slowly squashes it,
    // and max(1) keeps a degenerate file from producing a zero-sized canvas,
    // which throws.
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
