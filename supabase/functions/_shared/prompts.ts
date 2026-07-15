// Версионирование промптов (#3). Активная версия берётся из ai_prompts;
// если таблицы/строки нет — используется fallback из кода (ничего не ломается).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.2'

export interface ResolvedPrompt {
  text: string
  version: number | null
}

// Возвращает активный промпт по имени с наибольшей версией. fallback —
// «зашитый» в код вариант на случай отсутствия записи.
export async function getPrompt(supabase: SupabaseClient, name: string, fallback: string): Promise<ResolvedPrompt> {
  try {
    const { data } = await supabase
      .from('ai_prompts')
      .select('prompt, version')
      .eq('name', name).eq('active', true)
      .order('version', { ascending: false })
      .limit(1).maybeSingle()
    if (data?.prompt) return { text: data.prompt, version: data.version }
  } catch { /* таблицы может не быть — тихий фолбэк */ }
  return { text: fallback, version: null }
}
