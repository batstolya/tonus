---
name: deploying-tonus
description: Use when releasing the Tonus frontend or reviewed Supabase Edge Functions with the required CI, explicit targets, smoke checks, and sanitized receipts
---

# Deploying Tonus

## Frontend

A merge or push to `main` runs the GitHub Actions `ci` job. Only a successful
`ci` job allows the subsequent `deploy` job to call the Vercel production
Deploy Hook. Vercel's direct Git deployment is disabled in `vercel.json`.

Check the current run before claiming a frontend release succeeded:

```bash
gh run list --repo batstolya/tonus
```

Production Supabase public values live in Vercel. Local `.env.local` values do
not update production.

## Edge Functions

Edge Functions never deploy through the frontend pipeline. Follow
`docs/guides/edge-function-deployments.md` exactly:

1. establish the reviewed SHA/tree and explicit affected function list;
2. run the required local gate;
3. use a clean checkout of that exact SHA;
4. run the repository wrapper's network-free preflight;
5. bind an allowlisted machine smoke ID to the exact target list before the
   first production request;
6. deploy only the named functions, sequentially;
7. verify live status/version/JWT mode;
8. run the same checked-in, allowlisted synthetic smoke action recorded in the
   deployment receipt;
9. require unchanged live version/hash/JWT metadata, then attach the completed
   sanitized receipt.

Do not call the raw Supabase deployment command, add operator JWT flags, deploy
all functions, deploy in parallel, or place a production Supabase credential
in GitHub Actions.

## Shared modules

When `_shared` code changes, identify every importer from the reviewed checkout:

```bash
rg -l "_shared/<module>" supabase/functions --glob 'index.ts'
```

Include every affected importer in the review and deployment target list. Do
not rely on a hand-maintained importer table.

## Database migrations

Migrations live in `supabase/migrations/` and use the
`YYYYMMDDhhmmss_description.sql` naming scheme. Database changes require their
own review and restore/forward-fix decision. Historical migration comments may
mention old raw deployment commands; the canonical guide and wrapper override
them.

## Evidence and stop conditions

- A green local build is not proof of a production deployment.
- A successful Supabase CLI exit is not proof of the intended JWT mode.
- A `smoke_pending` receipt is not a completed deployment.
- The deploy action must receive `--smoke-check-id`; it is validated against
  the exact ordered function list before any Supabase request and cannot be
  substituted during receipt completion.
- A manually claimed smoke result is not evidence; the wrapper must execute the
  allowlisted harness and record pass or failure.
- Never retain credentials, response bodies, real identifiers, or health data.
- Stop on dirty checkout, SHA mismatch, missing target, failed local gate,
  floating or non-literal imports, unsupported dependency manifests/custom
  entrypoints, metadata drift, smoke failure, or uncertain safe recovery.
