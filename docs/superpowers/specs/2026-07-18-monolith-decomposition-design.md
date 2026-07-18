# Monolith Decomposition: send-reminders + App.tsx

**Date:** 2026-07-18
**Status:** Approved design
**Scope:** Behavior-preserving refactor. No user-visible changes, no schema changes, no new features.

## Motivation

An external structure audit (2026-07-18) confirmed the codebase is well organized at the
directory level but flagged the remaining file-level monoliths. After verification, two
real targets remain (the telegram-bot split was already done in PRs #88–#96):

- `supabase/functions/send-reminders/index.ts` — 717 lines, a single ~600-line handler
  with 12 sequentially numbered sections.
- `src/App.tsx` — 570 lines mixing navigation config, bootstrap/sync effects, import
  handlers, and layout.

Large screens (Dashboard 471, SupplementsScreen 447) are explicitly **out of scope** —
tolerable size, no functional gain from splitting now.

## Approach (chosen: flat modules by responsibility)

Follow the telegram-bot precedent: a thin `index.ts` entrypoint plus flat sibling
modules, each owning one responsibility. No pipeline abstraction, no step registry —
the 12 sections stay a plain sequential call list in the handler (YAGNI).

Move-only discipline: extracted code keeps its logic, comments, and spec references
verbatim. Any behavior change found along the way is reported, not silently fixed.

## Part 1 — send-reminders

### Target layout

```
supabase/functions/send-reminders/
  index.ts        # serve() + withObservability + fail-closed cron-secret gate,
                  # then sequential calls into the modules below (~60 lines)
  time.ts         # localNow, timeDue — pure tz/time helpers
  tg.ts           # tgSend (same shape as telegram-bot/tg.ts)
  doses.ts        # §1 create events for due doses (quiet hours, tz-correct due_at)
  delivery.ts     # §2 atomic-claim delivery + §3 mark overdue as missed
  dailyNote.ts    # §4 evening "how was your day" question (SPEC-DAILY-NOTE)
  digests.ts      # §5 biweekly auto-report + §6 morning summary (B4)
  coach.ts        # §7 proactive alerts, §8 contextual nudges, §9 follow-up resolver
  reminders.ts    # §10 generic reminders (hair photo, stale labs), §11 workout heads-up
  experiments.ts  # §12 auto-verdict for finished experiments (SPEC-EXPERIMENT-LOOP §2.2)
  time.test.ts    # vitest: timeDue window math, localNow tz handling
```

Grouping rule: sections that share queries/state stay together (delivery+missed both
work on the events table; alerts/nudges/follow-up share the dedup pattern). Each module
exports one `run<Name>(ctx)` async function taking a shared context object
`{ supabase, nowUtc, log }` — plain parameter passing, no framework.

`buildForecastText` moves into `digests.ts` (its only consumer); it keeps delegating to
`_shared/forecastMessage.ts`.

### Constraints

- The fail-closed cron-secret gate stays in `index.ts`, before any module runs
  (security spec §3.2).
- Per-row error isolation semantics (§4.1: one failing row must not break the batch;
  config errors must fail the whole job visibly) are preserved verbatim.
- Existing spec-reference comments (automation §2.2–2.3, workout-schedule §2, …) move
  with their code.
- Deploy: standard `npx supabase functions deploy send-reminders` after merge (no
  special flags). `deno check` zero-tolerance applies to all new modules.

## Part 2 — App.tsx

### Target layout

```
src/app/navigation.ts        # NAV_GROUPS, GroupId, getActiveGroup, getActiveSubView
src/app/navigation.test.ts   # vitest (node project): group/subview resolution
src/hooks/useAppBootstrap.ts # the init effect: auth-dependent load of metrics,
                             # HR samples, calendar events; auto-sync scheduling;
                             # profile timezone sync; demo-mode wiring
src/hooks/useImportHandlers.ts # handleDone (file import), handleEvents (ICS),
                             # handleGoogleCalendar (connect + silent sync)
src/App.tsx                  # lazy imports, view switch, layout, ChatWidget,
                             # onboarding/gating — target ≤ ~250 lines
```

- Hooks take their dependencies (store setters, auth state) as arguments or via
  existing hooks — no new context/provider is introduced.
- `unauthedView`/`isResetUrl` gating stays where it is (`components/landing/gating.ts`).
- Lazy `import()` calls stay in `App.tsx` so code-splitting chunks are unchanged.

## Testing

Targeted tests on extracted pure logic only (per decision):

- `send-reminders/time.test.ts` — `timeDue` 5-minute window edges, `localNow` across
  timezones and DST.
- `src/app/navigation.test.ts` — `getActiveGroup`/`getActiveSubView` for every view.

No handler-orchestration tests with Supabase/Telegram mocks. Existing gates remain the
safety net: full vitest suite, e2e, `npm run lint` (0 warnings), `npm run
check:functions` (deno zero-tolerance), CI green before deploy.

## Delivery

Two independent PRs, either order:

1. `refactor(functions): split send-reminders into modules` — then redeploy the
   function and smoke-check one cron tick in logs.
2. `refactor(ui): extract navigation and bootstrap from App.tsx` — frontend deploys
   via the normal CI → Vercel hook path.

## Non-goals

- No screen decomposition (Dashboard, SupplementsScreen).
- No unified deploy pipeline for edge functions (separate decision; requires a CI
  Supabase token).
- No changes to reminder timing, message content, or delivery policy.
