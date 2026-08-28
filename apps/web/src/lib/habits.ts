// Habits: abstinence tracking where a closed day with no recorded break counts
// as clean. Spec: 2026-08-28-habits-design.md
//
// The pure logic lives in supabase/functions/_shared/habits.ts so the edge
// functions (telegram-bot, and any future doctor-report use) and the web app
// share exactly one implementation -- re-exported here so every existing
// `apps/web/src/lib/habits.ts` import keeps working unchanged. Never fork
// this into two copies: a divergence between the bot's streak and the page's
// streak would be invisible until a user noticed the numbers disagree.

export * from '../../../../supabase/functions/_shared/habits.ts'
