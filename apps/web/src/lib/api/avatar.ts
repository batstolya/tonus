import { supabase } from '../supabase'
import { isDemoActive } from '../demo'
import { AVATAR_BOX, fitBox } from '../avatarBox'

const BUCKET = 'health-photos'

// Fixed name rather than a timestamp: replacing overwrites the one object, so
// nothing accumulates and the path is known from the user id alone. That is
// also why there is no column recording it — see the design note.
const pathFor = (userId: string) => `${userId}/avatar.jpg`

/** Re-encodes a picked file as a JPEG inside AVATAR_BOX. */
export async function downscale(file: File, box = AVATAR_BOX): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = fitBox(bitmap.width, bitmap.height, box)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error('canvas produced no blob'))),
        'image/jpeg',
        0.85,
      )
    })
  } finally {
    bitmap.close()
  }
}

/**
 * A signed URL for the user's photo, or null when there is none.
 *
 * An error and a missing object are the same answer here — both mean "draw the
 * fallback" — so this does not try to tell them apart.
 */
export async function getAvatarUrl(userId: string): Promise<string | null> {
  if (isDemoActive()) return null
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(pathFor(userId), 3600)
  return data?.signedUrl ?? null
}

/** Returns the new signed URL, or null if the upload failed. */
export async function uploadAvatar(userId: string, file: File): Promise<string | null> {
  if (isDemoActive()) return null
  const blob = await downscale(file)
  // upsert: the path never changes, so every upload after the first is a
  // replacement — which is why the bucket needed an update policy.
  const { error } = await supabase.storage.from(BUCKET)
    .upload(pathFor(userId), blob, { upsert: true, contentType: 'image/jpeg' })
  if (error) return null
  return getAvatarUrl(userId)
}

export async function removeAvatar(userId: string): Promise<boolean> {
  if (isDemoActive()) return true
  const { error } = await supabase.storage.from(BUCKET).remove([pathFor(userId)])
  return !error
}
