import { LOCALES, type Lang } from './translate'

// Склонение счётных существительных. Словарь этого не умеет: ключ там один, а
// украинскому и русскому нужны три формы («1 день», «3 дні», «5 днів»), причём
// 11–14 идут по последней форме вопреки последней цифре. Intl.PluralRules знает
// правила для каждой локали — таблица ниже лишь подставляет слово.
type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }

const DAYS: Record<Lang, PluralForms> = {
  uk: { one: 'день', few: 'дні', many: 'днів', other: 'днів' },
  ru: { one: 'день', few: 'дня', many: 'дней', other: 'дней' },
  en: { one: 'day', other: 'days' },
}

function pick(n: number, lang: Lang, forms: PluralForms): string {
  const rule = new Intl.PluralRules(LOCALES[lang]).select(n)
  return forms[rule] ?? forms.other
}

/** «5 днів» / «3 дня» / «2 days» — слово без самого числа. */
export function pluralDays(n: number, lang: Lang): string {
  return pick(n, lang, DAYS[lang])
}
