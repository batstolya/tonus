# Doctor Report Extra Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show breathing disturbances in the main metrics table and 16 more metrics in a new "Additional metrics" section of the doctor report.

**Architecture:** extend `METRIC_DEFS` with `group: 'extra'`; `MetricSummary` carries `group`; both renderers split rows by group; coverage skips extras.

**Spec:** `docs/superpowers/specs/2026-11-25-doctor-report-extra-metrics-design.md`

## Global Constraints

Node 24; lint zero warnings; repo text English; report labels are Russian keys with uk/en in `apps/web/src/lib/translations/settings.ts`.

## Review Focus

- Report period with no extra-metric data → no empty "Additional metrics" heading.
- Six-minute walk on 3 days of 30 → row shows "3 of 30", not listed under gaps.
- Walking asymmetry near 0 → no deviation spam (high minRel).
- en report → every new label translated (no Russian leaking).
- Existing 19 metric rows unchanged in order and values.

### Task 1: Registry
Files: `metrics.ts`, `metrics.test.ts`. MetricKey adds: breath, daylight, effort, basal, standH, standM, envAudio, phoneAudio, walkSpeed, stepLen, asym, dblSupport, stairUp, stairDown, sixMin, cycling, handwash. `MetricDef.group?: 'extra'`; `MetricSummary.group?: 'extra'`.
- [ ] Tests: key order (breath after resp; extras appended in spec order); exactly 16 extras; summarizeMetrics passes `group`.
- [ ] RED → GREEN → commit.

### Task 2: Coverage skips extras
Files: `weekly.ts` (coverage), `weekly.test.ts`.
- [ ] Test: sparse sixMinuteWalk does not appear in gaps; sparse rhr still does. RED → GREEN → commit.

### Task 3: Markdown section
Files: `markdown.ts`, its test (`DoctorReport.test.ts` or a new `markdown.extra.test.ts`).
- [ ] Tests: main table excludes extras and includes breathing; "## Additional metrics (Apple Watch / iPhone)" (ru key 'Дополнительные показатели (Apple Watch / iPhone)') present with rows when data exists, absent otherwise; en output has no Cyrillic in new labels.
- [ ] RED → GREEN → commit.

### Task 4: Printed page section + translations
Files: `DoctorReport.tsx`, `translations/settings.ts`, test asserting every METRIC_DEFS label + section title has uk/en.
- [ ] RED → GREEN → commit.

### Task 5: Verify and ship
`npm test`, lint, build; review; PR; merge after green CI.
