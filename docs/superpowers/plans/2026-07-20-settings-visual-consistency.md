# Settings Visual Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Settings screen to one visual language — unified section-header icons, one text-link class, one input style, one small-text size scale — without touching shared components or changing any behavior.

**Architecture:** Pure CSS + JSX markup edits confined to `src/components/settings/**` and the `settings-*`/`link-btn` rules in `src/index.css`. No shared classes (`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.log-input`) are redefined; only Settings-local call sites and Settings-only CSS rules change. No logic, no props, no copy changes beyond emoji→SVG markup.

**Tech Stack:** React 19 + TypeScript, Vite, plain CSS in `src/index.css`, vitest. Node 24 required for all commands (`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`).

**Spec:** `docs/superpowers/specs/2026-07-20-settings-visual-consistency-design.md`

---

## Preamble: environment & baseline

Run these once before starting. All later commands assume Node 24 is on PATH.

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
node --version   # must print v24.x
cd /Users/anatolii/tonus
git checkout main && git pull
git checkout -b feat/settings-visual-consistency
```

Establish the green baseline so any later failure is attributable to this work:

```bash
npm run lint && npm run build
```

Expected: both succeed (`lint` with 0 warnings, `build` completes `tsc -b && vite build`). If either fails on a clean checkout, stop and investigate before making changes — the baseline must be green.

---

## Task 1: Section header icons — convert the 4 outliers

The 11 sections that already use the standard 18×18 SVG header are **not touched**. Only PrivacySettings, AiConsentSection, DeleteAccountSection (emoji→SVG) and DeviceSection (`<h2>`→`<h3>` + add icon) change.

**Files:**
- Modify: `src/components/settings/PrivacySettings.tsx:33`
- Modify: `src/components/settings/sections/AiConsentSection.tsx:36`
- Modify: `src/components/settings/sections/DeleteAccountSection.tsx:41`
- Modify: `src/components/settings/sections/DeviceSection.tsx:17`

- [ ] **Step 1: PrivacySettings — replace 🔒 with a lock SVG**

Current (`src/components/settings/PrivacySettings.tsx:33`):

```tsx
      <h3 className="settings-section-title">🔒 {t('Приватность')}</h3>
```

Replace with:

```tsx
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        {t('Приватность')}
      </h3>
```

- [ ] **Step 2: AiConsentSection — replace ✨ with a sparkle SVG**

Current (`src/components/settings/sections/AiConsentSection.tsx:36`):

```tsx
      <h3 className="settings-section-title">✨ {t('Обработка данных ИИ')}</h3>
```

Replace with:

```tsx
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>
        {t('Обработка данных ИИ')}
      </h3>
```

- [ ] **Step 3: DeleteAccountSection — replace 🗑 with a trash SVG**

Current (`src/components/settings/sections/DeleteAccountSection.tsx:41`):

```tsx
      <h3 className="settings-section-title">🗑 {t('Удаление аккаунта')}</h3>
```

Replace with:

```tsx
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6M10 11v6M14 11v6"/></svg>
        {t('Удаление аккаунта')}
      </h3>
```

- [ ] **Step 4: DeviceSection — `<h2>`→`<h3>` and add a watch SVG**

Current (`src/components/settings/sections/DeviceSection.tsx:17`):

```tsx
      <h2 className="settings-section-title">{t('Устройство')}</h2>
```

Replace with:

```tsx
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6l.5-3h5l.5 3M9 18l.5 3h5l.5-3"/></svg>
        {t('Устройство')}
      </h3>
```

- [ ] **Step 5: Verify no emoji or `<h2>` remains in any settings header**

Run:

```bash
grep -rn "settings-section-title" src/components/settings/ | grep -E "🔒|✨|🗑|<h2"
```

Expected: **no output** (exit code 1). Every header is now `<h3>` with an SVG.

- [ ] **Step 6: Typecheck + lint**

Run:

```bash
npm run build && npm run lint
```

Expected: both pass. (`build` runs `tsc -b` which catches any malformed JSX.)

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/PrivacySettings.tsx src/components/settings/sections/AiConsentSection.tsx src/components/settings/sections/DeleteAccountSection.tsx src/components/settings/sections/DeviceSection.tsx
git commit -m "style(settings): replace emoji section-header icons with SVG"
```

