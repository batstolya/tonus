# Initial CodeQL Triage — 2026-07-15

CodeQL default setup completed against baseline commit
`41a02c795a1b0b9532d02fda88e8c0127ab1c56e` and opened 11 alerts. A successful
analysis job means the scanner ran; it does not mean the code is finding-free.
This document records the initial disposition without dismissing or hiding any
alert.

| Alerts | Severity | Location | Initial disposition | Owner / verification |
|---|---|---|---|---|
| #1–2 | Medium | `.github/workflows/ci.yml` | Expected resolved by default-deny workflow permissions and job-scoped `contents: read` only for CI in PR 1. | PR 1; confirm both alerts close after the post-merge scan. |
| #3 | High | `src/components/dashboard/HealthAlertBanner.tsx:50` | Likely false positive: the normalized value is rendered as a React text child, not an HTML sink. | Security review; confirm the dataflow and dismiss with this reason only after re-analysis. |
| #4 | High | `src/components/dashboard/NotificationBell.tsx:159` | Likely false positive: the normalized value is rendered as a React text child, which React escapes. | Security review; confirm the dataflow and dismiss with this reason only after re-analysis. |
| #5 | High | `supabase/functions/_shared/healthContext.ts:500` | Likely false positive: the normalized value becomes plain AI-prompt text, not browser HTML. | Security review; confirm there is no later HTML sink before dismissal. |
| #6–7 | High | `src/components/hair/HairScreen.tsx:265,305` | Likely false positive: the values are Supabase signed image URLs assigned to React `img src`, not reinterpreted HTML. | Security review; verify the signed-URL source and absence of an HTML sink before dismissal. |
| #8 | High | `src/lib/demoAi.ts:20` | Likely false positive: `Math.random()` contributes only to disposable demo fixture IDs and is not used for authentication, authorization, tokens, or persisted security state. | Security review; confirm demo-only reachability before dismissal. |
| #9 | Medium | `supabase/functions/analyze-health/index.ts:146` | Actionable error-boundary finding: an internal error string is returned to the caller. | Phase 0 privacy-safe error-boundary work; replace with a stable public error and private redacted telemetry. |
| #10 | Medium | `supabase/functions/send-football-reminders/index.ts:78` | Actionable error-boundary finding: caught error details can flow into a JSON response. | Phase 0 privacy-safe error-boundary work; return a stable public error and retain only redacted operational metadata. |
| #11 | Medium | `supabase/functions/sync-football-fixtures/index.ts:239` | Actionable error-boundary dataflow through the shared JSON response helper. | Phase 0 privacy-safe error-boundary work; trace the source and add a stable redacted response contract. |

The likely false positives remain open until their stated dataflow checks are
completed. Alerts #9–11 are not deferred as harmless: they are assigned to the
Phase 0 error-boundary work and must be resolved before the beta gate closes.
