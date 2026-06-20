# cal.com Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cal.com bookings sync into Tonus automatically once a day with zero manual action after a one-time email+password setup.

**Architecture:** A new `sync-cal` Deno edge function auto-logs into self-hosted cal.com via NextAuth credentials (no API key — the instance has no REST API), pulls bookings over the internal tRPC endpoint (reusing `fetch-cal` logic), and upserts them into the existing `calendar_events` table. A daily `pg_cron` job triggers it; the Settings UI can also trigger it on demand. The cal.com password is stored AES-GCM encrypted (key only in the function env).

**Tech Stack:** Supabase (Postgres + pg_cron/pg_net + Deno Edge Functions), React + TypeScript (Vite), Web Crypto (AES-GCM).

**Spec:** `docs/superpowers/specs/2026-06-20-cal-auto-sync-design.md`

---

## File Structure

- Create `supabase/cal-sync.sql` — `cal_sync` table + RLS.
- Create `supabase/functions/sync-cal/index.ts` — login + decrypt + fetch + upsert; entry for UI (JWT) and cron (secret header).
- Create `supabase/cal-cron.sql` — daily pg_cron job calling `sync-cal`.
- Create `scripts/test-cal-normalize.mjs` — Node test for the booking→row normalization (the only purely-unit-testable piece; Deno I/O is verified live).
- Modify `src/components/settings/SettingsScreen.tsx` — replace token field with email/password + auto-sync toggle + "sync now" + status.
- Modify `src/lib/translations.ts` — uk/en for new RU strings.

**Decisions locked from spec:** daily cron; no 2FA; password AES-GCM encrypted with env key `CAL_ENC_KEY`; old manual token field kept as fallback; `sync-cal` deployed `--no-verify-jwt` (does its own auth: user JWT for UI, `x-cron-secret` for cron), mirroring `ingest-health`.

---

## Task 1: `cal_sync` table

**Files:**
- Create: `supabase/cal-sync.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Per-user cal.com auto-sync config + encrypted credentials.
create table if not exists cal_sync (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  cal_email        text not null,
  cal_password_enc text not null,            -- base64( iv(12B) ‖ AES-GCM ciphertext )
  enabled          boolean not null default true,
  last_sync_at     timestamptz,
  last_status      text,
  event_count      int,
  updated_at       timestamptz not null default now()
);

alter table cal_sync enable row level security;

-- Owner may READ their row (UI selects only non-secret columns; never cal_password_enc).
drop policy if exists "cal_sync owner read" on cal_sync;
create policy "cal_sync owner read" on cal_sync
  for select using (auth.uid() = user_id);

-- No client insert/update/delete policy on purpose: all writes go through the
-- sync-cal edge function using the service role (bypasses RLS).
```

- [ ] **Step 2: Apply to the database**

Run the SQL via Supabase MCP `apply_migration` (name: `cal_sync`) OR paste into Supabase SQL Editor. Verify:

Run (Supabase SQL Editor): `select * from cal_sync limit 1;`
Expected: empty result, no error (table exists).

- [ ] **Step 3: Commit**

```bash
git add supabase/cal-sync.sql
git commit -m "feat(cal): cal_sync table for encrypted cal.com credentials"
```

---

## Task 2: Booking→row normalization (pure function + test)

This is the one piece testable without Deno/network. Extract it so both the edge function and the test share the exact logic.

**Files:**
- Create: `scripts/test-cal-normalize.mjs`

- [ ] **Step 1: Write the failing test**

