# Tonus Public Repository and Architecture Hardening

- **Date:** 2026-07-14
- **Status:** Approved design; ready for implementation planning
- **Owner:** Product engineering
- **Delivery model:** One program, multiple small pull requests

## 1. Purpose

Tonus is now a public repository and already presents a credible full-stack
product: a React and TypeScript frontend, Supabase Postgres with Row Level
Security, Deno Edge Functions, Telegram and health-data integrations, AI
workflows, automated tests, and CI-controlled deployment.

The repository is functional and generally well organized, but making it
public changes the quality bar. Repository-level security controls,
contributor-facing documentation, portable development configuration, and
clear architectural boundaries become part of the product's public surface.

This program hardens that public surface and reduces the maintenance risk of
the largest remaining orchestration modules. It is intentionally staged: the
work must improve security and clarity without changing product behavior or
combining unrelated refactors into a single risky change.

## 2. Current-state evidence

The design is based on a repository audit performed on 2026-07-14. The audit
found the following strengths:

- feature-oriented frontend components under `src/components/`;
- decomposed settings sections and modular translations;
- shared Supabase Edge Function helpers under
  `supabase/functions/_shared/`;
- database migrations treated as the schema contract;
- a polished bilingual README with validated local links and media;
- Vitest, Playwright, TypeScript, lint ratchets, Deno checks, and CI;
- no obvious committed production credentials in the current tracked tree;
- a clear MIT license.

The same audit identified these public-repository and maintainability gaps:

| Area | Current evidence | Risk |
|---|---:|---|
| GitHub security | `main` is not protected; secret scanning, push protection, Dependabot security updates, and code scanning are not enabled | Unsafe or unreviewed changes can reach the deployment branch; leaked credentials may be detected late |
| Agent documentation | `AGENTS.md` and `CLAUDE.md` describe different test environments and deployment procedures | Contributors and AI agents can execute conflicting workflows |
| Local configuration | `.claude/launch.json` contains an absolute user-specific Node path | The checked-in configuration is not portable |
| Repository scope | `claude-monitor/` is an independent Python/Docker/macOS utility with credential-adjacent browser automation | Public scope and security boundaries are unclear |
| Documentation | 118 files under `docs/`, including 64 Superpowers artifacts and 16 archived files | Current guidance is difficult to distinguish from historical design material |
| Frontend orchestration | `src/App.tsx` is 558 lines; `src/index.css` is 2,259 lines | Changes have broad blast radius and weak ownership boundaries |
| Edge Function orchestration | Telegram entrypoint is 1,411 lines; reminders entrypoint is 701 lines; shared health context is 520 lines | Routing, policy, I/O, and presentation concerns are coupled |
| Shared client library | About 80 top-level files are present in `src/lib/` | Domain ownership and intended public imports are difficult to discover |
| MCP configuration | `.mcp.json` and `.codex/config.toml` describe overlapping read-only Supabase access | Configuration can drift and confuse contributors |

File length is a diagnostic signal, not an acceptance criterion by itself.
Modules are split only where the resulting boundary has a clear responsibility
and can be tested independently.

## 3. Relationship to existing programs

This document does not replace:

- `2026-07-13-senior-production-readiness-design.md`, which defines runtime,
  data-security, privacy, observability, recovery, and beta-readiness goals;
- `2026-07-13-tech-debt-reduction-design.md`, which introduced lint/type
  ratchets, UI test infrastructure, and earlier decomposition work;
- `2026-07-13-tech-debt-status.md`, which records completed debt-reduction
  pull requests and the remaining verified debt.

This program owns public GitHub configuration, public repository hygiene,
documentation discoverability, extraction of out-of-scope tooling, and the
next behavior-preserving decomposition of current architectural hotspots.

If requirements overlap, the stricter security requirement applies. Runtime
production-readiness work remains governed by the production-readiness design.

## 4. Goals

1. Make unsafe changes and accidental secret publication materially harder.
2. Present one clear, portable development and deployment workflow.
3. Make the public repository understandable without private historical
   context.
4. Separate unrelated operational tooling from the Tonus product boundary.
5. Reduce the blast radius of the largest frontend and Edge Function modules.
6. Preserve user-visible behavior, API contracts, database contracts, and
   deployment entrypoints throughout the program.
