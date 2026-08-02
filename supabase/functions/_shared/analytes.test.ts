import { describe, expect, it } from 'vitest'
import { identifyAnalyte, normaliseName, normaliseUnit, seriesKey } from './analytes.ts'

// The names below are the real production set: 83 results across four files,
// two languages and three laboratories, all of which the report treated as
// unrelated markers.

describe('normaliseName', () => {
  it('strips the laboratory code whichever way the form printed it', () => {
    expect(normaliseName('[L05] Ferrytyna')).toBe('ferrytyna')
    expect(normaliseName('Ferrytyna (L05)')).toBe('ferrytyna')
    expect(normaliseName('Glukoza (L43)')).toBe('glukoza')
    expect(normaliseName('Triglicerydy w surowicy (049)')).toBe('triglicerydy w surowicy')
  })

  it('folds Polish diacritics and Spanish accents', () => {
    expect(normaliseName('Żelazo')).toBe('zelazo')
    expect(normaliseName('Płytki krwi (PLT)')).toBe('plytki krwi plt')
    expect(normaliseName('ANCHURA DISTRIBUCIÓN HEMATIES')).toBe('anchura distribucion hematies')
    expect(normaliseName('Średnia objętość erytrocyta (MCV)')).toBe('srednia objetosc erytrocyta mcv')
  })

  it('keeps the percent marker that distinguishes a differential row', () => {
    expect(normaliseName('Limfocyty (LYMPH%)')).toBe('limfocyty lymph%')
    expect(normaliseName('Limfocyty (LYMPH)')).toBe('limfocyty lymph')
  })
})

describe('normaliseUnit', () => {
  it('joins spellings of one unit, which string equality would split', () => {
    // TSH arrived as mU/l from Poznań and µIU/mL from the other Polish lab.
    expect(normaliseUnit('mU/l')).toBe(normaliseUnit('µIU/mL'))
    // Haematology counts: SI against the Spanish form.
    expect(normaliseUnit('10^9/L')).toBe(normaliseUnit('10E3/µL'))
    expect(normaliseUnit('10^12/L')).toBe(normaliseUnit('10E6/µL'))
  })

  it('keeps genuinely different units apart', () => {
    expect(normaliseUnit('mg/dL')).not.toBe(normaliseUnit('mmol/L'))
    expect(normaliseUnit('µg/dL')).not.toBe(normaliseUnit('µmol/L'))
    expect(normaliseUnit('ng/mL')).not.toBe(normaliseUnit('ng/dL'))
  })
})

