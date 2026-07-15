<div align="center">

<img src="docs/media/banner.svg" alt="Tonus — a personal health hub" width="880"/>

<br/>

**English** · [Українська](README.uk.md)

<br/>

[![CI](https://github.com/batstolya/tonus/actions/workflows/ci.yml/badge.svg)](https://github.com/batstolya/tonus/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Edge-3ecf8e?logo=supabase&logoColor=white)
![Gemini](https://img.shields.io/badge/AI-Gemini%202.5-8e75ff)

**Connect Apple Watch, log habits and labs, and let Tonus find the patterns<br/>
that actually affect how you feel.**

</div>

---

## See Tonus in action

The landing page includes a live dashboard and opens a complete 90-day demo —
no account or backend required.

<div align="center">
<img src="docs/media/landing-hero.png" alt="Tonus landing page with an interactive daily-readiness dashboard" width="880"/>
</div>

### Daily signal

See readiness, recovery context, streaks and warnings at a glance.

<div align="center">
<img src="docs/media/daily-signal.gif" alt="Tonus dashboard showing readiness, a geomagnetic warning and the activity-streak panel" width="880"/>
</div>

### Ask your data

Ask in plain language; the answer is grounded in your own history.

<div align="center">
<img src="docs/media/ask-your-data.gif" alt="Tonus AI answering health questions from the user's own sleep and lab history" width="880"/>
</div>

### From pattern to experiment

Turn an observed relationship into a measured n=1 change.

<div align="center">
<img src="docs/media/pattern-to-experiment.gif" alt="Tonus moving from personal correlations to measured before-and-after experiments" width="880"/>
</div>

### One health timeline

Log coffee, meals, medication and workouts without opening the app.

<div align="center">
<img src="docs/media/health-timeline.gif" alt="Tonus Telegram assistant logging medication and coffee into one health timeline" width="880"/>
</div>

## What Tonus connects

Tonus turns fragmented signals into one personal timeline. Health data arrives
automatically, everyday context takes seconds to log, and external factors stay
attached to the same dates as your outcomes.

| Source | What reaches Tonus |
|---|---|
| **Apple Health** | Hourly sync through Health Auto Export: sleep, HRV, heart rate, activity, SpO₂, temperature and more |
| **Guided device setup** | Step-by-step Apple Watch and Xiaomi/Mi Fitness setup on iPhone, with a live first-sync check |
| **Manual import** | Apple Health ZIP/XML parsed locally in a Web Worker; raw exports do not need to leave the browser |
| **Telegram** | Natural-language logs, meal photos, medication actions, questions, reminders and reports |
| **Calendars** | Google Calendar and ICS context for stress and workload patterns |
| **Environment** | Weather, air quality, pollen, daylight, pressure changes and geomagnetic Kp index |

## What Tonus can do

<table>
  <tr>
    <td width="50%" valign="top">
      <strong>Understand today</strong><br/><br/>
      Readiness against a personal 30-day baseline; sleep, HRV, heart and activity dashboards; activity streaks; workout plan and adherence; notification centre; early health and geomagnetic warnings.
    </td>
    <td width="50%" valign="top">
      <strong>Find patterns</strong><br/><br/>
      Lag correlations, environmental factors, trends, records and anomalies; AI chat with server-side data tools; period analysis; a print-ready report and question list for a doctor.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Change behaviour</strong><br/><br/>
      n=1 experiments with effect sizes, AI experiment suggestions, automatic verdicts, measurable goals, caffeine decay, treatment tracking, medication adherence and reminders.
    </td>
    <td width="50%" valign="top">
      <strong>Keep a complete record</strong><br/><br/>
      Lab PDF/photo OCR, meal-photo nutrition, supplements, daily notes, symptoms and concerns behind a PIN, hair tracking, calendar context, and full JSON/CSV export.
    </td>
  </tr>
</table>

The interface is available in 🇺🇦 Ukrainian and 🇬🇧 English, with light and dark themes.

## How it works

<div align="center">
<img src="docs/media/architecture.svg" alt="Architecture diagram: health signals, React PWA, Supabase data core and Gemini intelligence" width="880"/>
</div>

- **Frontend:** React 19, Vite 8 and strict TypeScript; deployed as a PWA on Vercel.
- **Backend:** Supabase Postgres with RLS and 20+ Deno Edge Functions.
- **AI:** Gemini 2.5 Flash for grounded chat, explanations, OCR and vision.
- **Automation:** `pg_cron` drives reminders, reports, environment sync and coaching workflows.
- **Statistics:** personal baselines, Pearson lag correlations and Cohen's d experiment effects are computed before AI explains them.

The browser handles the UI and local import work. Supabase owns identity, data,
policies and server workflows. Gemini receives purpose-built health context — not
unrestricted access to the database.

## Privacy and safety

- User-owned rows are protected by Postgres Row Level Security (`auth.uid() = user_id`).
- Gemini credentials and privileged database keys stay inside server functions.
- Webhooks, cron workers and admin actions have explicit secret boundaries.
- Sensitive concerns can be hidden behind a local PIN gate.
- All personal data can be exported as JSON and CSV.
- Tonus reports observations and uncertainty; it is not a medical device and does not provide diagnoses.

## Engineering

- Strict TypeScript across the React client and shared server logic.
- Score formulas are mirrored client/server and protected by golden and parity tests.
- Deterministic demo fixtures generate visible correlations without touching production data.
- AI chat uses bounded server-side function calling instead of asking the model to guess missing facts.
- Reminder delivery uses claim/complete/fail states, retries and timezone-correct local dates.
- Feature screens are lazy-loaded; the landing page and authentication avoid chart-heavy bundles.
- Production deploys only after CI passes tests, build, e2e smoke checks and the lint ceiling.

## Run locally

> **Node 24 is required.** Vite 8 does not run on the old Node 18 default.

```bash
nvm use 24
npm install

cat > .env.local <<'EOF'
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=test-anon-key
EOF

npm run dev        # http://localhost:5173
```

The landing page is static, and **View demo** opens the full UI with generated
data. You can also set `VITE_DEMO=1`; no local Supabase instance is required for
the showcase.

```bash
npm test           # Vitest: client + shared Edge Function logic
npm run test:e2e   # Playwright: landing, demo and connection-guide smoke tests
npm run build      # strict TypeScript + production Vite build
```

To rebuild the README media after UI changes:

```bash
npm run media:readme
```

## Repository map

- [`src/`](src/) — feature-grouped React screens, hooks, parsers, state and client-side statistics.
- [`supabase/`](supabase/) — baseline migrations, RLS policies, Deno Edge Functions and shared server logic.
- [`scripts/`](scripts/) — operational SQL, data helpers and reproducible README-media tooling.
- [`e2e/`](e2e/) — critical Playwright user journeys.
- [`claude-monitor/`](claude-monitor/) — optional local Claude-usage monitor.

## Documentation

| Location | Contents |
|---|---|
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Local setup, required checks and pull request workflow |
| [`SECURITY.md`](SECURITY.md) | Private vulnerability reporting and disclosure policy |
| [`docs/specs/`](docs/specs/) | Product and feature specifications |
| [`docs/guides/`](docs/guides/) | Operations, calendar export, reminders and security guides |
| [`.claude/skills/`](.claude/skills/) | Repository workflows for AI coding agents |
| [`CLAUDE.md`](CLAUDE.md) | Codebase orientation and working conventions |

## Personal extensions

Football reminders and the local Claude limit monitor are personal automations
built on the same notification infrastructure; they are not core Tonus health
features.

---

<div align="center">
<sub>Tonus © 2026 · built for one person, engineered like a product</sub>
</div>