7. Deliver every workstream as a small, independently verifiable and
   reversible pull request.

## 5. Non-goals

- Rewriting React, Supabase, Deno, Vite, or the current deployment stack.
- Introducing microservices, a custom backend, a monorepo framework, or a new
  state-management library without a separately proven need.
- Changing product features, UI design, health scoring, AI behavior, reminder
  policy, or Telegram command behavior.
- Reformatting the whole codebase or chasing arbitrary line-count targets.
- Deleting historical documentation merely to reduce the repository file
  count.
- Rotating or changing production credentials unless a separate security
  investigation finds exposure.
- Combining architecture refactors with feature work.

## 6. Program principles

1. **Security controls before cosmetic cleanup.** Public guardrails are the
   first workstream.
2. **One concern per pull request.** GitHub settings, file moves, documentation
   cleanup, and code decomposition are reviewed independently.
3. **Characterize before moving behavior.** Add focused tests around current
   behavior before extracting code from an orchestration hotspot.
4. **Stable boundaries first.** Existing imports and runtime entrypoints remain
   valid while internals move.
5. **No speculative abstractions.** Extract a module only when it owns a named
   responsibility, dependency boundary, or testable policy.
6. **History is not current guidance.** Historical artifacts may remain, but
   they must be clearly separated from active documentation.
7. **Evidence before deletion.** A file is removed only after references,
   build usage, documentation usage, and deployment usage are checked.

## 7. Workstream A — GitHub security and governance

### 7.1 Required repository settings

Configure the public GitHub repository as follows:

- protect `main` against direct, unverified changes;
- require a pull request before merge, except for an explicitly documented
  owner emergency path;
- require the current CI checks that cover tests, build, lint ratchets, Deno
  checks, and end-to-end validation;
- require branches to be up to date when that does not make the workflow
  unreasonably flaky;
- block force pushes and branch deletion;
- enable Dependabot alerts and security updates;
- enable secret scanning and push protection;
- enable CodeQL for the languages GitHub can analyze reliably in this
  repository;
- enable private vulnerability reporting if available for the repository.

Required checks must be enabled in two steps. First, run the controls in
advisory mode and confirm their exact check names and stability. Only then make
them mandatory. This avoids accidentally locking the deployment branch because
of a renamed or permanently pending check.

### 7.2 Public governance files

Add:

- `SECURITY.md` with supported versions, a private reporting path, prohibited
  disclosure content, and an expected acknowledgement window;
- `CONTRIBUTING.md` with prerequisites, local setup, validation commands,
  migration rules, Edge Function rules, pull-request expectations, and the
  sensitive-data policy.

Issue and pull-request templates are optional. They should be added only if
the repository begins accepting external contributions and the template
reduces real triage work.

### 7.3 Acceptance criteria

- The effective ruleset for `main` is captured in implementation evidence.
- A pull request with a failing required check cannot merge normally.
- A test push containing a safe dummy secret pattern is blocked or detected by
  the configured GitHub control without publishing a real credential.
- Dependabot and code-scanning results are visible to the owner.
- `SECURITY.md` provides a non-public vulnerability reporting route.
- The README or repository metadata links contributors to `CONTRIBUTING.md`.

## 8. Workstream B — Public repository hygiene

### 8.1 One source of contributor instructions

Reconcile `AGENTS.md` and `CLAUDE.md` against the actual configuration and CI:

- Vitest has separate Node and jsdom projects; documentation must not describe
  the repository as Node-only;
- the canonical validation commands must match `package.json` and CI;
- frontend and Edge Function deployment procedures must agree;
- Node version requirements must be expressed portably;
- both files may target different tools, but shared facts must be generated
  from, linked to, or copied from one canonical contributor guide.

Preferred design: put stable project facts in `CONTRIBUTING.md`; keep
tool-specific files short and limited to tool behavior plus links to the
canonical guide.

### 8.2 Portable local configuration

- Replace the absolute Node binary in `.claude/launch.json` with a portable
  command that respects the repository's declared Node version.
- Declare the supported Node version using an ecosystem-standard repository
  file such as `.nvmrc` or `.node-version`, aligned with CI.
- Audit checked-in configuration for other `/Users/...`, machine-specific
  ports, local tokens, and private filesystem assumptions.

