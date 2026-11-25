import { describe, expect, it } from 'vitest'
import { translations } from './translations'
import { METRIC_CATALOG } from '../../../../supabase/functions/_shared/metricCatalog'

describe('metric catalog labels', () => {
  it('has uk + en translations for every catalog label', () => {
    for (const { label } of METRIC_CATALOG) {
      const entry = translations[label]
      expect(entry?.uk, `uk for ${label}`).toBeTruthy()
      expect(entry?.en, `en for ${label}`).toBeTruthy()
    }
  })
})
