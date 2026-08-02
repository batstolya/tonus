# Doctor report v2 — full data coverage and an AI-ready export

Design for reworking the doctor report (`SPEC-DOCTOR-REPORT.md`, shipped
2026-07-12). The report is kept as a printable page and gains a second
consumer: an external AI chat the user pastes the report into.

## 0. Why

An audit of the shipped report on live demo data found it exposes 4 of the 18
metrics already stored in `DailyMetrics`, and several sections are wrong rather
than merely thin:

- **Metrics** — only resting heart rate, HRV, sleep hours and steps. SpO₂,
  respiratory rate, wrist temperature, VO₂max, sleep stages, bedtime/wake time,
  active energy, exercise minutes, distance and floors are collected, rendered
  on other screens, and absent here.
- **Scores** — `computeDailyScores` is called but only for baselines; the scores
  themselves never reach the report.
- **Labs ignore the selected period.** `loadLabResults` reads the whole history
  and `latestLabs` keeps the last value per marker, so 30/90/365 changes
  nothing. The empty state still reads "no data for the period". Only the latest
  and one previous value survive: a marker measured five times loses three.
- **Supplements** — only `active = true` rows load, so discontinued treatments
  (clinically the interesting ones) are invisible. Adherence divides by the full
  period, so a supplement started a month into a 90-day window reports ~27%
  when the user missed almost nothing.
- **Concerns** — name, start date and status only; `concern_logs` severity
  history and notes are dropped.
- **The AI digest is thinner than the report** — `analyze-health` receives
  metrics and labs only, so the questions it drafts cannot reference
  supplements or concerns.
- **No patient identification** at all on a printed page.

## 1. Goals and non-goals

**Goals.** One model behind both outputs; every metric already collected; data
gaps stated explicitly; a copy-ready markdown rendering for pasting into an
external AI.

**Non-goals.** New data sources (weight, blood pressure — the app stores
neither), intake/lifestyle and goals/experiments sections (deliberately out of
scope, see §7), PDF generation in code, sending the report anywhere.

## 2. Architecture

Client-side model with two renderers. `lib/doctorReport.ts` becomes a folder:

| Module | Responsibility |
|---|---|
| `doctorReport/model.ts` | Types and `buildReportModel(sources, period)` — pure, no queries |
| `doctorReport/markdown.ts` | `toMarkdown(model, lang)` |
| `doctorReport/labs.ts` | `latestLabs` / `parseRefRange`, moved unchanged |
| `doctorReport/load.ts` | Loads every source into one `ReportSources` |

`DoctorReport.tsx` stops computing anything: it loads sources, builds the model,
and renders it as print tables or hands it to `toMarkdown`.

The server-side `_shared/healthContext.ts` is deliberately **not** reused. It is
shaped for chat (last 5 days, rolling 7-day windows), not for a 30/90/365
period; bending it to serve both would destabilise the chat, make printing
depend on the network, and require an edge-function deploy for every wording
change. Demo mode also keeps working for free on the client, which
`SPEC-DOCTOR-REPORT.md` §4.6 requires.

## 3. Report contents

Section order is identical in print and markdown.

1. **Header** — period, generation date, source, disclaimer, and a blank
   `Пациент: ____` line for handwriting. The app stores no name, age or sex and
   this design does not add them.
2. **Tonus scores** — sleep, recovery, load: period average plus first-third
   against last-third trend. Readiness is excluded: on this data it carries
   little signal.
3. **Metrics** — every metric with data, average / min / max / deviation from
   personal baseline / days with data. A metric with no data is omitted, not
   printed as a row of dashes. Average bedtime and wake time are appended as
   time-of-day rows.
4. **Weekly dynamics** — resting HR, HRV, sleep, deep, REM, SpO₂, respiratory
   rate, steps, exercise minutes, plus a days-per-week column.
5. **Sleep, night by night** — every night of the period unaggregated: date,
   weekday, bedtime, wake time, hours asleep, deep, REM and core hours, and
   deep/REM as a share of the night. Measured values only. Time in bed and
   sleep efficiency were prototyped and then dropped: nothing in the ingest
   supplies them, and deriving them from `bedtime`/`wake_time` is unsound —
   the XML importer sets those from the first and last *asleep* interval
   (`healthParser.worker.ts`), while the HAE auto-sync path fills them from
   `sleepStart`/`sleepEnd` (`_shared/hae.ts`), so the same column means
   different things depending on how the night arrived. The share-of-night
   percentages stay because they are arithmetic over two measured values.
   The section closes with counts of nights, nights under 6 hours, nights of 8
   or more, and nights with no record, plus a source-quality line counting
   nights whose wake time is earlier than bedtime plus sleep duration — those
   rows are printed as recorded, never corrected. This is the one section that
   stays daily; the rest of the report aggregates weekly.