### 8.3 MCP configuration ownership

Choose one canonical checked-in description for read-only Supabase MCP access.
Tool-specific adapters may remain only when required by their clients, and
each adapter must point to the canonical environment-variable contract.

Rules:

- no access token or service-role key is committed;
- write-capable database access is not enabled by default;
- the public project reference is treated as an identifier, not a secret;
- the contributor guide explains which environment variables are optional and
  how read-only mode is enforced;
- an automated check prevents credential-shaped values from replacing
  placeholders in tracked config.

### 8.4 Acceptance criteria

- A new contributor can select the supported Node version and run the documented
  validation commands without editing an absolute path.
- Shared facts in `AGENTS.md`, `CLAUDE.md`, and `CONTRIBUTING.md` do not
  contradict one another.
- A repository search finds no user-specific absolute path in active config.
- MCP configuration has a documented canonical contract and contains no
  credential value.

## 9. Workstream C — Extract `claude-monitor`

`claude-monitor/` has a separate runtime, dependency graph, deployment model,
and security surface. It is not part of the Tonus web application or Supabase
backend and should become a separate repository.

### 9.1 Migration sequence

1. Inventory all references from Tonus documentation, scripts, workflows, and
   imports.
2. Document its current environment variables, browser-cookie behavior,
   Docker assets, macOS integration, and operational ownership.
3. Isolate it temporarily under `tools/claude-monitor/` only if extraction
   cannot be completed safely in one change.
4. Create a dedicated repository with its own README, license decision,
   security guidance, ignore rules, and CI.
5. Preserve useful history with a history-filtering or subtree process only if
   the value of that history justifies the complexity.
6. Replace Tonus references with a link to the new repository, then remove the
   Tonus copy.

The extraction must not copy browser cookies, local profiles, generated
reports, secrets, caches, or private operational data.

### 9.2 Acceptance criteria

- Tonus build, tests, scripts, and deployment do not depend on the extracted
  directory.
- The new repository can be installed and validated independently.
- Sensitive local artifacts are excluded and a secret scan passes before the
  new repository becomes public.
- Tonus contains only a short documented link if the tool remains relevant.
- Removal is performed in a dedicated pull request that can be reverted
  without affecting application code.

## 10. Workstream D — Documentation and asset lifecycle

### 10.1 Documentation taxonomy

Use the following public taxonomy:

- `README.md`: product overview and the shortest successful path;
- `CONTRIBUTING.md`: canonical contributor workflow;
- `SECURITY.md`: vulnerability reporting;
- `docs/guides/`: current operational and development guides;
- `docs/specs/`: current product specifications;
- `docs/superpowers/specs/`: approved design records;
- `docs/superpowers/plans/`: implementation plans;
- `docs/archive/`: explicitly historical material that is not authoritative.

Add `docs/README.md` as an index. It must explain the taxonomy, link active
guides, identify source-of-truth documents, and state that archive content is
historical.

Every approved design should contain status metadata: draft, approved,
implemented, superseded, or archived. When a design is implemented, link its
status record or pull requests instead of duplicating the full implementation
history in multiple active guides.

### 10.2 Assets

- Build an inventory of README, docs, application, and GitHub Pages references.
- Hash media files to identify exact duplicates.
- Move current public media to an obvious owned location.
- Remove duplicate archived media only after all tracked references and
  rendered README variants are verified.
- Prefer compressed, web-appropriate media and document the rebuild process
  for generated demonstrations.

### 10.3 Acceptance criteria

- `docs/README.md` lets a contributor locate active setup, architecture,
  deployment, security, and operations guidance.
- Active documents do not link to deleted or relocated files.
- `npm run test:readme` passes after media changes.
- Exact duplicate assets retained only for historical reasons are explicitly
  justified; otherwise they are removed.
- Archived documents are clearly non-authoritative.

## 11. Workstream E — Frontend architecture

### 11.1 `src/App.tsx`

`App.tsx` should remain the application composition root. It may own provider
composition, route/screen selection, and high-level orchestration, but it
should not own detailed feature workflows.

Extract by responsibility, using current behavior as the contract:

