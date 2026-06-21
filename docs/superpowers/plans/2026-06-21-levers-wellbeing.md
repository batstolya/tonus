# Levers + Wellbeing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a subjective outcome (самочувствие 1–5) and a ranked "Что важнее всего" levers layer (impact × confidence × controllability, with 🟢🟡🔴 badges) on top of the existing research engine.

**Architecture:** Levers are a pure post-processing layer over the existing `computeFindings` output — no new statistics. Wellbeing is captured via inline buttons on the existing evening Telegram question, stored in a new `context_notes.wellbeing` column, and fed into the research engine (and AI context) as a new outcome alongside sleep / HRV / readiness (readiness reused from `scores.ts`). The ranked block lives atop the existing Research screen; the raw findings list becomes the drill-down.

**Tech Stack:** React 19 + TypeScript + Vite, Vitest (tests in `src/lib/*.test.ts`), Supabase Postgres + Deno edge functions. Migrations are standalone idempotent SQL files in `supabase/` applied via the Supabase SQL editor (or the `supabase` MCP).

**Reference spec:** `docs/superpowers/specs/2026-06-21-levers-wellbeing-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `supabase/wellbeing.sql` | DB migration | Create |
| `src/lib/research.ts` | Factor aggregation + findings | Modify (add `factorKey`/`outcomeKey` to `Finding`; add wellbeing + readiness outcomes) |
| `src/lib/research.test.ts` | Engine tests | Modify (assert new keys) |
| `src/lib/levers.ts` | Ranking layer: `computeLevers`, scoring, badges, experiment prefill | Create |
| `src/lib/levers.test.ts` | Levers logic tests | Create |
| `src/components/research/ResearchScreen.tsx` | Top "Что важнее всего" block + badges + CTA | Modify |
| `src/components/research/ExperimentsScreen.tsx` | Consume experiment prefill on mount | Modify |
| `src/App.tsx` | Pass `onNavigate` to ResearchScreen | Modify |
| `supabase/functions/send-reminders/index.ts` | Evening question gets 1–5 inline keyboard | Modify |
| `supabase/functions/telegram-bot/index.ts` | `wb:<date>:<score>` callback handler | Modify |
| `supabase/functions/_shared/healthContext.ts` | Wellbeing into AI context | Modify |

**Note on edge functions:** the Deno edge functions are not covered by `tsc -b`/Vitest. They are verified by code review + manual Telegram testing. Only `src/lib/*` logic is unit-tested (matches the repo's existing pattern — `research.test.ts` is the sole test file).

---

## Task 1: DB migration — `context_notes.wellbeing`

**Files:**
- Create: `supabase/wellbeing.sql`

`context_notes.note` is currently `NOT NULL` (see `supabase/phase5_chat.sql:34`). A wellbeing-only day (user taps a number without typing a note) would violate that, so we relax it. Existing rows are unaffected.

- [ ] **Step 1: Write the migration file**

Create `supabase/wellbeing.sql`:

```sql
-- Самочувствие 1–5 как субъективный исход дня (вводится из вечернего вопроса в Telegram).
alter table context_notes add column if not exists wellbeing smallint;
-- Разрешаем строку без текстовой заметки (день, где есть только оценка 1–5).
alter table context_notes alter column note drop not null;
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase SQL editor (paste the file), or via the `supabase` MCP `apply_migration` tool with name `wellbeing` and the SQL above.

Expected: no error; `context_notes` now has a nullable `wellbeing smallint` and a nullable `note`.

- [ ] **Step 3: Commit**

```bash
git add supabase/wellbeing.sql
git commit -m "feat(db): add context_notes.wellbeing, make note nullable"
```

---

## Task 2: Research engine — outcome keys + wellbeing/readiness outcomes

**Files:**
- Modify: `src/lib/research.ts`
- Test: `src/lib/research.test.ts`

Two changes: (a) tag event findings with stable `factorKey`/`outcomeKey` so the levers layer can classify without fragile label matching; (b) add `wellbeing` and `readiness` as outcome metrics in `loadResearchData`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/research.test.ts`:

```ts
describe('computeFindings — outcome keys', () => {
  // 12 дней: дни с кофе → самочувствие 2, без кофе → 4 (сильный эффект)
  const rows = Array.from({ length: 12 }, (_, i) => {
    const coffee = i % 2 === 0 ? 1 : 0
    return { date: `2026-06-${String(i + 1).padStart(2, '0')}`, ev_coffee: coffee, wellbeing: coffee ? 2 : 4 }
  })
  const data: ResearchData = {
    rows,
    eventKeys: [{ key: 'ev_coffee', label: 'Кофе (кол-во)' }],
    metricKeys: [{ key: 'wellbeing', label: 'Самочувствие', betterHigh: true }],
    concernKeys: [],
    envKeys: [],
  }

  it('помечает событийную находку factorKey и outcomeKey', () => {
    const f = computeFindings(data).find(x => x.a === 'Кофе (кол-во)' && x.b === 'Самочувствие')
    expect(f).toBeDefined()
    expect(f!.kind).toBe('event')
    expect(f!.factorKey).toBe('ev_coffee')
    expect(f!.outcomeKey).toBe('wellbeing')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/research.test.ts`
Expected: FAIL — `f!.factorKey` is `undefined` (fields don't exist yet).

- [ ] **Step 3: Add the new fields to the `Finding` type**

In `src/lib/research.ts`, in the `Finding` interface (after the `modifiable?` line ~20), add:

```ts
  factorKey?: string             // стабильный ключ фактора (для классификации рычагов)
  outcomeKey?: string            // стабильный ключ исхода
```

- [ ] **Step 4: Populate the keys in the event-effect branch**

In `computeFindings`, in the event-effect `out.push({ kind: 'event', ... })` call (~line 220), add `factorKey` and `outcomeKey`:

```ts
            out.push({
              kind: 'event', a: ev.label, b: m.label, n: withV.length + withoutV.length,
              withMean: mw, withoutMean: mo, delta, deltaPct: mo ? (delta / mo) * 100 : undefined,
              lag, direction: delta > 0 ? 'pos' : 'neg', strength: effect,
              factorKey: ev.key, outcomeKey: m.key,
            })
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/lib/research.test.ts`
Expected: PASS (all blocks, including the pre-existing среда tests).

- [ ] **Step 6: Add wellbeing + readiness outcomes to `loadResearchData`**

In `src/lib/research.ts`:

Add the import at the top (after the existing imports):

```ts
import { computeDailyScores } from './scores'
```

In `loadResearchData`, add `context_notes` to the parallel fetch. Change the `Promise.all([...])` destructuring to include a new result, and add the query:

```ts
  const [intakeRes, supRes, logRes, concernRes, concernLogRes, envRes, noteRes] = await Promise.all([
    supabase.from('intake_events').select('ts, type').eq('user_id', userId).gte('ts', `${sinceStr}T00:00:00Z`),
    supabase.from('supplements').select('id, name').eq('user_id', userId).eq('active', true),
    supabase.from('supplement_logs').select('supplement_id, date, taken').eq('user_id', userId).gte('date', sinceStr).eq('taken', true),
    supabase.from('health_concerns').select('id, name').eq('user_id', userId),
    supabase.from('concern_logs').select('concern_id, date, severity').eq('user_id', userId).gte('date', sinceStr),
    supabase.from('environment_daily').select('date, temp_c, pressure_hpa, daylight_minutes, air_quality, pollen').eq('user_id', userId).gte('date', sinceStr),
    supabase.from('context_notes').select('date, wellbeing').eq('user_id', userId).gte('date', sinceStr),
  ])
```

After the environment block (after `const envKeys = ...`, ~line 145), add wellbeing + readiness as extra outcome columns and keys:

```ts
  // самочувствие 1–5 (субъективный исход) из context_notes
  for (const n of noteRes.data ?? []) {
    if (typeof (n as any).wellbeing === 'number') ensure(n.date as string)['wellbeing'] = (n as any).wellbeing
  }
  // готовность (композит) per-day — переиспользуем канонический расчёт
  for (const s of computeDailyScores(daily)) {
    if (s.readiness != null && s.date >= sinceStr) ensure(s.date)['readiness'] = s.readiness
  }
  const extraOutcomes: { key: string; label: string; betterHigh: boolean }[] = []
  if ([...byDate.values()].some(r => typeof r['wellbeing'] === 'number')) extraOutcomes.push({ key: 'wellbeing', label: 'Самочувствие', betterHigh: true })
  if ([...byDate.values()].some(r => typeof r['readiness'] === 'number')) extraOutcomes.push({ key: 'readiness', label: 'Готовность', betterHigh: true })
```

Then change the returned `metricKeys` to append the extra outcomes:

```ts
  return { rows, eventKeys, metricKeys: [...METRICS.map(m => ({ key: m.key as string, label: m.label, betterHigh: m.betterHigh })), ...extraOutcomes], concernKeys, envKeys }
```

- [ ] **Step 7: Verify the build compiles**

Run: `npm run build`
Expected: PASS (no TypeScript errors).

- [ ] **Step 8: Commit**

```bash
git add src/lib/research.ts src/lib/research.test.ts
git commit -m "feat(research): tag findings with factor/outcome keys; add wellbeing + readiness outcomes"
```

---

## Task 3: Levers module — scoring, badges, prefill

**Files:**
- Create: `src/lib/levers.ts`
- Test: `src/lib/levers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/levers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeLevers, confidenceBadge, buildExperimentPrefill } from './levers'
import type { Finding } from './research'

const coffee: Finding = {
  kind: 'event', a: 'Кофе (кол-во)', b: 'Самочувствие', n: 28,
  withMean: 2, withoutMean: 4, delta: -2, deltaPct: -50, lag: 0,
  direction: 'neg', strength: 1.0, factorKey: 'ev_coffee', outcomeKey: 'wellbeing',
}
const illness: Finding = {
  kind: 'event', a: 'Болезнь (день)', b: 'HRV', n: 10,
  delta: -5, direction: 'neg', strength: 0.9, factorKey: 'ev_illness', outcomeKey: 'hrv',
}
const env: Finding = {
  kind: 'corr', a: 'Погода: давление', b: 'HRV', n: 10, r: -0.5,
  direction: 'neg', strength: 0.5, modifiable: false,
}
const coffeeSteps: Finding = {
  kind: 'event', a: 'Кофе (кол-во)', b: 'Шаги', n: 14,
  delta: 500, direction: 'pos', strength: 0.6, factorKey: 'ev_coffee', outcomeKey: 'steps',
}

describe('computeLevers', () => {
  it('включает управляемый рычаг на отслеживаемый исход', () => {
    const { levers } = computeLevers([coffee])
    expect(levers).toHaveLength(1)
    expect(levers[0].factorLabel).toBe('Кофе (кол-во)')
    expect(levers[0].outcomeLabel).toBe('Самочувствие')
    expect(levers[0].impactText).toBe('-50%')
  })

  it('исключает неуправляемые факторы (болезнь) и относит среду в context', () => {
    const { levers, context } = computeLevers([coffee, illness, env])
    expect(levers.some(l => l.factorLabel === 'Болезнь (день)')).toBe(false)
    expect(levers.some(l => l.factorLabel === 'Погода: давление')).toBe(false)
    expect(context).toContain(env)
  })

  it('исключает исходы вне набора (Шаги)', () => {
    const { levers } = computeLevers([coffeeSteps])
    expect(levers).toHaveLength(0)
  })

  it('сортирует по убыванию score и обрезает до 5', () => {
    const many = Array.from({ length: 8 }, (_, i): Finding => ({
      ...coffee, a: `F${i}`, strength: 0.5 + i * 0.1,
    }))
    const { levers } = computeLevers(many)
    expect(levers).toHaveLength(5)
    for (let i = 1; i < levers.length; i++) expect(levers[i - 1].score).toBeGreaterThanOrEqual(levers[i].score)
  })

  it('бейдж: сильный+много данных = high, у порога = low', () => {
    expect(confidenceBadge({ ...coffee, n: 28, strength: 1.0 })).toBe('high')
    expect(confidenceBadge({ ...coffee, n: 7, strength: 0.5 })).toBe('low')
  })
})

describe('buildExperimentPrefill', () => {
  it('маппит исход в валидную метрику эксперимента, иначе hrv', () => {
    const [lever] = computeLevers([{ ...coffee, outcomeKey: 'sleepHours', b: 'Длительность сна' }]).levers
    expect(buildExperimentPrefill(lever).target_metric).toBe('sleepHours')
    const [wb] = computeLevers([coffee]).levers
    expect(buildExperimentPrefill(wb).target_metric).toBe('hrv') // wellbeing не измеряется экспериментом → дефолт
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/levers.test.ts`
Expected: FAIL — `Cannot find module './levers'`.

- [ ] **Step 3: Implement `src/lib/levers.ts`**

Create `src/lib/levers.ts`:

```ts
import type { Finding } from './research'

export interface Lever {
  factorLabel: string
  outcomeLabel: string
  direction: 'pos' | 'neg'
  impactText: string          // «-22%» / «+0.5»
  score: number
  confidence: number
  badge: 'high' | 'medium' | 'low'
  controllability: number
  finding: Finding
}

// Исходы, против которых имеет смысл ранжировать рычаги.
const OUTCOME_KEYS = new Set(['wellbeing', 'sleepHours', 'hrv', 'readiness'])

// Управляемость фактора (вес в скоре). sup_* — приём препарата, управляем.
const CONTROLLABILITY: Record<string, number> = {
  ev_coffee: 1, ev_alcohol: 1, ev_late_meal: 1, ev_workout: 1, ev_stress: 0.5,
}
function controllabilityOf(factorKey?: string): number {
  if (!factorKey) return 0
  if (factorKey.startsWith('sup_')) return 1
  return CONTROLLABILITY[factorKey] ?? 0
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

function impactNorm(f: Finding): number {
  return f.kind === 'event' ? Math.min(f.strength / 1.5, 1) : Math.min(Math.abs(f.r ?? f.strength), 1)
}

function confidenceOf(f: Finding): number {
  const thr = f.kind === 'event' ? 0.5 : 0.3
  const strong = f.kind === 'event' ? 1.0 : 0.6
  const nPart = clamp01(f.n / 28)
  const ePart = clamp01((f.strength - thr) / (strong - thr))
  return 0.6 * nPart + 0.4 * ePart
}

export function confidenceBadge(f: Finding): 'high' | 'medium' | 'low' {
  const c = confidenceOf(f)
  return c >= 0.66 ? 'high' : c >= 0.33 ? 'medium' : 'low'
}

function impactText(f: Finding): string {
  if (f.kind === 'corr') return `r=${(f.r ?? 0).toFixed(2)}`
  if (f.deltaPct != null && Math.abs(f.deltaPct) >= 1) {
    return `${f.deltaPct > 0 ? '+' : ''}${Math.round(f.deltaPct)}%`
  }
  const d = f.delta ?? 0
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}`
}

export function computeLevers(findings: Finding[]): { levers: Lever[]; context: Finding[] } {
  const context = findings.filter(f => f.modifiable === false)
  const levers: Lever[] = []
  for (const f of findings) {
    if (f.kind !== 'event') continue
    if (!f.outcomeKey || !OUTCOME_KEYS.has(f.outcomeKey)) continue
    const controllability = controllabilityOf(f.factorKey)
    if (controllability <= 0) continue
    const confidence = confidenceOf(f)
    levers.push({
      factorLabel: f.a,
      outcomeLabel: f.b,
      direction: f.direction,
      impactText: impactText(f),
      score: impactNorm(f) * confidence * controllability,
      confidence,
      badge: confidenceBadge(f),
      controllability,
      finding: f,
    })
  }
  levers.sort((a, b) => b.score - a.score)
  return { levers: levers.slice(0, 5), context }
}

// ── Привязка к экспериментам ──────────────────────────────────────────────────
export interface ExperimentPrefill { hypothesis: string; change_rule: string; target_metric: string }
export const EXPERIMENT_PREFILL_KEY = 'tonus:experiment-prefill'

// Исход рычага → валидная метрика эксперимента (DailyMetrics). wellbeing/readiness
// эксперимент пока не измеряет → дефолт hrv (пользователь правит в форме).
const OUTCOME_TO_METRIC: Record<string, string> = { hrv: 'hrv', sleepHours: 'sleepHours' }

export function buildExperimentPrefill(l: Lever): ExperimentPrefill {
  return {
    hypothesis: `«${l.factorLabel}» влияет на «${l.outcomeLabel}» (${l.impactText})`,
    change_rule: `Сократить/убрать: ${l.factorLabel}`,
    target_metric: (l.finding.outcomeKey && OUTCOME_TO_METRIC[l.finding.outcomeKey]) || 'hrv',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/levers.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: PASS (levers + research).

- [ ] **Step 6: Commit**

```bash
git add src/lib/levers.ts src/lib/levers.test.ts
git commit -m "feat(levers): ranking layer (impact × confidence × controllability) + badges + experiment prefill"
```

---

## Task 4: Research screen — "Что важнее всего" block + badges + CTA

**Files:**
- Modify: `src/components/research/ResearchScreen.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Pass `onNavigate` from App to ResearchScreen**

In `src/App.tsx` (~line 409), change:

```tsx
        ) : state.view === 'research' ? (
          <ResearchScreen user={user} daily={state.daily} onNavigate={setView} />
```

(`setView` is the existing view setter used elsewhere in App, e.g. Dashboard `onNavigate={setView}`.)

- [ ] **Step 2: Add the prop, imports, and badge helper to ResearchScreen**

In `src/components/research/ResearchScreen.tsx`:

Add imports after the existing `research` import:

```tsx
import { computeLevers, confidenceBadge, buildExperimentPrefill, EXPERIMENT_PREFILL_KEY, type Lever } from '../../lib/levers'
```

Change the `Props` interface:

```tsx
interface Props { user: User; daily: DailyMetrics[]; onNavigate?: (view: string) => void }
```

Add a module-level badge renderer above `FindingRow`:

```tsx
const BADGE: Record<'high' | 'medium' | 'low', { icon: string; title: string }> = {
  high: { icon: '🟢', title: 'высокая уверенность' },
  medium: { icon: '🟡', title: 'средняя уверенность' },
  low: { icon: '🔴', title: 'мало данных' },
}
```

- [ ] **Step 3: Show a badge on each finding row**

In `FindingRow`, add the badge next to `n=` inside the return:

```tsx
      <span className="research-finding-n">
        {(() => { const b = BADGE[confidenceBadge(f)]; return <span title={b.title} style={{ marginRight: 6 }}>{b.icon}</span> })()}
        n={f.n}
      </span>
```

- [ ] **Step 4: Add the levers block component**

In `src/components/research/ResearchScreen.tsx`, add above the `ResearchScreen` function:

```tsx
function LeversBlock({ levers, onTry }: { levers: Lever[]; onTry: (l: Lever) => void }) {
  const { t } = useT()
  if (!levers.length) return null
  return (
    <div className="research-findings" style={{ marginBottom: 20 }}>
      <h3 className="goals-section-title">{t('Что важнее всего')}</h3>
      {levers.map((l, i) => {
        const b = BADGE[l.badge]
        return (
          <div key={i} className="research-finding">
            <div className="research-finding-main">
              <span className="research-finding-pair">
                {l.factorLabel} → {l.outcomeLabel}
              </span>
              <span className="research-finding-metric" style={{ color: l.direction === 'neg' ? 'var(--red)' : 'var(--green)' }}>
                {l.impactText}
              </span>
            </div>
            <span title={b.title} style={{ marginRight: 8 }}>{b.icon}</span>
            <button className="preset" onClick={() => onTry(l)}>{t('Проверить экспериментом')}</button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Compute levers from the active run and render the block + wire the CTA**

Inside `ResearchScreen`, after `const active = runs.find(...)` (~line 59), add:

```tsx
  const levers = active ? computeLevers(active.findings).levers : []

  function tryExperiment(l: Lever) {
    sessionStorage.setItem(EXPERIMENT_PREFILL_KEY, JSON.stringify(buildExperimentPrefill(l)))
    onNavigate?.('experiments')
  }
```

In the `{active && ( <> ... </> )}` block, render `LeversBlock` as the first child (before `active.reply`):

```tsx
      {active && (
        <>
          <LeversBlock levers={levers} onTry={tryExperiment} />
          {active.reply && (
```

- [ ] **Step 6: Verify the build compiles**

Run: `npm run build`
Expected: PASS (no TypeScript errors).

- [ ] **Step 7: Manual check**

Run: `npm run dev`, open the app → Коуч → Исследования, run an analysis on a period with logged behavior. Expected: a "Что важнее всего" block appears above the findings with ranked levers, 🟢/🟡/🔴 badges, and a "Проверить экспериментом" button; existing findings below now also show a badge.

- [ ] **Step 8: Commit**

```bash
git add src/components/research/ResearchScreen.tsx src/App.tsx
git commit -m "feat(research): 'Что важнее всего' ranked levers block + confidence badges + experiment CTA"
```

---

## Task 5: Experiments screen — consume the prefill

**Files:**
- Modify: `src/components/research/ExperimentsScreen.tsx`

- [ ] **Step 1: Import the prefill contract**

In `src/components/research/ExperimentsScreen.tsx`, add near the other lib imports:

```tsx
import { EXPERIMENT_PREFILL_KEY, type ExperimentPrefill } from '../../lib/levers'
```

- [ ] **Step 2: Read the prefill on mount, open the form**

In `ExperimentsScreen`, add a `useEffect` after the existing experiment-loading `useEffect` (the `form` state is defined at ~line 181 with fields `hypothesis`, `change_rule`, `target_metric`):

```tsx
  useEffect(() => {
    const raw = sessionStorage.getItem(EXPERIMENT_PREFILL_KEY)
    if (!raw) return
    sessionStorage.removeItem(EXPERIMENT_PREFILL_KEY)
    try {
      const p = JSON.parse(raw) as ExperimentPrefill
      setForm(prev => ({
        ...prev,
        hypothesis: p.hypothesis,
        change_rule: p.change_rule,
        target_metric: isValidMetric(p.target_metric) ? p.target_metric : prev.target_metric,
      }))
      setShowForm(true)
    } catch { /* битый prefill — игнорируем */ }
  }, [])
