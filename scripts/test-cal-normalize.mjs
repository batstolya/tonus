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
ok('uid a kept with ISO ts', rows.find(r => r.uid === 'a')?.start_ts === '2026-06-18T10:00:00.000Z', rows)
ok('location passthrough', rows.find(r => r.uid === 'b')?.location === 'Zoom', rows)
ok('user_id set', rows.every(r => r.user_id === 'u1'), rows)
ok('missing startTime skipped (no uid c)', !rows.find(r => r.uid === 'c'), rows)

console.log(pass ? '\nALL PASS' : '\nFAIL')
process.exit(pass ? 0 : 1)
