# Mobile v2 — roadmap and work breakdown

Status: draft for approval, 2026-07-27. Parent design:
`2026-07-18-mobile-monorepo-design.md`. v1 (auth, HealthKit read, delivery,
Today) is complete in code — PRs #139–#161.

## The goal, in one sentence

The phone becomes the only way health data reaches Tonus, and — screen by
screen — the place where Tonus is used, with the web staying as the wide
display for analysis.

Two things follow from that, and they are ordered:

1. **Sync first.** Today the data arrives through Health Auto Export: a paid
   third-party app that must be bought, pointed at a webhook and not forgotten.
   For the owner that is tolerable; for anyone handed an invitation it is a
   wall before the first number appears. Until HAE is switched off, the mobile
   app has not done its main job.
2. **Screens after.** Parity with the web is the destination, not the first
   release. Each screen moves on its own, and the MVP carries only what is
   needed to stop using the web daily.

Notifications stay in Telegram (decided 2026-07-27). No push work, no APNs, no
Apple Developer dependency from that direction.

## Distribution: the fork that has to be decided, not designed around

The intent was "build it and let whoever wants install it, outside the store".
That model is Android's. On iOS it does not exist:

- **Free Apple ID (today).** The app can only be installed by cabling the
  device to this Mac, and the signature expires after 7 days. Fine for the
  owner, impossible for anyone else.
- **Apple Developer Program, $99/year → TestFlight.** The closest thing to
  "install from a link": an invitation, one tap, builds valid 90 days, up to
  10 000 testers. No App Store review of the product itself for internal
  testers (external testers get a light review).
- **Ad-hoc IPA.** Also needs the $99 account, plus every device's UDID
  registered in advance, capped at 100 devices a year. Strictly worse than
  TestFlight.
- **Android.** Here "build it and share the file" genuinely works. But
  HealthKit does not exist on Android: reading health data means implementing
  **Health Connect** — a second read layer behind the same payload builder.

- **SideStore (free, owner's phone only).** Investigated 2026-07-28. A fork of
  AltStore that, after a one-time setup from a computer, **renews the signature
  on the device itself** — no cable, and no Mac awake on the network the way
  AltStore Classic needs. The certificate is still the 7-day one; the weekly
  chore just stops being manual. Same free-tier ceilings apply: three apps at
  once, ten App IDs a week, a pairing file to maintain, and a setup that iOS
  updates occasionally break.

So the choice is: pay $99, or build Android, or keep the app to one phone.
Everything in this document is unaffected by that choice **except** block D.

**What the $99 actually buys.** Not the owner's convenience — SideStore covers
that for free. It buys *the ability to hand the app to anyone else at all*:
with a free account there is no distribution, only carrying someone's phone to
this Mac and repeating it weekly. Since the stated point of the mobile app is
to remove HAE as the wall in front of an invited user, the fee is part of the
price of that goal rather than an optional upgrade. If the beta stays
hypothetical, SideStore is enough for months.

**Unverified until the first device build:** the app requests the HealthKit
*background delivery* entitlement. HealthKit itself is available to free
accounts (Apple's supported-capabilities table lists it for the free tier), but
whether that entitlement survives re-signing through SideStore is not something
the simulator can answer — it does not enforce provisioning at all. If it does
not survive, only background delivery is lost; the on-open sync, which is the
guarantee, keeps working.

## The work, cut into deliverable tasks

Each task below is meant to be handed to a separate agent: self-contained, its
own spec, its own branch **from `main`** (stacked PRs have cost us a closed PR
and two full-history conflicts already), its own verification that does not
depend on a human eyeballing a screenshot where a check could exist instead.

### Block A — finish the sync (highest value, blocks nothing else)

- **A1. Parallel run and the HAE switch-off.** Runs the phone and HAE together
  for a week, diffs `ingest_raw` per day and metric with
  `scripts/diff-ingest-sources.ts`, then turns HAE off in one deliberate step.
  *Needs the physical iPhone; the deliverable is a recorded diff log, not code.*
- **A2. First-run sync onboarding.** Replaces the debug screen as the entry
  point: explain what is read and why, request Health access, show what came
  back, and — the case Apple deliberately makes ambiguous — say what to do when
  nothing comes back. The copy and the permission logic already exist in
  `HealthDebugScreen`/`read.ts`; this is about making them the real first
  screen rather than a stand.
- **A3. Sync settings in the app.** The switch, the last outcome, "send now",
  and a warning that regenerating the token on the web silences the phone.
  Today all of this is buried in a debug screen reachable by a deep link.

### Block B — screens, one per task

- **B1. App shell.** Tab navigation, theme and typography tokens, and the
  shared loading/error/empty states. **Everything in B depends on this**, so it
  goes first and stays deliberately small.
- **B2. i18n.** Mobile strings are hardcoded Russian today. The web already has
  ru/uk/en. Doing this **before** the screens is the cheap order: doing it
  after means rewriting every string that B2–B8 introduce.
- **B3. Diary** — read and entry.
- **B4. Metrics and charts.** `recharts` cannot come along (it is DOM-bound);
  the chart layer is `react-native-svg`, of which `Sparkline` is the first
  piece. This task defines the chart primitives the rest reuse.
- **B5. Sleep.**
- **B6. Supplements and intake.**
- **B7. Goals and experiments.**
- **B8. AI chat.** Last on purpose: it is the screen that most depends on the
  others' conventions, and its server side (`chat-health`) needs no change.

### Block C — platform work that is not a screen

- **C1. Demo mode on mobile.** The landing has it; the phone shows a stub. It
  is what lets anyone see the app before signing in, and what makes screenshots
  possible without exposing real data.
- **C2. Settings, profile and the privacy PIN.** Sits between B and C: it is a
  screen, but it also carries the storage and privacy contracts.

### Block D — distribution (gated on the decision above)

- **D1. TestFlight.** Apple Developer enrolment, signing, an upload workflow,
  and the privacy/data-use answers App Store Connect demands even for testing.
- **D2. Android + Health Connect.** A second read layer behind the existing
  payload builder, plus the app shell on Android. Large; only worth starting if
  free distribution is the actual requirement.

## Order

```
A2 ─┐
A3 ─┼─ independent of everything, can run in parallel
B1 ─┴─ then B2 (i18n) ─→ B3…B8 in any order, one agent each
A1 ── whenever the phone is available (not code work)
C1, C2 ── any time after B1
D1/D2 ── after the $99 / Android decision
```

## What "done" means for the version

- HAE is off and has been off for a week without a gap in the data.
- The owner opens the phone, not the browser, for the daily look.
- Nothing on the phone silently disagrees with the web: the same shared
  functions compute the numbers on both.

## Notes for whoever picks up a task

- Branch from `main`. Never from another task's branch.
- The simulator is not optional: four bugs this month were invisible to types,
  lint and tests, and visible in the first tap (a server unit sent to
  HealthKit, a Nitro proxy name reaching the server as the device name, three
  identical POSTs per app open, silent background-delivery refusals).
- Shared logic goes to `packages/shared` (client-only) or
  `supabase/functions/_shared` (dual-runtime), never a copy in `apps/mobile`.
- An RN `Switch` does not respond to a synthetic tap; a short horizontal swipe
  flips it. Relevant to any automated check that touches one.
