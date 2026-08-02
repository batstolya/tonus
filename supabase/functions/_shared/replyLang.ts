// Reply language for every AI-generated text.
//
// Health data in the prompts is always Russian (metric names, journal notes),
// but the answer must follow the UI language the caller sends. Before this
// module each function hardcoded "На русском." in its prompt, so Ukrainian
// users read Russian analyses. Keep new AI functions on these helpers.

export type ReplyLang = 'ru' | 'uk' | 'en'

const DEFAULT_LANG: ReplyLang = 'ru'

// Prepositional case ("на русском"), the form the prompts embed.
const PREPOSITIONAL: Record<ReplyLang, string> = {
  ru: 'русском',
  uk: 'украинском',
  en: 'английском',
}

// Nominative case ("Язык ответа: русский").
const NOMINATIVE: Record<ReplyLang, string> = {
  ru: 'русский',
  uk: 'украинский',
  en: 'английский',
}

/** Narrows arbitrary request input to a supported language, falling back to ru. */
export function normalizeLang(lang: unknown): ReplyLang {
  return lang === 'uk' || lang === 'en' || lang === 'ru' ? lang : DEFAULT_LANG
}

/** "украинском" — for prompts phrased as "Отвечай на <lang>". */
export function langPrepositional(lang: unknown): string {
  return PREPOSITIONAL[normalizeLang(lang)]
}

/** "украинский" — for prompts phrased as "Язык ответа: <lang>". */
export function langNominative(lang: unknown): string {
  return NOMINATIVE[normalizeLang(lang)]
}

/** Minimal shape of the profile read; keeps this module free of client typing. */
export interface ProfileLangClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: { lang?: string | null } | null }>
      }
    }
  }
}

/**
 * Language for background generation (cron, Telegram), where no request body
 * carries the UI language. The client mirrors the picked language into
 * profiles.lang; an unset profile keeps the historical Russian default.
 */
export async function loadUserLang(supabase: ProfileLangClient, userId: string): Promise<ReplyLang> {
  const { data } = await supabase.from('profiles').select('lang').eq('id', userId).maybeSingle()
  return normalizeLang(data?.lang)
}

/** Ready-made prompt line; append to any AI system prompt. */
export function langInstruction(lang: unknown): string {
  return `Язык ответа — ${langNominative(lang)}. Отвечай только на ${langPrepositional(lang)}, даже если данные в контексте на другом языке.`
}
