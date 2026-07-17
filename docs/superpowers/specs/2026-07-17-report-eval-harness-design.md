# Biweekly report eval harness — design

Date: 2026-07-17. Status: approved (owner delegated: "делай, что можешь без меня";
identified as improvement #2 in the senior-level assessment).

## Problem

PR #99 made the report's *facts* deterministic, but the Gemini prose on top is
verified only by eyeballs. Nothing catches a prompt edit that silently drops the
coverage requirement, re-enables diagnosis guessing, or lets the model recompute
cross-period comparisons. The prompt is also assembled inline in `serve()`, so
it cannot be exercised without the whole function.

## Decision

Three pieces, smallest that closes the gap:

1. **Pure prompt builder.** Extract the final template into
   `biweekly-report/prompt.ts` (no Deno imports):
   `buildReportPrompt(input): string` where input carries `periodLabel`,
   `digest1`, `digest2`, `lateFact`, the pre-built content blocks (spo2, sleep
   stages, nutrition, workout, adherence, labs, notes — passed as one joined
   string, their assembly stays in index.ts), and `detail: 'short'|'medium'|'full'`
   (the `detailSpec` variants move in with the template). `index.ts` calls it;
   behavior byte-identical.

2. **Pure output invariants.** `biweekly-report/reportInvariants.ts`:
   `checkReportInvariants(report, facts): string[]` returning violation
   messages (empty = pass):
   - no markdown markup (`**`, `##`, backticks) — prompt demands plain text;
   - no diagnosis-guess vocabulary (вирус/отравлен/инфекц/грипп/COVID…);
   - contains a data-coverage statement (`Покрытие данных` or `N/14`);
   - late-bedtime counts from the precomputed fact line appear and no invented
     alternative counts of "поздн… засыпан…" contradict them (checked as: the
     two numbers from `facts.lateCurrent/latePrev` must both occur in the text
     if late bedtimes are mentioned at all).
   Both modules vitest-tested (node project) — this is the CI-enforced layer:
   the prompt always ships its constraints, and the invariant checker itself
   is proven.

3. **On-demand model eval.** `biweekly-report/report.eval.test.ts` — a normal
   vitest file that `describe.skipIf(!process.env.GEMINI_API_KEY)`s. With a key
   in the env it builds prompts from 2 golden fixture digest sets (a normal
   period and a sparse-data period), calls Gemini 2.5 Flash with the production
   generation config, and asserts `checkReportInvariants` passes for each.
   In CI (no key) the suite reports as skipped — zero cost, zero flake. Run
   locally: `GEMINI_API_KEY=... npx vitest run --project node supabase/functions/biweekly-report/report.eval.test.ts`.

## Non-goals

- Scoring prose quality/helpfulness (subjective; needs a judge model — later).
- Evaluating chat-health (different prompt path; same pattern can be applied
  once this one proves out).
- CI-gating on live model output (flaky and costs money by design).

## Deploy

`biweekly-report` only (index.ts now imports prompt.ts).