```

(`isValidMetric`, `setForm`, and `setShowForm` already exist in this file.)

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. In Исследования, click "Проверить экспериментом" on a lever. Expected: the app switches to Эксперименты, the create form is open and prefilled (hypothesis + change rule + a valid target metric).

- [ ] **Step 5: Commit**

```bash
git add src/components/research/ExperimentsScreen.tsx
git commit -m "feat(experiments): consume lever prefill to seed a new n=1 experiment"
```

---

## Task 6: Telegram — wellbeing 1–5 on the evening question

**Files:**
- Modify: `supabase/functions/send-reminders/index.ts`
- Modify: `supabase/functions/telegram-bot/index.ts`

- [ ] **Step 1: Attach a 1–5 inline keyboard to the evening question**

In `supabase/functions/send-reminders/index.ts`, in the evening-question loop (~line 156), replace:

```ts
    const q = EVENING_QUESTIONS[Math.floor(Math.random() * EVENING_QUESTIONS.length)]
    await tgSend(link.telegram_chat_id, q)
```

with:

```ts
    const q = EVENING_QUESTIONS[Math.floor(Math.random() * EVENING_QUESTIONS.length)]
    const wbKeyboard = { inline_keyboard: [[1, 2, 3, 4, 5].map(n => ({ text: String(n), callback_data: `wb:${dateStr}:${n}` }))] }
    await tgSend(link.telegram_chat_id, `${q}\n\nОцени самочувствие 1–5:`, wbKeyboard)
