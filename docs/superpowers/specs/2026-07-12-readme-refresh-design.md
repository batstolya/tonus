# Tonus README refresh design

**Date:** 2026-07-12  
**Status:** approved for implementation planning

## Goal

Turn the repository README into a credible public product showcase and technical
portfolio. Preserve the current strong hero treatment, replace the long and
laggy screen-recording GIFs with focused product demonstrations, and bring the
feature list in line with the application that exists today.

## Audience and languages

The README serves two audiences in this order:

1. people evaluating Tonus as a product;
2. engineers evaluating its architecture and implementation quality.

`README.md` is the canonical English version. `README.uk.md` is the Ukrainian
version. Both files share the same structure and media. Each file links to the
other near the top.

The public story stays focused on personal health. Football reminders and the
Claude usage monitor are mentioned only as small personal extensions near the
end rather than presented as core product capabilities.

## Preserve the current version

Before changing README content or media, copy the current presentation into a
dated directory under `docs/archive/`. The archive includes:

- the current `README.md`;
- `banner.svg`;
- `landing-tour.gif` and `app-demo.gif`;
- `landing-hero.png` and `dashboard.png`;
- a short note with the date and source commit.

The archive is a restoration snapshot, not content linked from the new README.

## README information architecture

The two README files use this section order:

1. **Hero** — existing Tonus banner, stable badges, one-sentence value
   proposition, and language switch.
2. **See Tonus in action** — four focused demonstrations with concise captions.
3. **What Tonus connects** — Apple Health, manual entries, Telegram, calendars,
   and environmental data flowing into a single personal timeline.
4. **What it can do** — capabilities grouped by user outcome:
   - Understand today
   - Find patterns
   - Change behavior
   - Keep a complete health record
5. **How it works** — a compact architecture illustration and a short stack
   explanation.
6. **Privacy and safety** — RLS, server-side AI credentials, personal baselines,
   exportability, and the non-diagnostic boundary.
7. **Engineering** — TypeScript boundaries, Deno Edge Functions, mirrored score
   formulas, CI, tests, and deterministic demo fixtures.
8. **Run locally** — prerequisites and the shortest reliable startup path.
9. **Repository map and documentation** — directory guide and deeper references.
10. **Personal extensions** — one brief note about football reminders and
    `claude-monitor`.

The top remains visually light. Detailed feature inventory and engineering
material appear only after the product story.

## Product demonstrations

Remove the current long scrolling tours from the active README and replace them
with four deterministic Playwright scenarios:

1. **Daily signal** — readiness, key metrics, activity streak, workout context,
   and an environmental warning.
2. **Ask your data** — open the health chat, ask about sleep or HRV, and show a
   structured answer grounded in personal metrics.
3. **From pattern to experiment** — inspect a correlation, open an experiment,
   and show its before/after result.
4. **One health timeline** — record a relevant event and show it represented in
   the journal or timeline.

Each animation must communicate one idea without requiring the caption to
explain what changed.

### Capture and encoding rules

- Use demo fixtures only; no private or production data.
- Drive all interactions programmatically through Playwright.
- Do not use continuous page scrolling or hard cuts between unrelated screens.
- Keep each scenario between 6 and 8 seconds.
- Capture around 960x600 at device scale factor 1.
- Encode at 8–10 frames per second with a palette shared across the animation.
- Include short holds before and after the important state change.
- Use a subtle synthetic cursor and restrained click emphasis where it improves
  comprehension.
- Keep each GIF at or below roughly 1.5 MB unless a small exception materially
  improves legibility.
- Make the first frame a complete, useful composition so the GIF degrades well
  when animation is paused.
- Provide one reproducible command that rebuilds all README media.

The landing page is represented by a crisp static image. Animation is reserved
for product actions that benefit from motion.

## Architecture visual

Replace the Mermaid block in the README with a repository-owned SVG. This avoids
GitHub's Mermaid controls and inconsistent diagram framing while keeping text
sharp at any scale.

The illustration shows:

- Apple Health / Health Auto Export and manual imports;
- React SPA on Vercel;
- Telegram;
- Supabase Auth, Postgres with RLS, and Deno Edge Functions;
- Gemini and external context providers such as Open-Meteo and calendars.

The SVG must be understandable in both light and dark GitHub themes, have useful
alternative text, and avoid language-specific labels where practical so both
README versions can share it.

## Content accuracy

Use the application code, `docs/specs/SPEC-OVERVIEW.md`, current Edge Function
directories, and changes since the last README-media update as sources of truth.
The refresh must cover current differentiators without becoming a changelog,
including:

- Apple and Xiaomi connection guidance;
- activity streaks and the notification center;
- workout schedule and adherence;
- environmental and geomagnetic context;
- richer AI chat with server-side tools and historical health context;
- private concerns behind a PIN;
- experiment suggestions and automatic experiment verdicts;
- doctor report generation.

Avoid brittle counts in badges. Exact counts such as tests or Edge Functions may
be included only when generated or verified during the refresh; otherwise use a
stable qualitative description.

## Accessibility and maintainability

- Every image has meaningful alt text in both languages.
- Captions describe the user outcome rather than restating visible controls.
- Headings and links remain useful when images do not load.
- English and Ukrainian section structure stays identical.
- Shared paths and commands are kept in one obvious place in the recording
  script so future updates do not require manual editing across scenarios.
- Generated media has deterministic names and replaces files atomically.

## Verification

Implementation is complete only when all of the following pass:

1. archive snapshot contains the old README and all old active media;
2. both README files have matching section structure and valid relative links;
3. all four scenarios can be rebuilt from a clean checkout with the documented
   command;
4. each GIF meets the duration, readability, privacy, and approximate size
   targets;
5. the architecture SVG renders correctly in light and dark contexts;
6. the README is visually inspected at GitHub-like desktop and narrow widths;
7. project unit tests, end-to-end smoke tests, and production build pass;
8. the working tree contains no generated files outside the intended archive,
   README, script, and media changes.

## Out of scope

- changing application behavior solely for the README;
- publishing a narrated video or external demo site;
- presenting football reminders or Claude monitoring as core health features;
- redesigning the existing Tonus brand or hero banner unless a small technical
  adjustment is required for consistent rendering.