- session/bootstrap orchestration;
- demo-mode lifecycle;
- navigation and screen-state orchestration;
- cross-feature modal or overlay coordination;
- data refresh/invalidation orchestration;
- stable layout components.

Do not create a single replacement `useAppEverything` hook. Each extracted
hook or component must have a narrow input/output contract and focused tests.
Existing user-visible loading, error, authentication, and demo behavior must
remain unchanged.

### 11.2 `src/index.css`

Split styles according to ownership:

- global reset, typography, tokens, and layout primitives remain global;
- feature-specific styles move next to the owning feature or into an explicit
  feature stylesheet;
- shared component styles move with the component;
- animation and responsive rules remain with the selector they govern;
- CSS custom properties remain the preferred shared theme contract.

The program does not require CSS Modules, CSS-in-JS, Tailwind, or a design
system migration. The first goal is ownership and reduced blast radius.

### 11.3 `src/lib/`

Group top-level libraries by stable product domain, for example:

- `auth/` and platform clients;
- `health/` and ingestion-facing models;
- `ai/` and research workflows;
- `telegram/` and notification contracts;
- `experiments/`, `goals/`, and product-domain services;
- `i18n/` and translations;
- `shared/` only for genuinely cross-domain primitives.

Exact names must be selected during implementation planning from the import
graph, not imposed mechanically. Introduce compatibility barrel exports during
the transition so file moves do not force a repository-wide behavioral PR.
Avoid cyclic domain dependencies and avoid a new generic `utils/` dumping
ground.

### 11.4 Acceptance criteria

- `App.tsx` is primarily a readable composition root; extracted workflows have
  named owners and behavior tests.
- Global CSS contains only global concerns; feature selectors have discoverable
  owners.
- Moving styles causes no material visual regression in supported viewports.
- `src/lib/` has a documented domain map and no new broad catch-all directory.
- Existing import paths remain compatible during migration or are changed in a
  dedicated mechanical commit.
- TypeScript, unit tests, component behavior tests, build, and relevant
  Playwright scenarios pass for every extraction PR.

## 12. Workstream F — Edge Function architecture

### 12.1 Telegram bot

Keep `supabase/functions/telegram-bot/index.ts` as the deployable Edge Function
entrypoint, limited to:

- request validation and authentication boundary;
- correlation/request context creation;
- dependency construction;
- dispatch to the Telegram application layer;
- HTTP response mapping.

Extract cohesive modules for:

- update parsing and routing;
- commands;
- callback queries;
- conversational state transitions;
- message and keyboard presentation;
- Tonus domain-service calls;
- Telegram transport calls;
- normalized error handling and safe logging.

Routing tables must make supported updates discoverable. Domain services must
not depend on raw Telegram update shapes when a smaller internal command model
is sufficient.

### 12.2 Reminder delivery

Keep `send-reminders/index.ts` as the deployable entrypoint and separate:

- due-reminder selection;
- scheduling and eligibility policy;
- idempotency and delivery-state transitions;
- message rendering;
- Telegram delivery;
- retry/terminal-failure classification;
- metrics and structured observability.

The decomposition must preserve the existing delivery-state model and must not
introduce retries without a proven idempotency boundary.

### 12.3 Shared health context

Split `_shared/healthContext.ts` along data and policy boundaries:

- typed input/query adapters;
- normalization and unit handling;
- aggregation windows;
- derived summaries;
- AI-safe context formatting;
- redaction and sensitive-data constraints.

Health calculations and AI-facing output require golden or characterization
tests before extraction. Refactoring must not change metric meaning, units,
date windows, missing-data behavior, or privacy filtering.

### 12.4 Acceptance criteria

- Edge Function entrypoints contain boundary wiring rather than business
  policy.
- Existing URLs, Supabase configuration, JWT policy, cron invocation, and
  request/response contracts remain unchanged.
- Telegram command, callback, and error-path characterization tests pass before
  and after extraction.
- Reminder selection, idempotency, delivery transitions, and retry decisions
  have focused tests.
- Health context output is identical for the approved golden fixtures unless a
  separately reviewed product change explicitly updates the contract.
- `npm run check:functions` and relevant unit/integration tests pass for every
  Edge Function pull request.

## 13. Verification strategy

Every implementation plan must select the smallest relevant subset and run it
before and after the change. The complete program-level gate is:

```bash
npm test
npm run build
npm run lint:ceiling
npm run check:functions
npm run test:scripts
npm run test:readme
npm run test:e2e
```

Additional verification:

- GitHub settings are verified through the effective ruleset and a disposable
  test branch or pull request;
- documentation and asset work includes tracked-link validation and duplicate
  hashes;
- configuration work includes a repository-wide absolute-path and
  credential-pattern scan;
- UI decomposition includes screenshots or Playwright coverage at supported
  desktop and mobile viewports;
- Edge Function decomposition includes success, validation failure,
  authorization failure, provider failure, and retry/idempotency paths;
- the generated frontend bundle is checked to ensure no server credential or
  sensitive configuration is introduced.

Existing lint and Deno ratchets must never be raised to make a pull request
pass. A changed baseline is accepted only when the actual debt decreases and
the ratchet is reduced accordingly.

## 14. Delivery sequence and dependencies

The required order is:

1. **A — GitHub security and governance**
2. **B — Public repository hygiene**
3. **C — Extract `claude-monitor`**
4. **D — Documentation and asset lifecycle**
5. **E — Frontend architecture**
6. **F — Edge Function architecture**

Workstreams E and F may proceed in parallel only after A and B are complete,
provided they are assigned to independent pull requests and do not touch the
same shared contract. Documentation indexing may begin before extraction, but
final links and scope statements are completed after `claude-monitor` moves.

Each workstream requires its own implementation plan. Large workstreams E and
F should be divided further by hotspot; they must not become one repository-wide
refactor pull request.

## 15. Rollout and rollback

- GitHub controls begin in advisory mode, then become required after one stable
  pull-request cycle.
- File moves use compatibility exports or link redirects where practical.
- Documentation and asset deletion occurs only after reference validation.
- Architecture pull requests contain characterization tests and mechanical
  extraction only; feature changes are deferred.
- Each pull request has an explicit rollback note and can be reverted without
  reverting the full program.
- A temporary `tools/claude-monitor/` state is acceptable only with an owner and
  a dated extraction follow-up.

Stop a workstream when:

- user-visible behavior changes unexpectedly;
- a required validation command fails;
- bundle size, startup behavior, or relevant runtime metrics regress materially;
- an undocumented deployment or data dependency is discovered;
- the proposed module boundary creates cycles or a less clear abstraction;
- security controls would block emergency recovery without a documented owner
  path.

The implementation resumes only after the newly discovered contract or risk is
documented and reviewed.

## 16. Program definition of done

The program is complete when all of the following are true:

- `main` is protected by stable required checks and unsafe branch operations
  are blocked;
- Dependabot security updates, secret scanning, push protection, and CodeQL are
  active or a documented platform limitation explains any exception;
- private vulnerability reporting and public security/contribution guidance
  are available;
- active contributor instructions are consistent and portable;
- checked-in config contains no user-specific absolute paths or credentials;
- MCP read-only access has one documented environment-variable contract;
- `claude-monitor` is independently owned outside the Tonus product tree;
- documentation has a current index and an explicit archive lifecycle;
- duplicate public media is removed or justified and all README checks pass;
- frontend and Edge Function hotspots have clear, testable ownership boundaries;
- runtime entrypoints, database contracts, RLS behavior, API behavior, and
  user-visible behavior are preserved;
- every workstream is represented by reviewed pull requests with green relevant
  validation and rollback notes.

## 17. Decisions deferred to implementation plans

The following choices require current repository evidence at planning time and
are intentionally not predetermined here:

- the exact GitHub ruleset and emergency bypass actors;
- the CodeQL query suite and any unsupported Deno coverage;
- whether `.mcp.json` or `.codex/config.toml` is the canonical MCP declaration;
- the target repository name and history-preservation method for
  `claude-monitor`;
- exact domain folder names in `src/lib/`;
- the precise `App.tsx` extraction boundaries after characterization tests;
- whether feature CSS uses plain colocated stylesheets or the current shared
  import structure;
- module names inside the Telegram, reminder, and health-context functions;
- numeric line-count or complexity budgets, which may be used as review signals
  but are not substitutes for cohesive boundaries.

These decisions must be recorded in the relevant implementation plan and may
not silently expand the program into a product rewrite.
