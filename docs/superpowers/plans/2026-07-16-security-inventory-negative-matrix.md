# Security Inventory and Negative Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a complete, drift-checked inventory of Tonus data/auth surfaces and a safe negative-read matrix for an isolated Supabase project.

**Architecture:** TypeScript's AST is the schema source for public tables/views/RPCs, function directories plus `config.toml` are the Edge source, and a small reviewed classification file supplies trust metadata that code cannot infer. A deterministic generated JSON artifact is checked in CI. A separate runner refuses the production project, creates two synthetic users in an isolated target, checks anonymous/cross-user reads, Storage access, and missing/invalid credentials on custom-auth functions, then cleans up.

**Tech Stack:** Node 24, TypeScript compiler API, Supabase JS, Vitest/node:test, Supabase REST/Auth/Storage/Edge Functions.

## Constraints

- Inventory generation is deterministic and changes production behavior nowhere.
- Every discovered surface must be classified; stale/missing classifications fail CI.
- The integration runner must refuse the linked production project ID.
- No personal data, production token, or service key is written to artifacts or logs.
- The isolated live run is external evidence and may remain pending when credentials/environment are unavailable.
- Open a PR only; do not merge or deploy.

### Task 1: Discovery and classification contract

- [ ] Write failing unit tests for AST schema discovery, function/JWT discovery, exact classification coverage, and deterministic ordering.
- [ ] Implement `scripts/security-inventory-lib.mjs` and `security/inventory-classification.json`.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Generated artifact and drift guard

- [ ] Add `scripts/generate-security-inventory.mjs`, `scripts/check-security-inventory.mjs`, and package scripts.
- [ ] Generate `security/inventory.generated.json`.
- [ ] Add the drift guard to CI and prove a missing/stale classification fails locally.

### Task 3: Static authorization assertions

- [ ] Assert every user-owned table/view has an owner rule and every service-only RPC is explicitly classified.
- [ ] Assert every `verify_jwt=false` function has a custom credential owner and no unclassified override header.
- [ ] Record current CORS, rate-limit, credential type, and data sensitivity without changing handlers.

### Task 4: Isolated negative-read runner

- [ ] Add a runner that refuses the production project before network calls.
- [ ] Create/clean two synthetic users and check anonymous/cross-user relation reads, Storage list/download, missing/invalid custom-function credentials, and service redirect sentinels.
- [ ] Emit only aggregate pass/fail counts and surface names; never bodies or credentials.

### Task 5: Documentation and verification

- [ ] Document inputs, refusal rules, evidence format, limitations, and the pending isolated live receipt.
- [ ] Run focused tests, full Vitest/scripts/build/lint/Deno/README/Playwright gates.
- [ ] Review `origin/main...HEAD`, push, and open a non-draft PR; do not merge or deploy.