---

## Task 2: Consolidate text-link buttons onto `.link-btn`

Remove the duplicate `.settings-edit-btn` (used only by AiBudgetSection) and drop PrivacySettings' borrowed `.btn-ghost` in favor of `.link-btn`. `.btn-ghost` itself is untouched (6 other screens use it).

**Files:**
- Modify: `src/components/settings/sections/AiBudgetSection.tsx:116`
- Modify: `src/components/settings/PrivacySettings.tsx:50`
- Modify: `src/index.css:1166` (delete `.settings-edit-btn` rule)

- [ ] **Step 1: AiBudgetSection — swap `settings-edit-btn` for `link-btn`**

Current (`src/components/settings/sections/AiBudgetSection.tsx:116`):

```tsx
            <button className="settings-edit-btn" onClick={() => { setEditVal(String(budget)); setEditing(true) }}>
```

Replace the class only (keep the `onClick` exactly):

```tsx
            <button className="link-btn" onClick={() => { setEditVal(String(budget)); setEditing(true) }}>
```

- [ ] **Step 2: PrivacySettings — swap `btn-ghost` + inline fontSize for `link-btn`**

Current (`src/components/settings/PrivacySettings.tsx:50-51`):

```tsx
          <button className="btn-ghost" style={{ fontSize: 13 }}
            onClick={() => { lock(); setUnlocked(false); setMsg(t('Заблокировано')) }}>
```

Replace with (drop the inline style, change the class):

```tsx
          <button className="link-btn"
            onClick={() => { lock(); setUnlocked(false); setMsg(t('Заблокировано')) }}>
```

- [ ] **Step 3: Delete the `.settings-edit-btn` CSS rule**

Current (`src/index.css:1166`):

```css
.settings-edit-btn { font-size: 12px; color: var(--accent); background: none; border: none; cursor: pointer; text-decoration: underline; padding: 0; }
```

Delete this entire line.

- [ ] **Step 4: Verify `.settings-edit-btn` is fully gone**

Run:

```bash
grep -rn "settings-edit-btn" src/
```

Expected: **no output** (exit code 1). No CSS rule and no JSX references the class anymore.

- [ ] **Step 5: Verify no Settings component uses `.btn-ghost` anymore**

Run:

```bash
grep -rn "btn-ghost" src/components/settings/
```

Expected: **no output** (exit code 1). `.btn-ghost` survives only in the 6 non-settings screens.

- [ ] **Step 6: Lint + build**

Run:

```bash
npm run lint && npm run build
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/sections/AiBudgetSection.tsx src/components/settings/PrivacySettings.tsx src/index.css
git commit -m "refactor(settings): unify text-link buttons on .link-btn"
```

---

## Task 3: Consolidate Settings inputs onto `.settings-input`

> **Scope note (corrected during execution):** the audit under-counted. ALL Settings `.log-input` call sites must move, not just two files — PrivacySettings (2), WorkoutScheduleSettings (2), TelegramSection (2), CalSyncSection (3), EnvironmentSection (1). The `.log-input` CSS definition itself stays untouched (Dashboard uses it). Verify with `grep -rn "log-input" src/components/settings/` → nothing, EXCEPT keep the CalSyncSection session-token input's inline `fontFamily: 'monospace', fontSize: 12` (that stays a monospace field). The steps below show the first two files; apply the identical class swap to the other three.