```js
// scripts/test-cal-normalize.mjs
// Mirrors the normalizeBookings() logic in supabase/functions/sync-cal/index.ts.
// Keep the two in sync (the edge function can't run under Node).

function normalizeBookings(bookings, userId) {
  const byUid = new Map() // dedup by uid (cal.com can repeat across pages)
  for (const b of bookings) {
    if (!b?.uid || !b?.startTime || !b?.endTime) continue
    byUid.set(b.uid, {
      user_id: userId,
      uid: b.uid,
      title: b.title ?? b.eventType?.title ?? '(без названия)',
      start_ts: new Date(b.startTime).toISOString(),
      end_ts: new Date(b.endTime).toISOString(),
      description: b.description ?? null,
      location: b.location ?? null,
      source: 'cal',
    })
  }
  return [...byUid.values()]
}

let pass = true
const ok = (n, c, got) => { console.log(`${c ? '✅' : '❌'} ${n}`, c ? '' : JSON.stringify(got)); if (!c) pass = false }

const rows = normalizeBookings([
  { uid: 'a', title: 'Call', startTime: '2026-06-18T10:00:00Z', endTime: '2026-06-18T10:30:00Z' },
  { uid: 'a', title: 'Call dup', startTime: '2026-06-18T10:00:00Z', endTime: '2026-06-18T10:30:00Z' }, // dup uid
  { uid: 'b', eventType: { title: 'Intro' }, startTime: '2026-06-19T09:00:00Z', endTime: '2026-06-19T09:15:00Z', location: 'Zoom' },
  { uid: 'c', startTime: null, endTime: '2026-06-20T09:00:00Z' }, // bad → skipped
], 'u1')

ok('dedup by uid → 2 rows', rows.length === 2, rows)
ok('title fallback to eventType.title', rows.find(r => r.uid === 'b')?.title === 'Intro', rows)
ok('uid a kept (first/last write) with ISO ts', rows.find(r => r.uid === 'a')?.start_ts === '2026-06-18T10:00:00.000Z', rows)
ok('location passthrough', rows.find(r => r.uid === 'b')?.location === 'Zoom', rows)
ok('user_id set', rows.every(r => r.user_id === 'u1'), rows)
ok('missing startTime skipped (no uid c)', !rows.find(r => r.uid === 'c'), rows)

console.log(pass ? '\nALL PASS' : '\nFAIL')
process.exit(pass ? 0 : 1)
```

- [ ] **Step 2: Run it to verify it passes** (the logic is embedded in the test itself, so this both defines and checks the contract)

Run: `node scripts/test-cal-normalize.mjs`
Expected: all ✅, "ALL PASS", exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-cal-normalize.mjs
git commit -m "test(cal): normalization contract for booking→calendar_events"
```

---

## Task 3: `sync-cal` edge function

**Files:**
- Create: `supabase/functions/sync-cal/index.ts`

- [ ] **Step 1: Write the function**

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }
const CAL_BASE = 'https://cal.beskarstaff.com'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ENC_KEY_B64 = Deno.env.get('CAL_ENC_KEY') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

// ---- AES-GCM encrypt/decrypt (key only in env, never in DB) ----
async function aesKey() {
  const raw = Uint8Array.from(atob(ENC_KEY_B64), c => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}
async function encrypt(plain: string): Promise<string> {
  const key = await aesKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)))
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length)
  return btoa(String.fromCharCode(...out))
}
async function decrypt(b64: string): Promise<string> {
  const key = await aesKey()
  const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12))
  return new TextDecoder().decode(pt)
}

// ---- cal.com NextAuth credentials login → fresh session token ----
async function calLogin(email: string, password: string): Promise<string> {
  const csrfRes = await fetch(`${CAL_BASE}/api/auth/csrf`)
  const { csrfToken } = await csrfRes.json()
  const csrfCookie = csrfRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
  const body = new URLSearchParams({ csrfToken, email, password, json: 'true', callbackUrl: CAL_BASE })
  const res = await fetch(`${CAL_BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: csrfCookie },
    body: body.toString(),
    redirect: 'manual',
  })
  const token = res.headers.getSetCookie()
    .map(c => c.match(/__Secure-next-auth\.session-token=([^;]+)/)?.[1])
    .find(Boolean)
  if (!token) throw new Error('Неверный логин или пароль (или включена 2FA)')
  return token
}

// ---- fetch all past bookings via tRPC (same as fetch-cal) ----
async function fetchBookings(sessionToken: string): Promise<any[]> {
  const all: any[] = []
  let offset = 0
  const limit = 100
  while (true) {
    const input = encodeURIComponent(JSON.stringify({
      '0': { json: { limit, offset, filters: {
        status: 'past', eventTypeIds: null, teamIds: null, userIds: null,
        attendeeName: null, attendeeEmail: null, bookingUid: null,
        afterStartDate: null, beforeEndDate: null,
      } }, meta: { values: {
        'filters.eventTypeIds': ['undefined'], 'filters.teamIds': ['undefined'],
        'filters.userIds': ['undefined'], 'filters.attendeeName': ['undefined'],
        'filters.attendeeEmail': ['undefined'], 'filters.bookingUid': ['undefined'],
        'filters.afterStartDate': ['undefined'], 'filters.beforeEndDate': ['undefined'],
      } } },
    }))
    const r = await fetch(`${CAL_BASE}/api/trpc/bookings/get?batch=1&input=${input}`, {
      headers: { cookie: `__Secure-next-auth.session-token=${sessionToken}` },
    })
    if (!r.ok) throw new Error(`cal.com tRPC error: ${r.status}`)
    const d = await r.json()
    const bookings = d[0]?.result?.data?.json?.bookings ?? []
    all.push(...bookings)
    if (bookings.length < limit) break
    offset += limit
  }
  return all
}

