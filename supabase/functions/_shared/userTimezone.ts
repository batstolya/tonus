import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Single source for the user's display timezone. Two different hardcoded
// fallbacks (report: Europe/Moscow, chat: Europe/Berlin) once rendered the
// same bedtime an hour apart; every user-facing time must go through this.
export const DEFAULT_TIMEZONE = 'Europe/Kyiv'

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function normalizeTimezone(tz: string | null | undefined): string {
  return tz && isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE
}

export async function loadUserTimezone(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase.from('profiles')
    .select('timezone').eq('id', userId).maybeSingle()
  return normalizeTimezone(data?.timezone as string | null | undefined)
}