**Files:**
- Modify: `src/components/settings/PrivacySettings.tsx` (2 PIN inputs)
- Modify: `src/components/settings/WorkoutScheduleSettings.tsx` (2 day-row inputs)
- Modify: `src/components/settings/sections/TelegramSection.tsx` (2 reminder-time inputs)
- Modify: `src/components/settings/sections/CalSyncSection.tsx` (email, password, session-token)
- Modify: `src/components/settings/sections/EnvironmentSection.tsx` (city search input)

- [ ] **Step 1: PrivacySettings — both PIN inputs → `.settings-input`**

Current (`src/components/settings/PrivacySettings.tsx:39-40`):

```tsx
          <input className="log-input" type="password" inputMode="numeric" style={{ width: 140 }}
            placeholder={t('Текущий PIN')} value={current} onChange={e => setCurrent(e.target.value)} />
```

Replace with (keep the explicit width — these sit in a horizontal flex row, not a full-width column):

```tsx
          <input className="settings-input" type="password" inputMode="numeric" style={{ width: 140 }}
            placeholder={t('Текущий PIN')} value={current} onChange={e => setCurrent(e.target.value)} />
```

Current (`src/components/settings/PrivacySettings.tsx:42-45`):

```tsx
        <input className="log-input" type="password" inputMode="numeric" style={{ width: 140 }}
          placeholder={pinSet ? t('Новый PIN') : 'PIN'} value={next}
          onChange={e => setNext(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()} />
```

Replace with:

```tsx
        <input className="settings-input" type="password" inputMode="numeric" style={{ width: 140 }}
          placeholder={pinSet ? t('Новый PIN') : 'PIN'} value={next}
          onChange={e => setNext(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()} />
```

- [ ] **Step 2: WorkoutScheduleSettings — both day-row inputs → `.settings-input`**

Current (`src/components/settings/WorkoutScheduleSettings.tsx:88-92`):

```tsx
            <input
              type="time" value={entry.time} disabled={demo}
              onChange={e => patchDay(day, { time: e.target.value })}
              className="log-input" style={{ width: 100 }}
            />
```

Replace with:

```tsx
            <input
              type="time" value={entry.time} disabled={demo}
              onChange={e => patchDay(day, { time: e.target.value })}
              className="settings-input" style={{ width: 100 }}
            />
```

Current (`src/components/settings/WorkoutScheduleSettings.tsx:93-99`):

```tsx
            <input
              // Демо-расписание read-only, а его вид спорта — ключ словаря: переводим.
              type="text" value={demo ? t(entry.label ?? '') : (entry.label ?? '')} disabled={demo}
              placeholder={t('вид спорта (необязательно)')}
              onChange={e => patchDay(day, { label: e.target.value })}
              className="log-input" style={{ width: 180, marginLeft: 8 }}
            />
```

Replace with:

```tsx
            <input
              // Демо-расписание read-only, а его вид спорта — ключ словаря: переводим.
              type="text" value={demo ? t(entry.label ?? '') : (entry.label ?? '')} disabled={demo}
              placeholder={t('вид спорта (необязательно)')}
              onChange={e => patchDay(day, { label: e.target.value })}
              className="settings-input" style={{ width: 180, marginLeft: 8 }}
            />
```

- [ ] **Step 3: Verify no Settings component uses `.log-input` anymore**

Run:

```bash
grep -rn "log-input" src/components/settings/
```

Expected: **no output** (exit code 1). `.log-input` survives only in Dashboard/other screens.

- [ ] **Step 4: Lint + build**

Run:

```bash
npm run lint && npm run build
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/PrivacySettings.tsx src/components/settings/WorkoutScheduleSettings.tsx
git commit -m "refactor(settings): use .settings-input for PIN and workout inputs"
```

---

## Task 4: Apply the 4-step font-size scale to Settings CSS

Correct the ad-hoc px values so small text follows: body 14, meta 13, accent 20. Title (15) and body (14) anchors are already correct and unchanged.