// ---- normalize (keep in sync with scripts/test-cal-normalize.mjs) ----
function normalizeBookings(bookings: any[], userId: string) {
  const byUid = new Map<string, any>()
  for (const b of bookings) {
    if (!b?.uid || !b?.startTime || !b?.endTime) continue
    byUid.set(b.uid, {
      user_id: userId, uid: b.uid,
      title: b.title ?? b.eventType?.title ?? '(без названия)',
      start_ts: new Date(b.startTime).toISOString(),
      end_ts: new Date(b.endTime).toISOString(),
      description: b.description ?? null, location: b.location ?? null, source: 'cal',
    })
  }
  return [...byUid.values()]
}

async function syncOne(admin: any, row: { user_id: string; cal_email: string; cal_password_enc: string }) {
  let status = 'ok'; let count = 0
  try {
    const password = await decrypt(row.cal_password_enc)
    const token = await calLogin(row.cal_email, password)
    const bookings = await fetchBookings(token)
    const rows = normalizeBookings(bookings, row.user_id)
    count = rows.length
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await admin.from('calendar_events').upsert(rows.slice(i, i + 200), { onConflict: 'user_id,uid' })
      if (error) throw new Error(`calendar_events upsert: ${error.message}`)
    }
  } catch (e: any) {
    status = e.message ?? 'Ошибка'
  }
  await admin.from('cal_sync').update({
    last_sync_at: new Date().toISOString(), last_status: status, event_count: count,
  }).eq('user_id', row.user_id)
  return { status, count }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // ---- CRON path: secret header, sync every enabled user ----
    if (CRON_SECRET && req.headers.get('x-cron-secret') === CRON_SECRET) {
      const { data: rows } = await admin.from('cal_sync').select('user_id, cal_email, cal_password_enc').eq('enabled', true)
      const results = []
      for (const row of rows ?? []) results.push(await syncOne(admin, row))
      return new Response(JSON.stringify({ ran: results.length, results }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // ---- UI path: require user JWT ----
    const authHeader = req.headers.get('Authorization') ?? ''
    const { data: { user } } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })

    const bodyText = await req.text()
    const body = bodyText ? JSON.parse(bodyText) : {}

    // Optional: save/update credentials (and enabled flag) before syncing.
    if (body.email && body.password) {
      const enc = await encrypt(String(body.password))
      const { error } = await admin.from('cal_sync').upsert({
        user_id: user.id, cal_email: String(body.email), cal_password_enc: enc,
        enabled: body.enabled ?? true, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (error) throw new Error(`cal_sync save: ${error.message}`)
    } else if (typeof body.enabled === 'boolean') {
      // toggle only (no credential change)
      await admin.from('cal_sync').update({ enabled: body.enabled }).eq('user_id', user.id)
    }

    // Load creds and sync now.
    const { data: row } = await admin.from('cal_sync').select('user_id, cal_email, cal_password_enc').eq('user_id', user.id).maybeSingle()
    if (!row) return new Response(JSON.stringify({ error: 'Сначала сохрани логин и пароль cal.com' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })

    const result = await syncOne(admin, row)
    if (result.status !== 'ok') return new Response(JSON.stringify({ error: result.status }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ count: result.count }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? 'Error' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
```

- [ ] **Step 2: Set required secrets in Supabase**

Generate a 32-byte key and set secrets (one-time):

```bash
# 32-byte AES key, base64
KEY=$(openssl rand -base64 32)
echo "CAL_ENC_KEY=$KEY"
# random cron secret
SEC=$(openssl rand -hex 24)
echo "CRON_SECRET=$SEC"
```
Then add `CAL_ENC_KEY` and `CRON_SECRET` in Supabase → Edge Functions → Secrets (or `npx supabase secrets set CAL_ENC_KEY=... CRON_SECRET=...`). Keep `CRON_SECRET` for Task 4.

- [ ] **Step 3: Deploy with JWT verification disabled** (function does its own auth)

Run: `npx supabase functions deploy sync-cal --no-verify-jwt --project-ref mxnmubakfzqoosgsqmhh`
Expected: `Deployed Functions on project ...: sync-cal`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/sync-cal/index.ts
git commit -m "feat(cal): sync-cal edge function (auto-login + tRPC fetch + upsert)"
```

---

## Task 4: Daily cron

**Files:**
- Create: `supabase/cal-cron.sql`

- [ ] **Step 1: Write the cron SQL** (replace `REPLACE_WITH_CRON_SECRET` with the value from Task 3)

```sql
-- Daily cal.com sync at 05:00 UTC.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('cal-sync-daily')
where exists (select 1 from cron.job where jobname = 'cal-sync-daily');

select cron.schedule(
  'cal-sync-daily',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/sync-cal',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'REPLACE_WITH_CRON_SECRET'),
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 2: Apply and verify the job is scheduled**

Run the SQL in Supabase SQL Editor, then:
Run: `select jobname, schedule from cron.job where jobname = 'cal-sync-daily';`
Expected: one row, schedule `0 5 * * *`.

- [ ] **Step 3: Commit** (store the file WITHOUT the real secret — leave the placeholder)

```bash
git add supabase/cal-cron.sql
git commit -m "feat(cal): daily pg_cron trigger for sync-cal"
```

---

## Task 5: Settings UI

**Files:**
- Modify: `src/components/settings/SettingsScreen.tsx` (calendar section, ~lines 131-146 handler and ~336-352 markup)

- [ ] **Step 1: Replace the cal sync handler**

Replace `handleCalSync` (lines 131-146) with email/password state + handlers. Add near the other `useState` calls in the component:

```tsx
const [calEmail, setCalEmail] = useState('')
const [calPassword, setCalPassword] = useState('')
const [calStatus, setCalStatus] = useState<{ last_sync_at: string | null; last_status: string | null; event_count: number | null; enabled: boolean } | null>(null)
```

Add a load effect (next to the other effects in the component) to show auto-sync health (RLS lets the owner read these non-secret columns):

```tsx
useEffect(() => {
  supabase.from('cal_sync')
    .select('last_sync_at, last_status, event_count, enabled')
    .eq('user_id', user.id).maybeSingle()
    .then(({ data }) => setCalStatus(data ?? null))
}, [user.id])

async function handleCalToggle(enabled: boolean) {
  setCalStatus(s => s ? { ...s, enabled } : s)
  try { await callFunction('sync-cal', { enabled }) } catch { /* status reload on next mount */ }
}
```

New handlers (replace old `handleCalSync`):

```tsx
async function handleCalSaveAndSync() {
  if (!calEmail.trim() || !calPassword) return
  setCalLoading(true); setCalMsg(null)
  try {
    const { count } = await callFunction<{ count: number }>('sync-cal', { email: calEmail.trim(), password: calPassword })
    setCalMsg(`✓ ${t('Сохранено и загружено')} ${count} ${t('событий')}`)
    setCalPassword('')
    setTimeout(() => onNavigate?.('stress-map'), 1500)
  } catch (e: any) {
    setCalMsg(`${t('Ошибка')}: ${e.message}`)
  }
  setCalLoading(false)
}

async function handleCalSyncNow() {
  setCalLoading(true); setCalMsg(null)
  try {
    const { count } = await callFunction<{ count: number }>('sync-cal', {})
    setCalMsg(`✓ ${t('Загружено')} ${count} ${t('событий')}`)
    setTimeout(() => onNavigate?.('stress-map'), 1500)
  } catch (e: any) {
    setCalMsg(`${t('Ошибка')}: ${e.message}`)
  }
  setCalLoading(false)
}
```

- [ ] **Step 2: Replace the markup** (lines 336-352 — the instruction text + token input + button)

```tsx
<div className="settings-muted" style={{ marginBottom: 12, fontSize: 12, lineHeight: 1.5 }}>
  {t('Введи логин и пароль cal.com — синхронизация будет автоматической раз в день. Пароль хранится зашифрованно.')}
</div>
<div className="settings-ics-row" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
  <input className="log-input" type="email" placeholder="email@cal.com"
    value={calEmail} onChange={e => setCalEmail(e.target.value)} />
  <input className="log-input" type="password" placeholder={t('Пароль cal.com')}
    value={calPassword} onChange={e => setCalPassword(e.target.value)} />
  <div style={{ display: 'flex', gap: 8 }}>
    <button className="btn-primary" style={{ flex: 1 }} onClick={handleCalSaveAndSync}
      disabled={calLoading || !calEmail.trim() || !calPassword}>
      {calLoading ? t('Загрузка…') : t('Сохранить и синхронизировать')}
    </button>
    <button className="btn-secondary" onClick={handleCalSyncNow} disabled={calLoading}>
      {t('Синхронизировать сейчас')}
    </button>
  </div>
</div>
{calMsg && <div style={{ marginTop: 8, fontSize: 13, color: calMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{calMsg}</div>}
{calStatus && (
  <div style={{ marginTop: 10, fontSize: 12 }} className="settings-muted">
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <input type="checkbox" checked={calStatus.enabled} onChange={e => handleCalToggle(e.target.checked)} />
      {t('Авто-синк раз в день')}
    </label>
    {calStatus.last_sync_at && (
      <div>{t('Последний синк:')} {new Date(calStatus.last_sync_at).toLocaleString('ru-RU')} · {calStatus.event_count ?? 0} {t('событий')}
        {calStatus.last_status && calStatus.last_status !== 'ok' && <span style={{ color: 'var(--red)' }}> · {calStatus.last_status}</span>}
      </div>
    )}
  </div>
)}
```

(Leave the old `calToken` session-token input in place below this, under a collapsible "Расширенно / фолбэк" — do not delete it.)

Add uk/en for the two new status strings in Task 6: `'Авто-синк раз в день'` and `'Последний синк:'`.

- [ ] **Step 3: Verify the build**

Run: `npx tsc -b`
Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/SettingsScreen.tsx
git commit -m "feat(cal): email/password auto-sync UI in Settings"
```

---

## Task 6: Translations

**Files:**
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Add uk/en for the new RU strings** (add inside the object, near the calendar section)

```ts
'Введи логин и пароль cal.com — синхронизация будет автоматической раз в день. Пароль хранится зашифрованно.': { uk: 'Введи логін і пароль cal.com — синхронізація буде автоматичною раз на день. Пароль зберігається зашифровано.', en: 'Enter your cal.com login and password — sync runs automatically once a day. Password is stored encrypted.' },
'Пароль cal.com': { uk: 'Пароль cal.com', en: 'cal.com password' },
'Сохранить и синхронизировать': { uk: 'Зберегти і синхронізувати', en: 'Save & sync' },
'Синхронизировать сейчас': { uk: 'Синхронізувати зараз', en: 'Sync now' },
'Сохранено и загружено': { uk: 'Збережено і завантажено', en: 'Saved & loaded' },
'Авто-синк раз в день': { uk: 'Авто-синк раз на день', en: 'Auto-sync once a day' },
'Последний синк:': { uk: 'Останній синк:', en: 'Last sync:' },
```

(`Загружено`, `событий`, `Ошибка`, `Загрузка…` already exist — do not re-add; duplicate keys break `tsc` with TS1117.)

- [ ] **Step 2: Verify build + i18n completeness**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/translations.ts
git commit -m "i18n(cal): uk/en for auto-sync UI strings"
```

---

## Task 7: End-to-end verification (live)

The Deno login flow cannot be unit-tested — verify against the real instance.

- [ ] **Step 1: Push frontend** (auto-deploys to Vercel)

```bash
git push origin main
```
Expected: Vercel build succeeds.

- [ ] **Step 2: Save credentials in the app**

In Tonus → Settings → cal.com block: enter email + password → "Сохранить и синхронизировать".
Expected: `✓ Сохранено и загружено N событий`, then redirect to stress map showing cal events.

- [ ] **Step 3: Confirm DB rows**

Run (Supabase SQL Editor): `select count(*), max(start_ts) from calendar_events where source = 'cal';`
Expected: count > 0.

- [ ] **Step 4: Confirm cron fires** (next day, or trigger manually)

Manually invoke the cron path to confirm without waiting:
```bash
curl -s -X POST https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/sync-cal \
  -H 'x-cron-secret: REPLACE_WITH_CRON_SECRET' -H 'Content-Type: application/json' -d '{}'
```
Expected: `{"ran":1,"results":[{"status":"ok","count":N}]}`

- [ ] **Step 5: Confirm last status in UI**

Settings cal block should show last sync time + `ok`. Done.

---

## Notes for the implementer

- `sync-cal` MUST be deployed with `--no-verify-jwt` (it authenticates itself: user JWT for UI calls, `x-cron-secret` for cron). Same pattern as `ingest-health`. See memory `autosync-status`.
- `normalizeBookings` is duplicated in the edge function and `scripts/test-cal-normalize.mjs` on purpose (Deno can't run under the Node test). If you change one, change both.
- Keep `fetch-cal` and the manual token UI as a fallback — do not delete.
- If `calLogin` throws "Неверный логин или пароль (или включена 2FA)", confirm 2FA is off and the credentials provider accepts plain email/password on this instance.