6. **Coverage and gaps** — per-metric coverage whenever 10% or more of days are
   missing, and the list of days with no record at all.
7. **Deviations** — see §4.
8. **Labs** — two tables with deliberately different scopes. The summary table
   respects the period: one row per marker with value, reference range,
   out-of-range flag, previous value and delta with its date, and markers whose
   latest measurement predates the period start are named explicitly as such.
   The history table below it does **not** filter by period — every measurement
   of every marker as a date-ordered series, closing with a count of
   measurements and markers, because a doctor reading a lab trend needs the
   whole series regardless of the window chosen for wearable data.
9. **Supplements** — active and discontinued, with status, first logged intake,
   and adherence measured from that first intake rather than from the period
   length.
10. **Concerns** — status, start, note, severity trend from `concern_logs`
   (first half of period against second), and the last three logged entries.
   Private concerns stay excluded unless unlocked and picked, unchanged.
11. **Wellbeing and journal** — weekly wellbeing averages and the last 12 notes.
12. **What this data does not contain** — an explicit list (no blood pressure,
    weight, temperature, diagnoses, prescriptions, nutrition, ECG) closing with
    "absent, not zero". Without it a language model reads silence as normality.

## 4. Deviation detection

A prototype run over demo data settled the rules; all three naive versions
failed on real-shaped input.

- **Compare weekly means, not days.** A 1.5σ threshold against daily spread
  detected nothing: daily variance is always wider than a weekly shift.
- **Use median and MAD, not mean and σ.** A genuinely bad week inflates σ enough
  to mask itself. MAD (scaled by 1.4826) is unaffected by the outlier it is
  meant to find.
- **Thresholds are per metric.** No single percentage works: 8% on resting heart
  rate is an event, 25% on steps is an ordinary week. Each metric carries its
  own `minRel` (resting HR 5%, HRV 12%, SpO₂ 2%, sleep 10%, steps 25%,
  exercise minutes 40%, …).

A week is reported when it holds at least 5 days of data and its mean sits both
beyond 2 MAD from the median of weekly means and beyond that metric's `minRel`.
Results group by week, not by strength: sleep, resting HR and steps moving
together is one event, and a flat list hides that.

On the deliberately damaged fixture (a 9-day gap, HRV every third day, one
illness week) this surfaces both illness weeks across four metrics; on the clean
fixture it reports a single honest HRV week.

## 5. UX

The setup screen keeps its period, language and section checkboxes, and gains a
"Дневник и самочувствие" section toggle. The preview toolbar gains
**«Скопировать для ИИ»** next to Print, which writes `toMarkdown(model, lang)`
to the clipboard and confirms inline. No file download: the paste target is a
chat box.

The AI-questions mode of `analyze-health` receives that same markdown as its
digest instead of the current two-line summary. The prompt itself and the
`ai_usage.source = 'doctor-report'` accounting are unchanged.

## 6. Testing

- `model.test.ts` (node) — coverage counting, per-metric thresholds, MAD
  against a masking outlier, adherence windows, labs outside the period.
- `markdown.test.ts` (node) — section order, "what is missing" block always
  present, private concerns never rendered.
- `DoctorReport.test.tsx` (jsdom) — copy button writes to the clipboard;
  unlocking is still required for private concerns.
- The temporary generator `src/lib/__sample-doctor-report.test.ts` is deleted
  when the real modules land.

## 7. Out of scope

Intake (coffee, alcohol, medication) and workout plan-versus-fact are available
in `intake_events` and the workout schedule but stay out by the user's decision
(2026-07-31); alcohol and medication are clinically relevant, so this is the
first candidate if the report is extended. Goals and experiments likewise stay
out. Weight, blood pressure and body temperature have no data source at all.

## 8. Acceptance criteria

1. Every metric with data in the period appears; metrics without data are
   absent rather than dashed.
2. Selecting 30 / 90 / 365 changes the labs summary table, and markers whose
   latest measurement predates the period are marked as such.
3. Every lab measurement in the database appears in the per-marker history
   regardless of period, with the total count printed.
4. Adherence for a supplement started mid-period is computed from its first
   logged intake.
5. Every night with sleep data appears as its own row with measured values
   only; nights with an impossible wake time are counted in a source-quality
   note and printed unchanged.
6. The illness-week fixture surfaces in Deviations; the clean fixture does not
   surface noise.
7. "Скопировать для ИИ" places the full markdown on the clipboard, matching the
   printed sections one to one.
8. Without the AI checkbox the report still makes no AI call.
9. Demo mode renders every section.
