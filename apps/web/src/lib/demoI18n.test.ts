import { describe, it, expect } from 'vitest'
import { translations } from './translations'
import { makeDemoExperiments, makeDemoSuggestions, makeDemoWorkoutSchedule, makeDemoEvents } from './demoFixture'
import { demoSeedStrings } from './demoSeed'
import { METRIC_OPTIONS } from './experiments'
import { METRIC_CONFIG } from './goals'

// Demo fixtures ship Russian strings, and Russian is the translation key (see i18n.tsx),
// so every fixture string must resolve in uk/en — otherwise a demo user who picked
// English still reads Russian cards.
function expectTranslated(key: string) {
  const entry = translations[key]
  expect(entry, `missing translation for "${key}"`).toBeDefined()
  expect(entry.uk, `missing uk for "${key}"`).toBeTruthy()
  expect(entry.en, `missing en for "${key}"`).toBeTruthy()
}

describe('demo fixtures are translatable', () => {
  it('translates every experiment string', () => {
    for (const exp of makeDemoExperiments()) {
      expectTranslated(exp.hypothesis)
      expectTranslated(exp.change_rule)
      if (exp.ai_explanation) expectTranslated(exp.ai_explanation)
    }
  })

  it('translates every AI suggestion string', () => {
    for (const s of makeDemoSuggestions()) {
      expectTranslated(s.hypothesis)
      expectTranslated(s.change_rule)
      if (s.rationale) expectTranslated(s.rationale)
    }
  })

  it('translates every stress-map event title', () => {
    for (const e of makeDemoEvents()) expectTranslated(e.title)
  })

  it('translates every workout label', () => {
    for (const day of Object.values(makeDemoWorkoutSchedule().day_times)) {
      if (day.label) expectTranslated(day.label)
    }
  })

  // Обходит фикстуры таблиц Supabase целиком: новая строка в demoSeed без
  // перевода валит этот тест, а не всплывает у uk/en-юзера на экране.
  it('translates every seeded row shown as data', () => {
    for (const s of demoSeedStrings()) expectTranslated(s)
  })

  it('translates the demo AI-explanation stub', () => {
    expectTranslated('Средние за периоды: {before} → {during} ({pct}%). Размер эффекта: {effect}. В демо-режиме это заглушка — в приложении разбор пишет ИИ на основе твоих данных.')
  })
})

// Labels/units that live in lib and are rendered through t() at the call site.
describe('lib labels are translatable', () => {
  it('translates every experiment metric label', () => {
    for (const m of METRIC_OPTIONS) {
      if (m.label === 'HRV' || m.label === 'SpO₂') continue // identical in every language
      expectTranslated(m.label)
    }
  })

  it('translates every goal metric label and unit', () => {
    for (const cfg of Object.values(METRIC_CONFIG)) {
      if (cfg.label !== 'HRV') expectTranslated(cfg.label)
      expectTranslated(cfg.unit)
    }
  })

  it('translates chart unit abbreviations', () => {
    for (const key of ['к', 'км', 'мл', 'Меню']) expectTranslated(key)
  })

  it('translates quick-log event labels', () => {
    // Every label, not the four the emoji-key era happened to list: the icon
    // now lives outside the key, so all ten are ordinary words and there is
    // no reason to guard only some of them.
    const labels = ['Кофе', 'Алкоголь', 'Еда', 'Вода', 'Лекарства',
      'Тренировка', 'Болезнь', 'Стресс', 'Поездка', 'Другое']
    for (const key of labels) expectTranslated(key)
  })
})
