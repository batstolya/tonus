// Canonical identity for a laboratory analyte.
//
// One patient's four lab files arrived in Spanish and Polish, from three
// laboratories, each spelling the same analyte its own way: ferritin appears as
// FERRITINA, "Ferrytyna (L05)" and "[L05] Ferrytyna". Grouping by the printed
// name left 78 "markers" for roughly 45 analytes, so no trend was ever drawn
// across a year of results.
//
// The table below is hand-written and deliberately conservative. An
// unrecognised name returns null and keeps its printed name — a wrong join is a
// medical error, a missing join is only a missing trend.

/** How the analyte was measured. A percentage and a count never share a series. */
export type Measurement = 'absolute' | 'relative'

export interface AnalyteId {
  /** Stable slug, e.g. 'ferritin'. */
  key: string
  measurement: Measurement
  /**
   * Normalised unit spelling, NOT a conversion. Two results join only when this
   * matches, so mg/dL stays apart from mmol/L until something teaches this
   * module the analyte-specific factor.
   */
  unitFamily: string
}

/**
 * Unit spellings that denote the same unit. Without this, `mU/l` and `µIU/mL`
 * — identical for TSH — would form two series of one point each, and the
 * haematology counts (`10^9/L` against `10E3/µL`) would do the same.
 */
const UNIT_ALIASES: Record<string, string> = {
  'mu/l': 'miu/ml', 'µiu/ml': 'miu/ml', 'uiu/ml': 'miu/ml', 'miu/l': 'miu/ml',
  '10^9/l': '10e3/ul', '10e3/µl': '10e3/ul', '10e3/ul': '10e3/ul', '10*3/ul': '10e3/ul',
  '10^12/l': '10e6/ul', '10e6/µl': '10e6/ul', '10e6/ul': '10e6/ul',
  'µg/dl': 'ug/dl', 'ug/dl': 'ug/dl',
  'µmol/l': 'umol/l', 'umol/l': 'umol/l',
  'ng/ml': 'ng/ml', 'ng/dl': 'ng/dl', 'pg/ml': 'pg/ml',
  'g/dl': 'g/dl', 'g/l': 'g/l', 'mg/dl': 'mg/dl', 'mmol/l': 'mmol/l',
  'pmol/l': 'pmol/l', 'nmol/l': 'nmol/l', 'u/l': 'u/l',
  '%': '%', 'fl': 'fl', 'pg': 'pg', 'mmol/mol': 'mmol/mol',
}

/**
 * A laboratory's own index: "L05", "117", "K01", "M37". Dropped wherever it
 * appears. An abbreviation like "(PLT)" or "(LYMPH%)" is not a code — it is
 * often the only thing distinguishing two rows — so its brackets go and its
 * text stays.
 */
const LAB_CODE = /^[a-z]{0,3}\d{1,4}$/

/**
 * Some stored names carry an undecoded escape instead of the letter: iron is
 * stored as the twelve characters `[095] Żelazo`, while `Płytki krwi
 * (PLT)` from the same import kept its real `ł`. The escape survived one JSON
 * round-trip too many on the way in. Decoding here keeps those rows joinable
 * without rewriting stored data, and costs nothing for names that are clean.
 */
const decodeEscapes = (s: string): string =>
  s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))

/** Lower-case, strip diacritics, drop laboratory codes and collapse spaces. */
export function normaliseName(marker: string): string {
  return decodeEscapes(marker)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l') // ł has no decomposition, so NFD leaves it whole
    .toLowerCase()
    .replace(/[[(]([^\])]*)[\])]/g, (_, inner: string) =>
      LAB_CODE.test(inner.trim()) ? ' ' : ` ${inner} `)
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normaliseUnit(unit: string | null | undefined): string {
  const raw = (unit ?? '').trim().toLowerCase().replace(/\s+/g, '')
  return UNIT_ALIASES[raw] ?? raw
}

/**
 * Normalised name → canonical key. Percentage variants of the differential
 * count carry their own entries, because the printed name is what distinguishes
 * them in Polish (`limfocyty (lymph%)`) while Spanish relies on the unit alone.
 */
