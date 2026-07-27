// Фасад над supabase/functions/_shared/scores.ts — ЕДИНСТВЕННОЙ реализацией
// формул дневных оценок (её же считает ingest-health при автосинке). Клиенты
// импортируют отсюда и никогда не лезут в supabase/ напрямую: правило границы
// общего кода из docs/superpowers/specs/2026-07-18-mobile-monorepo-design.md.
//
// Вторая копия этих формул однажды уже существовала и разъезжалась с сервером;
// возвращать её нельзя.
export { computeDailyScores, avg } from '../../../supabase/functions/_shared/scores.ts'
export type { DailyScore, ScoreInput } from '../../../supabase/functions/_shared/scores.ts'
