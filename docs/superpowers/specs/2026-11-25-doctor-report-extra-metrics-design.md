# Doctor report: new Apple Health metrics — design

Status: approved 2026-11-25. Size: small change.

## Intent

The owner shares the doctor report with doctors and with an LLM for analysis.
The 15 catalog metrics (PR #259) plus breathing disturbances and personal
daylight (PR #258) are stored but absent from the report.

## Decisions

- `METRIC_DEFS` (`apps/web/src/lib/doctorReport/metrics.ts`) gains 17 entries.
  `MetricDef.group?: 'extra'` marks the 16 secondary ones.
- **Breathing disturbances** join the main "Metrics for the period" table,
  right after respiratory rate (clinically relevant next to SpO₂ / resp).
- The other 16 go to a new section "Additional metrics (Apple Watch / iPhone)"
  right after the main table, same columns, in this order: mobility (walking
  speed, step length, asymmetry, double support, stair up, stair down,
  six-minute walk), activity (physical effort, resting energy, stand hours,
  stand minutes, cycling, time in daylight), environment (sound, headphones),
  handwashing. Rendered identically by `markdown.ts` and `DoctorReport.tsx`.
- Deviations include all 17 with conservative `minRel` thresholds.
- Weekly table unchanged.
- Labels: Russian keys with uk/en in `translations/settings.ts`.

## Builder's call (deviation from what was shown to the owner)

- The "Coverage and gaps" list stays limited to main-table metrics. Extra
  metrics are event-like or phone-dependent (six-minute walk ~weekly, cycling,
  headphones), so listing them as "gaps" would flood the section with noise;
  their own table already prints "days with data" per row.

## Non-goals

Within-day min/max for catalog metrics (needs loading min_val/max_val — next
step), AI chat, weekly table.