> **Scope note (added during execution):** the named-CSS edits below are necessary but not sufficient for a uniform meta tier — ~22 inline `style={{ fontSize: 11|12 }}` meta/label/status declarations across the same section files also had to be bumped to 13 (a separate follow-up commit), keeping only the CalSyncSection session-token input at monospace 12. Without that sweep the meta tier stays mixed (12 vs 13). Verify with `grep -rn "fontSize: 1[12]\b" src/components/settings/ | grep -v test` → only the monospace token line remains.

**Files:**
- Modify: `src/index.css:1014` (`.link-btn` 12→13)
- Modify: `src/index.css:1149` (`.settings-archive-caret` 11→13)
- Modify: `src/index.css:1155` (`.settings-tokens-row` 12→13)
- Modify: `src/index.css:1165` (`.settings-budget-val` 18→20)
- Modify: `src/index.css:1168` (`.settings-budget-input` 15→14)

- [ ] **Step 1: `.link-btn` 12px → 13px (meta tier)**

Current (`src/index.css:1014`):

```css
.link-btn { background: none; border: none; padding: 0; color: var(--accent, #6c8fff); font: inherit; font-size: 12px; cursor: pointer; text-decoration: underline; }
```

Change `font-size: 12px` → `font-size: 13px`:

```css
.link-btn { background: none; border: none; padding: 0; color: var(--accent, #6c8fff); font: inherit; font-size: 13px; cursor: pointer; text-decoration: underline; }
```

- [ ] **Step 2: `.settings-archive-caret` 11px → 13px (meta tier)**

Current (`src/index.css:1149`):

```css
.settings-archive-caret { margin-left: auto; font-size: 11px; }
```

Change to:

```css
.settings-archive-caret { margin-left: auto; font-size: 13px; }
```

- [ ] **Step 3: `.settings-tokens-row` 12px → 13px (meta tier)**

Current (`src/index.css:1155`):

```css
.settings-tokens-row { font-size: 12px; margin-bottom: 16px; }
```

Change to:

```css
.settings-tokens-row { font-size: 13px; margin-bottom: 16px; }
```

- [ ] **Step 4: `.settings-budget-val` 18px → 20px (accent tier)**

Current (`src/index.css:1165`):

```css
.settings-budget-val { font-size: 18px; font-weight: 700; }
```

Change to:

```css
.settings-budget-val { font-size: 20px; font-weight: 700; }
```

- [ ] **Step 5: `.settings-budget-input` 15px → 14px (body tier)**

Current (`src/index.css:1168`):

```css
.settings-budget-input { width: 72px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface2); color: var(--text); font-size: 15px; }
```

Change `font-size: 15px` → `font-size: 14px`:

```css
.settings-budget-input { width: 72px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface2); color: var(--text); font-size: 14px; }
```

- [ ] **Step 6: Lint + build**

Run:

```bash
npm run lint && npm run build
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/index.css
git commit -m "style(settings): normalize small-text font sizes to 4-step scale"
```

---

## Task 5: Run the Settings test suite

No new tests — this pass changes markup/CSS, not behavior. Confirm existing Settings tests still pass, and fix any that literally asserted a removed class name.

**Files:**
- Read/verify: `src/components/settings/SettingsScreen.characterization.test.tsx`
- Read/verify: `src/components/settings/sections/*.test.tsx`

- [ ] **Step 1: Run all Settings tests**

Run:

```bash
npx vitest run src/components/settings/
```

Expected: all pass. The characterization test asserts `.settings-section` counts and `.is-archived` toggling (unaffected). Per-section tests assert behavior/data, not exact px or the removed class names.

- [ ] **Step 2: If any test fails on a removed class name, fix it**

Only if Step 1 shows a failure referencing `settings-edit-btn`, `log-input`, `btn-ghost`, or an emoji in a settings header: update that assertion to the new class/markup (e.g. `settings-edit-btn` → `link-btn`). If Step 1 is all green, skip this step.

Re-run after any fix:

```bash
npx vitest run src/components/settings/
```

Expected: all pass.

- [ ] **Step 3: Commit (only if Step 2 changed a test)**

