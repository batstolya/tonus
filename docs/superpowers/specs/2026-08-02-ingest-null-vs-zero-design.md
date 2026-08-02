# Ingest: an absent number is not zero (spec C)

Sibling of `2026-08-02-report-completeness-client-design.md` (A) and
`2026-08-02-lab-import-provenance-design.md` (B). Smallest of the three, and
the only one that changes the auto-sync ingest.

## 0. Why

`supabase/functions/_shared/hae.ts`:

```ts
export function num(v: unknown): number | null { const n = Number(v); return isFinite(n) ? n : null }
```

`Number(null)` is `0` in JavaScript, and `isFinite(0)` is true. So a Health
Auto Export payload that reports a field as explicitly `null` — the normal way
a source says "not measured" — is stored as a measured zero. `Number('')` is
also `0`, and so are `Number(false)` and `Number([])`.

Every HAE field goes through this function:

| Line | Field |
|---|---|
| 64–65 | `totalSleep`, `deep`, `rem`, `core` |
| 93 | quantity metrics (steps, distance, energy, exercise minutes, floors) |
| 113–116 | `Avg` / `Min` / `Max` for averaged metrics |
| 141 | heart-rate sample `bpm` |

Line 115 carries a second effect worth naming:

```ts
const mn = num(p.Min ?? p.min) ?? avg
```

The `?? avg` fallback is meant to catch a missing minimum. It never fires when
the field is explicitly null, because `num` has already turned it into `0` and
`??` does not treat zero as absent. The metric is stored with a minimum of
zero — a resting heart rate that touched 0 bpm.

**Measured impact today is small, and this spec says so plainly.** The whole
production database holds exactly two sleep rows with zero phases —
2026-07-15 (1.94 h from 07:08) and 2026-07-29 (1.12 h from 13:47). Both are
daytime naps, and #170 already classifies them as daytime episodes and excludes
them from every aggregate. No night is affected. Rows with genuine `null`
phases exist from the 2021 XML import, which uses a different, correct path
(`sync.ts`, `d.sleepDeep ?? null`).

This is therefore a latent defect: correct to fix, wrong to call P0. It is
specced because the report's whole honesty argument rests on the difference
between "measured zero" and "not measured", and the ingest currently erases it.

## 1. Goals and non-goals

**Goals.** A field the source did not report reaches the database as `null`. A
field the source reported as zero reaches it as `0`. The distinction survives
the ingest.

**Non-goals.** The XML importer (already correct). Repairing the two existing
zero-phase rows — they are daytime naps excluded from every aggregate, and
rewriting stored health data to fix a display that is already correct would be
the larger risk. Sleep-episode modelling (a separate queue item).

## 2. The change

```ts
/**
 * `Number(null)` is 0 and `Number('')` is 0, so the plain coercion turned a
 * field the source explicitly reported as absent into a measured zero. Absence
 * has to be rejected before the coercion, not after it.
 */
export function num(v: unknown): number | null {
  if (v == null || v === '' || typeof v === 'boolean') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}
```

`typeof v === 'boolean'` is included because `Number(false)` is `0` and
`Number(true)` is `1`; neither is a measurement.

Line 115–116 then behaves as written: an absent minimum becomes `null` and the
`?? avg` fallback fires.

Nothing else changes. The function is the single choke point for every numeric
field in the payload.

## 3. Testing

`hae.test.ts` gains, at the `num` level: `null`, `undefined`, `''`, `false`,
`true`, `[]`, `{}` and `'abc'` all return `null`; `0`, `'0'`, `-1` and `'7.5'`
return their numbers. The zero cases are the point of the test — a fix that
rejected legitimate zeros would be worse than the defect.

At the parse level: a payload whose sleep point carries `"deep": null` produces
a row with `deep_hours: null`, not `0`; a payload whose averaged metric carries
`"Min": null` produces a row whose minimum falls back to the average rather
than to zero.

## 4. Rollout

The change is inside `_shared`, so every function that imports it must be
redeployed — in practice `ingest-health`, which must go out with
`--no-verify-jwt` or it returns 401 (this has broken production twice).

```bash
npx supabase functions deploy ingest-health --no-verify-jwt --project-ref mxnmubakfzqoosgsqmhh
```

Verification after deploy: a fresh auto-sync arrives and no new row carries a
zero phase alongside a non-zero total.

## 5. Acceptance criteria

1. `num` returns `null` for `null`, `undefined`, empty string and booleans, and
   returns `0` for a real zero.
2. A sleep point with an explicitly null phase stores `null`.
3. An averaged metric with an explicitly null `Min` stores the average, not
   zero.
4. `ingest-health` is redeployed with `--no-verify-jwt`.
