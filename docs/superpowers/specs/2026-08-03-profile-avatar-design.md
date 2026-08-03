# Profile photo

**Status:** approved 2026-08-03.

## What it is

A photo on the profile, shown in the topbar beside the settings gear so it is
actually seen, with a picker and a remove action in the profile section of
settings.

## Storage

Reuses the existing private `health-photos` bucket. Path is
`${userId}/avatar.jpg` — a fixed name, so replacing overwrites and no orphans
accumulate. Access is already correct: the bucket's policies key on the first
folder of the path, and `delete-account` already wipes the bucket by user
prefix, so an avatar is cleaned up with the account without further work.

### The one gap

The bucket carries **insert and select policies only**
(`20260716120000_health_photos_owner_policies.sql`). Overwriting an existing
object needs `update`, and removing one needs `delete`. Without them, "replace
photo" and "remove photo" fail on permissions while the first upload succeeds —
a confusing half-working feature. One migration adds both, scoped to the
owner's prefix exactly as the existing pair are.

## No database column

The design first called for `profiles.avatar_path`. Dropped, because the path
is already known from the user id, and the two states a column would
distinguish — "never uploaded" and "storage unreachable" — produce the same
result on screen: the fallback icon.

Dropping it also avoids a real trap. `gen:types:check` regenerates types from
the **live** project and fails when the committed file differs, so a schema
change cannot be committed before the migration is applied to production. With
no public-schema change there is no types drift, and the security inventory
(surfaces from types, findings from RPC SQL) does not move either.

Existence is read by asking for a signed URL and treating an error as "no
photo".

## Downscaling

A phone photo is 3–5 MB for a 32px circle. The file is drawn to a canvas and
re-encoded as JPEG inside a 256×256 box before upload.

The box arithmetic — how a picture of any proportion maps into the square —
is a pure function, tested on its own. The canvas work around it is not
unit-tested; it is a thin wrapper over browser APIs.

## Pieces

| Module | Responsibility |
|---|---|
| `lib/api/avatar.ts` | upload, remove, signed URL, and the downscale |
| `components/ui/Avatar.tsx` | the circle: photo, or a person icon when there is none |
| `ProfileSection` | picker, preview, remove |
| `App.tsx` | the topbar slot |

Demo mode has no Supabase: uploading is a no-op there and the fallback shows,
rather than an error.

## Rollout

The migration is applied by hand — this environment has no database password.
Until it is applied, first upload works and replace/remove fail. The command
goes in the pull request.

## Testing

- The downscale box: wider-than-tall, taller-than-wide, square, and an image
  already smaller than the box (which must not be upscaled).
- `Avatar` renders the fallback with no photo and an `img` with one.
- Demo mode does not call storage.