describe('identifyAnalyte', () => {
  it('joins ferritin across three spellings and two languages', () => {
    const spellings = ['FERRITINA', 'Ferrytyna (L05)', '[L05] Ferrytyna']
    const keys = spellings.map(n => seriesKey(identifyAnalyte(n, 'ng/mL')!))
    expect(new Set(keys).size).toBe(1)
  })

  it('joins TSH across two unit spellings of the same unit', () => {
    const a = identifyAnalyte('[L69] TSH', 'mU/l')!
    const b = identifyAnalyte('TSH (L69)', 'µIU/mL')!
    expect(seriesKey(a)).toBe(seriesKey(b))
  })

  it('keeps iron in µg/dL apart from iron in µmol/L, since nothing converts them', () => {
    const a = identifyAnalyte('[095] Żelazo', 'µg/dl')!
    const b = identifyAnalyte('Żelazo', 'µmol/l')!
    expect(a.key).toBe(b.key)
    expect(seriesKey(a)).not.toBe(seriesKey(b))
  })

  it('separates the percentage and the absolute count of one differential analyte', () => {
    const pct = identifyAnalyte('LINFOCITOS', '%')!
    const abs = identifyAnalyte('LINFOCITOS', '10E3/µL')!
    expect(pct.key).toBe('lymphocytes')
    expect(pct.measurement).toBe('relative')
    expect(abs.measurement).toBe('absolute')
    expect(seriesKey(pct)).not.toBe(seriesKey(abs))
  })

  it('treats a percentage as the analyte itself where that is what it measures', () => {
    for (const [name, unit] of [['Hematokryt (HCT)', '%'], ['HEMOGLOBINA A1c', '%'],
      ['Wskaźnik anizocytozy erytrocytów (RDW)', '%']] as [string, string][]) {
      expect(identifyAnalyte(name, unit)!.measurement, name).toBe('absolute')
    }
  })

  it('joins the Polish and Spanish name of every analyte present in both files', () => {
    const pairs: [string, string, string][] = [
      ['Glukoza (L43)', 'GLUCOSA', 'glucose'],
      ['Hemoglobina (HGB)', 'HEMOGLOBINA', 'hemoglobin'],
      ['Hematokryt (HCT)', 'HEMATOCRITO', 'hematocrit'],
      ['Erytrocyty (RBC)', 'HEMATIES', 'rbc'],
      ['Leukocyty (WBC)', 'LEUCOCITOS', 'wbc'],
      ['Płytki krwi (PLT)', 'PLAQUETAS', 'platelets'],
      ['Średnia objętość erytrocyta (MCV)', 'VOLUMEN CORPUSCULAR MEDIO', 'mcv'],
      ['Średnia masa HGB w erytrocycie (MCH)', 'HEMOGLOBINA CORPUSCULAR MEDIA', 'mch'],
      ['Średnie stężenie HGB w erytrocytach (MCHC)', 'CONC. HEMOGLOBINA CORP. MEDIA', 'mchc'],
      ['Wskaźnik anizocytozy erytrocytów (RDW)', 'ANCHURA DISTRIBUCIÓN HEMATIES', 'rdw'],
      ['Średnia objętość płytek krwi (MPV)', 'VOLUMEN PLAQUETAR MEDIO', 'mpv'],
      ['[093] TIBC', 'CAPACIDAD TOTAL FIJACION HIERRO', 'tibc'],
      ['UIBC', 'CAP. LATENTE DE FIJACION DE FE', 'uibc'],
      ['[091] Witamina 25-OH D3', 'Witamina 25(OH)D Total', 'vitamin_d'],
    ]
    for (const [pl, es, key] of pairs) {
      expect(identifyAnalyte(pl, 'ng/mL')?.key, pl).toBe(key)
      expect(identifyAnalyte(es, 'ng/mL')?.key, es).toBe(key)
    }
  })

  it('recognises every marker name present in production', () => {
    const names = [
      'ANCHURA DISTRIBUCIÓN HEMATIES', 'Aminotransferaza alaninowa (ALT) (117)', 'BASOFILOS',
      'BILIRRUBINA TOTAL', 'Bazocyty (BASO%)', 'Bazocyty (BASO)', 'CAP. LATENTE DE FIJACION DE FE',
      'CAPACIDAD TOTAL FIJACION HIERRO', 'CONC. HEMOGLOBINA CORP. MEDIA', 'Cholesterol HDL w surowicy (K01)',
      'Cholesterol LDL - wyliczany', 'Cholesterol całkowity w surowicy (199)', 'EGFR', 'EOSINOFILOS',
      'Eozynocyty (EOS%)', 'Eozynocyty (EOS)', 'Erytrocyty (RBC)', 'FERRITINA', 'FT3 (055)', 'FT4 (069)',
      'Ferrytyna (L05)', 'GLUCOSA', 'GLUCOSA MEDIA ESTIMADA', 'Glukoza (L43)', 'HEMATIES', 'HEMATOCRITO',
      'HEMOGLOBINA', 'HEMOGLOBINA A1c', 'HEMOGLOBINA A1c IFCC', 'HEMOGLOBINA CORPUSCULAR MEDIA', 'HIERRO',
      'Hematokryt (HCT)', 'Hemoglobina (HGB)', 'Hemoglobina [mmol/L]',
      'INDICE SATURACION TRANSFERRINA (CFFE)', 'Kortyzol (jedn. tradyc.)', 'Kreatynina w surowicy (M37)',
      'LEUCOCITOS', 'LINFOCITOS', 'Leukocyty (WBC)', 'Limfocyty (LYMPH%)', 'Limfocyty (LYMPH)',
      'MONOCITOS', 'Magnez w surowicy (M87)', 'Monocyty (MON%)', 'Monocyty (MON)', 'NEUTROFILOS',
      'Neutrocyty (NEU%)', 'Neutrocyty (NEU)', 'Nie-HDL', 'PLAQUETAS', 'Płytki krwi (PLT)',
      'Płytkokryt (PCT)', 'TSH (L69)', 'Testosteron (041)', 'Transferyna', 'Triglicerydy w surowicy (049)',
      'VOLUMEN CORPUSCULAR MEDIO', 'VOLUMEN PLAQUETAR MEDIO', 'Witamina 25(OH)D Total',
      'Witamina B12 (083)', 'Wskaźnik anizocytozy erytrocytów (RDW)', 'Wskaźnik anizocytozy płytek krwi (PDW)',
      'Średnia masa HGB w erytrocycie (MCH)', 'Średnia objętość erytrocyta (MCV)',
      'Średnia objętość płytek krwi (MPV)', 'Średnie stężenie HGB w erytrocytach (MCHC)',
      '[043] Transferyna', '[055] Trijodotyronina wolna FT3', '[069] Tyroksyna wolna FT4',
      '[091] Witamina 25-OH D3', '[093] TIBC', '[095] Żelazo', '[L05] Ferrytyna', '[L69] TSH',
      '[M31] Kortyzol (jedn.SI)', 'Żelazo',
    ]
    const unknown = names.filter(n => identifyAnalyte(n, null) == null)
    expect(unknown).toEqual([])
  })

  it('returns null for a name it does not know, instead of guessing a near match', () => {
    expect(identifyAnalyte('Ferritin-like substance', 'ng/mL')).toBeNull()
    expect(identifyAnalyte('', null)).toBeNull()
    expect(identifyAnalyte('Ferrytynaa', 'ng/mL')).toBeNull()
  })
})