const NAME_TO_KEY: Record<string, string> = {
  // Iron studies
  'ferrytyna': 'ferritin', 'ferritina': 'ferritin',
  'zelazo': 'iron', 'hierro': 'iron',
  'transferyna': 'transferrin',
  'uibc': 'uibc', 'cap latente de fijacion de fe': 'uibc',
  'tibc': 'tibc', 'capacidad total fijacion hierro': 'tibc',
  'indice saturacion transferrina cffe': 'transferrin_saturation',
  // Thyroid and hormones
  'tsh': 'tsh',
  'trijodotyronina wolna ft3': 'ft3', 'ft3': 'ft3',
  'tyroksyna wolna ft4': 'ft4', 'ft4': 'ft4',
  'kortyzol jedn tradyc': 'cortisol', 'kortyzol jedn si': 'cortisol',
  'testosteron': 'testosterone',
  // Vitamins
  'witamina 25-oh d3': 'vitamin_d', 'witamina 25 oh d total': 'vitamin_d',
  'witamina b12': 'vitamin_b12',
  // Metabolic
  'glukoza': 'glucose', 'glucosa': 'glucose',
  'glucosa media estimada': 'estimated_average_glucose',
  'hemoglobina a1c': 'hba1c', 'hemoglobina a1c ifcc': 'hba1c_ifcc',
  'kreatynina w surowicy': 'creatinine', 'egfr': 'egfr',
  'magnez w surowicy': 'magnesium',
  'aminotransferaza alaninowa alt': 'alt',
  'bilirrubina total': 'bilirubin_total',
  // Lipids
  'cholesterol hdl w surowicy': 'hdl',
  'cholesterol ldl - wyliczany': 'ldl',
  'cholesterol calkowity w surowicy': 'cholesterol_total',
  'nie-hdl': 'non_hdl',
  'triglicerydy w surowicy': 'triglycerides',
  // Red cells
  'erytrocyty rbc': 'rbc', 'hematies': 'rbc',
  'hemoglobina': 'hemoglobin', 'hemoglobina hgb': 'hemoglobin',
  // The Polish form printed its unit inside the name, as a second row.
  'hemoglobina mmol/l': 'hemoglobin',
  'hematokryt hct': 'hematocrit', 'hematocrito': 'hematocrit',
  'srednia objetosc erytrocyta mcv': 'mcv', 'volumen corpuscular medio': 'mcv',
  'srednia masa hgb w erytrocycie mch': 'mch', 'hemoglobina corpuscular media': 'mch',
  'srednie stezenie hgb w erytrocytach mchc': 'mchc', 'conc hemoglobina corp media': 'mchc',
  'wskaznik anizocytozy erytrocytow rdw': 'rdw', 'anchura distribucion hematies': 'rdw',
  // Platelets
  'plytki krwi plt': 'platelets', 'plaquetas': 'platelets',
  'srednia objetosc plytek krwi mpv': 'mpv', 'volumen plaquetar medio': 'mpv',
  'plytkokryt pct': 'plateletcrit',
  'wskaznik anizocytozy plytek krwi pdw': 'pdw',
  // White cells and the differential
  'leukocyty wbc': 'wbc', 'leucocitos': 'wbc',
  'bazocyty baso': 'basophils', 'bazocyty baso%': 'basophils', 'basofilos': 'basophils',
  'eozynocyty eos': 'eosinophils', 'eozynocyty eos%': 'eosinophils', 'eosinofilos': 'eosinophils',
  'limfocyty lymph': 'lymphocytes', 'limfocyty lymph%': 'lymphocytes', 'linfocitos': 'lymphocytes',
  'monocyty mon': 'monocytes', 'monocyty mon%': 'monocytes', 'monocitos': 'monocytes',
  'neutrocyty neu': 'neutrophils', 'neutrocyty neu%': 'neutrophils', 'neutrofilos': 'neutrophils',
}

/**
 * Analytes whose natural unit is a percentage. For everything else a '%' unit
 * means the relative form of a count, which must never share a series with the
 * absolute one.
 */
const PERCENT_IS_THE_ANALYTE = new Set([
  'hematocrit', 'rdw', 'pdw', 'plateletcrit', 'hba1c', 'transferrin_saturation',
])

const measurementOf = (key: string, unitFamily: string): Measurement =>
  unitFamily === '%' && !PERCENT_IS_THE_ANALYTE.has(key) ? 'relative' : 'absolute'

export function identifyAnalyte(marker: string, unit: string | null | undefined): AnalyteId | null {
  const key = NAME_TO_KEY[normaliseName(marker)]
  if (!key) return null
  const unitFamily = normaliseUnit(unit)
  return { key, measurement: measurementOf(key, unitFamily), unitFamily }
}

/** Two results belong to one series only when all three parts agree. */
export function seriesKey(id: AnalyteId): string {
  return `${id.key}|${id.measurement}|${id.unitFamily}`
}

/**
 * The same series key from a key already stored on the row plus that row's own
 * unit. `measurement` and `unitFamily` are deliberately not stored: they follow
 * from the unit, and deriving them here keeps the report from grouping on
 * `analyte_key` alone — which would merge the percentage and the absolute count
 * of one analyte and undo the separation the report was fixed to keep.
 */
export function seriesKeyFor(analyteKey: string, unit: string | null | undefined): string {
  const unitFamily = normaliseUnit(unit)
  return seriesKey({ key: analyteKey, measurement: measurementOf(analyteKey, unitFamily), unitFamily })
}