```bash
git add src/components/settings/
git commit -m "test(settings): update assertions for consolidated classes"
```

---

## Task 6: Manual visual verification in demo mode

Confirm the screen reads as one system and nothing regressed, in both themes.

- [ ] **Step 1: Create the temp dev env file (if missing)**

`.env.local` is gitignored. If it doesn't exist, create it:

```bash
cat > .env.local <<'EOF'
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=test-anon-key
VITE_DEMO=1
EOF
```

- [ ] **Step 2: Start the dev server and open Settings**

Start the `tonus-dev` preview (via the launch config / `npm run dev`), navigate to the app, and open the Settings screen (gear icon in the top nav). Demo mode populates the screen without Supabase.

- [ ] **Step 3: Visually confirm the checklist**

Confirm all of:
- Every section header shows an 18×18 outline SVG icon (Privacy, AI-обработка, Удаление аккаунта, Устройство now match the rest — no emoji, no icon-less headers).
- The "Изменить" link in AI-расходы and "Заблокировать сейчас" in Приватность look identical to other text links (accent color, 13px, underlined).
- The PIN inputs (Приватность) and workout time/label inputs (Расписание тренировок) match the visual style of other Settings inputs (radius 10, slightly taller than before).
- The budget number ($5.00) reads as a clear accent (20px/700).
- No layout breakage: the PIN row still lays out horizontally; the workout day rows still align.

- [ ] **Step 4: Check dark theme**

Toggle the theme (theme button in top nav, or resize/colorScheme in the preview) to dark and re-scan the same checklist — icons use `currentColor` so they must follow the text color in both themes.

- [ ] **Step 5: Take a confirmation screenshot**

Capture the Settings screen (light and dark) as proof for the PR.

---

## Task 7: Open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/settings-visual-consistency
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "style(settings): unify section headers, links, inputs, and font scale" --body "$(cat <<'EOF'
## Summary
Visual consistency pass over the Settings screen (spec: `docs/superpowers/specs/2026-07-20-settings-visual-consistency-design.md`). No behavior changes.

- Section headers: 4 outliers (Privacy 🔒, AI-обработка ✨, Удаление 🗑 as emoji; Устройство as icon-less `<h2>`) converted to the same 18×18 outline-SVG `<h3>` the other 11 headers already use.
- Text links: removed the duplicate `.settings-edit-btn` and dropped PrivacySettings' borrowed `.btn-ghost`; both now use `.link-btn`.
- Inputs: PrivacySettings + WorkoutScheduleSettings moved off the Dashboard's `.log-input` onto Settings-native `.settings-input`.
- Font scale: normalized small-text sizes to body 14 / meta 13 / accent 20.

Shared classes (`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.log-input`) were **not** redefined — only Settings-local call sites and Settings-only CSS changed. DoctorReport and ConnectGuide untouched.

## Test plan
- [x] `npm run lint` (0 warnings) and `npm run build` green
- [x] `npx vitest run src/components/settings/` green
- [x] Manual visual check in demo mode, light + dark theme (screenshots below)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Attach the screenshots from Task 6 Step 5 to the PR description.**

---

## Self-review notes

- **Spec coverage:** §Design 1 (headers) → Task 1; §Design 2 (text links) → Task 2; §Design 3 (inputs) → Task 3; §Design 4 (font scale) → Task 4; §Testing → Tasks 5-6; §Rollout → Task 7. All covered.
- **Non-goals respected:** no task edits `.btn-primary`/`.btn-secondary`/`.btn-ghost`/`.log-input` definitions, `DoctorReport.tsx`, or `ConnectGuide`. `.btn-ghost` and `.log-input` are only removed from Settings *call sites*, verified by the grep steps (Task 2 Step 5, Task 3 Step 3).
- **Class-name consistency:** `.link-btn` is the single surviving text-link class (Tasks 1-2); `.settings-input` the single input class (Task 3); the font tiers in Task 4 match the spec's target table exactly.