```

(`tgSend(chatId, text, replyMarkup?)` — the 3rd arg is the reply_markup object, per the signature at `send-reminders/index.ts:8`. `dateStr` is already in scope from `localNow`.)

- [ ] **Step 2: Handle the `wb:` callback in the bot**

In `supabase/functions/telegram-bot/index.ts`, in the `callback_query` handler, add a branch after the `data === 'menu'` chain (e.g. after the `disconnect` branch, ~line 652):

```ts
    } else if (data.startsWith('wb:')) {
      const [, date, scoreStr] = data.split(':')
      const score = Number(scoreStr)
      if (date && score >= 1 && score <= 5) {
        await supabase.from('context_notes').upsert(
          { user_id: userId, date, wellbeing: score, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,date' }
        )
        await tgSend(chatId, `🙂 Записал самочувствие: ${score}/5 за ${date}.`)
      }
```

The upsert sends only `wellbeing` (+ keys), so it never clobbers an existing `note`; the relaxed NOT NULL (Task 1) lets a wellbeing-only row insert. The free-text note path (`awaiting_note_date`) is unchanged — text and rating are independent.

- [ ] **Step 3: Deploy the two functions**

Deploy via the `supabase` MCP `deploy_edge_function` (or `supabase functions deploy`). Deploy `send-reminders` and `telegram-bot`. Keep their `verify_jwt=false` (already pinned in `supabase/config.toml`).

- [ ] **Step 4: Manual check**

Trigger the evening question (or wait for the scheduled time). Expected: the message shows 1–5 buttons; tapping one replies "🙂 Записал самочувствие: N/5 …" and writes `context_notes.wellbeing` for that date; typing a free-text reply still lands in the note.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-reminders/index.ts supabase/functions/telegram-bot/index.ts
git commit -m "feat(bot): wellbeing 1-5 inline buttons on evening question + wb callback handler"
```

---

## Task 7: AI context — include wellbeing

**Files:**
- Modify: `supabase/functions/_shared/healthContext.ts`

- [ ] **Step 1: Select wellbeing with the notes**

In `supabase/functions/_shared/healthContext.ts`, change the `context_notes` select (~line 61) from:

```ts
    supabase.from('context_notes')
      .select('date, note')
```

to:

```ts
    supabase.from('context_notes')
      .select('date, note, wellbeing')
```

- [ ] **Step 2: Render wellbeing in the AI text**

In `healthContextToText`, in the notes block (~line 193-195), replace:

```ts
  if (ctx.notes.length) {
```

…the loop body `for (const n of ctx.notes) parts.push(`${n.date}: ${n.note}`)` with a version that guards null notes and adds the rating:

```ts
    for (const n of ctx.notes) {
      const wb = typeof n.wellbeing === 'number' ? ` [самочувствие ${n.wellbeing}/5]` : ''
      const text = n.note ? `: ${n.note}` : ''
      if (text || wb) parts.push(`${n.date}${text}${wb}`)
    }
```

(`ctx.notes` is typed `Record<string, any>[]`, so `n.wellbeing` is allowed.)

- [ ] **Step 3: Deploy the consumers**

Deploy the edge functions that import `healthContext` (at minimum `chat-health` and `telegram-bot`) via the `supabase` MCP `deploy_edge_function` (or `supabase functions deploy`).

- [ ] **Step 4: Manual check**

Ask the AI chat (web or Telegram) a question for a period that includes a wellbeing rating. Expected: the model can reference subjective wellbeing (no errors; null-note days don't render as "null").

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/healthContext.ts
git commit -m "feat(ai): include daily wellbeing 1-5 in AI health context"
```

---

## Self-Review

**Spec coverage:**
- Wellbeing capture via evening TG question → Task 6. ✅
- Storage `context_notes.wellbeing` → Task 1. ✅
- Wellbeing into research outcomes + AI context → Task 2 + Task 7. ✅
- Levers engine (impact × confidence × controllability, env excluded, outcomes = wellbeing/sleep/HRV/readiness) → Task 3. ✅
- Confidence badges 🟢🟡🔴 on levers and findings → Task 3 (logic) + Task 4 (render). ✅
- "Что важнее всего" block atop Research, findings as drill-down → Task 4. ✅
- Experiment CTA / prefill → Task 3 (`buildExperimentPrefill`) + Task 4 (CTA) + Task 5 (consume). ✅
- Non-modifiable context (env) surfaced separately → `computeLevers` returns `context`; Task 3 covers the data. (Rendering the env context list is a thin follow-up; the levers block already excludes env, and env findings still render in the drill-down with the 🌍 marker that exists today — no regression.)

**Scope note / deviation from spec:** the spec mentioned "order `suggest-experiments` suggestions by score." That would require fuzzy-matching AI-generated suggestions back to levers — fragile and low value. Instead, prioritization lives entirely in the ranked levers block (the entry point), and the CTA seeds a concrete experiment from a lever. The AI "Подобрать" suggestions in ExperimentsScreen are unchanged. This honors the intent (ranked, actionable levers feeding experiments) without the fragile reorder.

**Placeholder scan:** no TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `Finding.factorKey`/`outcomeKey` defined in Task 2, consumed in Task 3. `Lever`, `computeLevers`, `confidenceBadge`, `buildExperimentPrefill`, `ExperimentPrefill`, `EXPERIMENT_PREFILL_KEY` defined in Task 3, consumed in Tasks 4–5 with matching names. `onNavigate` added to `Props` in Task 4 and passed from App in the same task. ✅

## Open items (phase 2, not in this plan)
- Sleep onset / latency as an outcome (needs Apple Health data spike).
- Wellbeing as a *measurable experiment outcome* (extend the experiment engine to read `context_notes.wellbeing`); today a wellbeing lever's experiment defaults to an HRV target.
- Web capture of wellbeing (currently Telegram-only).
- Rendering a dedicated 🌍 "неуправляемый контекст" list from `computeLevers().context` if the drill-down proves insufficient.
