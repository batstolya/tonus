// Фикстуры демо-режима для таблиц Supabase (метрики Apple Health — в demoFixture.ts).
//
// Тексты русские намеренно: русский текст и есть ключ словаря (см. i18n.tsx),
// а экраны демо прогоняют их через t(). Каждая строка обязана иметь uk/en в
// translations/demo.ts — это проверяет demoI18n.test.ts.
//
// Даты считаются от сегодня, поэтому фикстуры всегда совпадают по периоду с
// makeDemoDaily() и не протухают.

import { alertTranslatableLines } from './notifications'

const DAY = 86400000
const DEMO_USER = 'demo-user'

export interface SeedIntakeEvent {
  id: string
  user_id: string
  ts: string
  type: string
  amount: number | null
  unit: string | null
  note: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  source: string | null
}

export interface SeedSupplement {
  id: string
  user_id: string
  name: string
  default_dose: string | null
  unit: string | null
  active: boolean
  sort_order: number
  created_at: string
  stock_count: number | null
}

export interface SeedSupplementLog {
  id: string
  user_id: string
  supplement_id: string
  date: string
  taken: boolean
  dose: string | null
  note: string | null
}

export interface SeedTreatment {
  id: string
  user_id: string
  supplement_id: string | null
  name: string
  started_at: string
  outcome_metrics: string[]
  notes: string | null
  created_at: string
}

export interface SeedLabFile {
  id: string
  user_id: string
  file_name: string
  file_path: string | null
  file_type: string | null
  date: string | null
  extracted_text: string | null
  created_at: string
}

export interface SeedLabResult {
  id: string
  user_id: string
  lab_file_id: string
  marker: string
  value: number
  unit: string | null
  ref_range: string | null
  flag: string | null
  /** Import date, as in production. */
  date: string
  sample_date: string | null
  sample_date_precision: 'day' | 'month' | 'unknown'
  analyte_key: string | null
}

export interface SeedConcern {
  id: string
  user_id: string
  name: string
  category: string
  status: 'active' | 'improving' | 'resolved'
  started_at: string | null
  notes: string | null
  is_private: boolean
  created_at: string
}

export interface SeedConcernLog {
  id: string
  user_id: string
  concern_id: string
  date: string
  at_time: string | null
  severity: number | null
  note: string | null
  photo_path: string | null
  created_at: string
}

export interface SeedHairEntry {
  id: string
  user_id: string
  date: string
  shedding_level: number | null
  density_rating: number | null
  hairline_rating: number | null
  scalp_note: string | null
  photo_top: string | null
  photo_hairline: string | null
  photo_temples: string | null
  notes: string | null
  created_at: string
}

export interface SeedGoal {
  id: string
  user_id: string
  metric: string
  title: string
  baseline_value: number | null
  target_value: number
  direction: 'up' | 'down' | 'earlier' | 'habit'
  start_date: string
  end_date: string
  status: 'active' | 'paused' | 'achieved' | 'failed'
  recommendation_id: string | null
  step_size: number | null
  created_at: string
}

export interface SeedRecommendation {
  id: string
  user_id: string
  metric: string
  text: string
  rationale: string | null
  suggested_target: number | null
  suggested_target_label: string | null
  status: 'new' | 'accepted' | 'dismissed' | 'snoozed'
  created_at: string
}

export interface SeedHealthAlert {
  id: string
  user_id: string
  level: 'yellow' | 'red'
  type: string          // 'anomaly' показывается баннером на дашборде
  message: string
  created_at: string
  acknowledged_at: string | null
}

export interface SeedContextNote {
  id: string
  user_id: string
  date: string
  note: string
  wellbeing: number | null
}

// Отчёты «Исследования» юзер запускает сам — стартуем с пустого списка,
// сохранённый прогон кладётся сюда же.
export interface SeedResearchRun {
  id: string
  user_id: string
  period_days: number
  findings: unknown
  reply: string | null
  created_at: string
}

export interface DemoSeed {
  intake_events: SeedIntakeEvent[]
  supplements: SeedSupplement[]
  supplement_logs: SeedSupplementLog[]
  treatments: SeedTreatment[]
  lab_files: SeedLabFile[]
  lab_results: SeedLabResult[]
  health_concerns: SeedConcern[]
  concern_logs: SeedConcernLog[]
  hair_entries: SeedHairEntry[]
  goals: SeedGoal[]
  recommendations: SeedRecommendation[]
  health_alerts: SeedHealthAlert[]
  context_notes: SeedContextNote[]
  research_runs: SeedResearchRun[]
}

// Детерминированный псевдорандом (тот же приём, что в demoFixture) — картинка
// демо не должна прыгать между рендерами.
function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const dateStr = (daysAgo: number): string =>
  new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10)

const at = (daysAgo: number, hour: number, min = 0): string => {
  const d = new Date(Date.now() - daysAgo * DAY)
  d.setHours(hour, min, 0, 0)
  return d.toISOString()
}

// ── Быстрый лог и питание ──────────────────────────────────────────────────
// 30 дней: кофе (питает кофеиновую кривую), вода, три приёма пищи с макросами,
// алкоголь по выходным, лекарства, тренировки, стресс и одна поездка.
const MEALS: { note: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }[] = [
  { note: 'Овсянка с ягодами и орехами', calories: 420, protein_g: 14, carbs_g: 62, fat_g: 12 },
  { note: 'Яичница с авокадо и тостом', calories: 480, protein_g: 22, carbs_g: 30, fat_g: 28 },
  { note: 'Греческий йогурт с мёдом', calories: 260, protein_g: 18, carbs_g: 28, fat_g: 8 },
  { note: 'Курица с рисом и овощами', calories: 620, protein_g: 45, carbs_g: 68, fat_g: 16 },
  { note: 'Борщ со сметаной и хлебом', calories: 540, protein_g: 22, carbs_g: 55, fat_g: 24 },
  { note: 'Паста болоньезе', calories: 710, protein_g: 32, carbs_g: 88, fat_g: 24 },
  { note: 'Лосось с киноа и салатом', calories: 580, protein_g: 38, carbs_g: 42, fat_g: 26 },
  { note: 'Творог с фруктами', calories: 300, protein_g: 28, carbs_g: 26, fat_g: 9 },
  { note: 'Салат с тунцом и яйцом', calories: 390, protein_g: 34, carbs_g: 18, fat_g: 20 },
  { note: 'Бургер с картошкой фри', calories: 950, protein_g: 38, carbs_g: 92, fat_g: 48 },
]

function makeIntakeEvents(days = 30): SeedIntakeEvent[] {
  const out: SeedIntakeEvent[] = []
  let n = 0
  const push = (e: Omit<SeedIntakeEvent, 'id' | 'user_id' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'source'> & Partial<SeedIntakeEvent>) => {
    out.push({
      id: `demo-intake-${n++}`,
      user_id: DEMO_USER,
      calories: null, protein_g: null, carbs_g: null, fat_g: null, source: null,
      ...e,
    } as SeedIntakeEvent)
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY)
    const weekend = d.getDay() === 0 || d.getDay() === 6
    const r = (k: number) => rnd(i * 11 + k)

    // Кофе: утренняя чашка всегда, вторая — чаще в будни. Поздний кофе — редко,
    // чтобы в корреляциях и кофеиновой кривой было что показать.
    push({ ts: at(i, 8, 20), type: 'coffee', amount: 200, unit: 'мл', note: null })
    if (!weekend || r(1) > 0.6) push({ ts: at(i, 13, 30), type: 'coffee', amount: 200, unit: 'мл', note: null })
    if (r(2) > 0.82) push({ ts: at(i, 17, 40), type: 'coffee', amount: 150, unit: 'мл', note: null })

    // Вода: 3–4 отметки в день.
    push({ ts: at(i, 9, 30), type: 'water', amount: 250, unit: 'мл', note: null })
    push({ ts: at(i, 12, 15), type: 'water', amount: 250, unit: 'мл', note: null })
    push({ ts: at(i, 16, 0), type: 'water', amount: 300, unit: 'мл', note: null })
    if (r(3) > 0.4) push({ ts: at(i, 19, 30), type: 'water', amount: 250, unit: 'мл', note: null })

    // Еда: завтрак, обед, ужин с макросами (питает экран «Питание»).
    const breakfast = MEALS[Math.floor(r(4) * 3)]
    const lunch = MEALS[3 + Math.floor(r(5) * 4)]
    const dinner = MEALS[6 + Math.floor(r(6) * 4)]
    push({ ts: at(i, 8, 40), type: 'meal', amount: null, unit: null, ...breakfast })
    push({ ts: at(i, 13, 50), type: 'meal', amount: null, unit: null, ...lunch })
    push({ ts: at(i, 19, 40), type: 'meal', amount: null, unit: null, ...dinner })

    // Алкоголь — по выходным, лекарства — курсом, стресс — в дедлайны.
    if (weekend && r(7) > 0.45) push({ ts: at(i, 20, 30), type: 'alcohol', amount: 300, unit: 'мл', note: 'Бокал вина за ужином' })
    if (i < 12 && r(8) > 0.25) push({ ts: at(i, 9, 0), type: 'meds', amount: null, unit: null, note: 'Курс железа, 1 таблетка' })
    if (r(9) > 0.78) push({ ts: at(i, 15, 0), type: 'stress', amount: null, unit: null, note: 'Дедлайн на работе' })
    if ([1, 3, 5].includes(d.getDay()) && r(10) > 0.25) {
      push({ ts: at(i, 19, 0), type: 'workout', amount: null, unit: null, note: r(11) > 0.5 ? 'Волейбол, 1.5 часа' : 'Зал, силовая' })
    }
  }

  // Поездка: три дня подряд неделю назад — видно на маркерах графиков.
  for (const i of [9, 8, 7]) push({ ts: at(i, 10, 0), type: 'travel', amount: null, unit: null, note: 'Командировка' })

  return out.sort((a, b) => b.ts.localeCompare(a.ts))
}

// ── БАДы: пять добавок, логи приёма с пропусками (соблюдение ~80%) ─────────
const SUPPLEMENT_SEEDS: { name: string; dose: string; unit: string; stock: number }[] = [
  { name: 'Витамин D3', dose: '2000', unit: 'МЕ', stock: 48 },
  { name: 'Магний глицинат', dose: '400', unit: 'мг', stock: 22 },
  { name: 'Омега-3', dose: '1000', unit: 'мг', stock: 60 },
  { name: 'Креатин', dose: '5', unit: 'г', stock: 7 },
  { name: 'Железо', dose: '25', unit: 'мг', stock: 30 },
]

function makeSupplements(): SeedSupplement[] {
  return SUPPLEMENT_SEEDS.map((s, i) => ({
    id: `demo-sup-${i}`,
    user_id: DEMO_USER,
    name: s.name,
    default_dose: s.dose,
    unit: s.unit,
    active: true,
    sort_order: i,
    created_at: at(90, 10),
    stock_count: s.stock,
  }))
}

function makeSupplementLogs(days = 30): SeedSupplementLog[] {
  const out: SeedSupplementLog[] = []
  let n = 0
  SUPPLEMENT_SEEDS.forEach((_, si) => {
    for (let i = days - 1; i >= 0; i--) {
      // Пропуски: у каждого БАДа своя дисциплина, чтобы блок соблюдения не был скучным.
      const skipRate = 0.1 + si * 0.05
      if (rnd(i * 7 + si * 31) < skipRate) continue
      out.push({
        id: `demo-suplog-${n++}`,
        user_id: DEMO_USER,
        supplement_id: `demo-sup-${si}`,
        date: dateStr(i),
        taken: true,
        dose: SUPPLEMENT_SEEDS[si].dose,
        note: null,
      })
    }
  })
  return out
}

function makeTreatments(): SeedTreatment[] {
  return [{
    id: 'demo-treat-0',
    user_id: DEMO_USER,
    supplement_id: 'demo-sup-1',
    name: 'Магний перед сном',
    started_at: dateStr(21),
    outcome_metrics: ['sleepDeep', 'hrv'],
    notes: 'Проверяю, влияет ли на глубокий сон',
    created_at: at(21, 21),
  }]
}

// ── Анализы: две панели, часть маркеров вне нормы ──────────────────────────
interface MarkerSeed {
  marker: string
  unit: string
  ref: string
  spring: number
  summer: number
  springFlag: string | null
  summerFlag: string | null
  /** Canonical key — the demo names are Russian, which the dictionary does not carry. */
  analyte: string
}

const MARKERS: MarkerSeed[] = [
  { marker: 'Ферритин', unit: 'нг/мл', ref: '30–400', spring: 24, summer: 41, springFlag: 'low', summerFlag: null , analyte: 'ferritin' },
  { marker: 'Витамин D', unit: 'нг/мл', ref: '30–100', spring: 19, summer: 34, springFlag: 'low', summerFlag: null , analyte: 'vitamin_d' },
  { marker: 'ТТГ', unit: 'мЕд/л', ref: '0.4–4.0', spring: 2.1, summer: 1.8, springFlag: null, summerFlag: null , analyte: 'tsh' },
  { marker: 'Гемоглобин', unit: 'г/л', ref: '130–170', spring: 141, summer: 148, springFlag: null, summerFlag: null , analyte: 'hemoglobin' },
  { marker: 'Холестерин общий', unit: 'ммоль/л', ref: '3.0–5.2', spring: 5.6, summer: 5.1, springFlag: 'high', summerFlag: null , analyte: 'cholesterol_total' },
  { marker: 'Глюкоза', unit: 'ммоль/л', ref: '3.9–5.5', spring: 5.0, summer: 4.8, springFlag: null, summerFlag: null , analyte: 'glucose' },
  { marker: 'Тестостерон общий', unit: 'нмоль/л', ref: '8.6–29', spring: 16.4, summer: 18.9, springFlag: null, summerFlag: null , analyte: 'testosterone' },
  { marker: 'СРБ', unit: 'мг/л', ref: '0–5', spring: 3.2, summer: 1.4, springFlag: null, summerFlag: null , analyte: 'crp' },
]

function makeLabFiles(): SeedLabFile[] {
  return [
    {
      id: 'demo-lab-1', user_id: DEMO_USER, file_name: 'Анализ крови (весна).pdf',
      file_path: null, file_type: 'application/pdf', date: dateStr(120),
      extracted_text: null, created_at: at(120, 12),
    },
    {
      id: 'demo-lab-2', user_id: DEMO_USER, file_name: 'Анализ крови (лето).pdf',
      file_path: null, file_type: 'application/pdf', date: dateStr(20),
      extracted_text: null, created_at: at(20, 12),
    },
  ]
}

function makeLabResults(): SeedLabResult[] {
  const out: SeedLabResult[] = []
  MARKERS.forEach((m, i) => {
    // The spring draw is dated to the day; the summer one only to its month,
    // so demo shows both precisions the report has to print — and the second
    // never claims a day the form did not give.
    out.push({
      id: `demo-labres-${i}-1`, user_id: DEMO_USER, lab_file_id: 'demo-lab-1',
      marker: m.marker, value: m.spring, unit: m.unit, ref_range: m.ref,
      flag: m.springFlag, date: dateStr(120),
      sample_date: dateStr(120), sample_date_precision: 'day', analyte_key: m.analyte,
    })
    out.push({
      id: `demo-labres-${i}-2`, user_id: DEMO_USER, lab_file_id: 'demo-lab-2',
      marker: m.marker, value: m.summer, unit: m.unit, ref_range: m.ref,
      flag: m.summerFlag, date: dateStr(20),
      sample_date: `${dateStr(20).slice(0, 7)}-01`, sample_date_precision: 'month', analyte_key: m.analyte,
    })
  })
  return out
}

// ── Проблемы со здоровьем ──────────────────────────────────────────────────
function makeConcerns(): SeedConcern[] {
  return [
    {
      id: 'demo-concern-hair', user_id: DEMO_USER, name: 'Выпадение волос',
      category: 'hair', status: 'improving', started_at: dateStr(150),
      notes: 'Началось после стресса и низкого ферритина', is_private: false,
      created_at: at(150, 10),
    },
    {
      id: 'demo-concern-head', user_id: DEMO_USER, name: 'Головные боли к вечеру',
      category: 'other', status: 'active', started_at: dateStr(60),
      notes: 'Чаще в дни с недосыпом', is_private: false,
      created_at: at(60, 10),
    },
  ]
}

function makeConcernLogs(): SeedConcernLog[] {
  const out: SeedConcernLog[] = []
  let n = 0
  // Волосы: тяжесть падает (проблема «улучшается»). Голова: скачет.
  for (let i = 56; i >= 0; i -= 7) {
    out.push({
      id: `demo-clog-${n++}`, user_id: DEMO_USER, concern_id: 'demo-concern-hair',
      date: dateStr(i), at_time: '09:15', severity: Math.max(1, Math.round(4 - (56 - i) / 20)),
      note: null, photo_path: null, created_at: at(i, 20),
    })
  }
  // The head-ache entries stay without a time: the demo has to show how an
  // observation stored before the time column existed still reads.
  for (let i = 28; i >= 0; i -= 4) {
    out.push({
      id: `demo-clog-${n++}`, user_id: DEMO_USER, concern_id: 'demo-concern-head',
      date: dateStr(i), at_time: null, severity: 1 + Math.round(rnd(i * 3) * 3),
      note: rnd(i * 5) > 0.7 ? 'После короткого сна' : null,
      photo_path: null, created_at: at(i, 21),
    })
  }
  return out
}

function makeHairEntries(): SeedHairEntry[] {
  const out: SeedHairEntry[] = []
  let n = 0
  for (let i = 56; i >= 0; i -= 14) {
    out.push({
      id: `demo-hair-${n++}`, user_id: DEMO_USER, date: dateStr(i),
      shedding_level: Math.max(1, Math.round(4 - (56 - i) / 20)),
      density_rating: 3 + Math.round((56 - i) / 40),
      hairline_rating: 3,
      scalp_note: null,
      photo_top: null, photo_hairline: null, photo_temples: null,
      notes: i === 0 ? 'Выпадение заметно меньше после подъёма ферритина' : null,
      created_at: at(i, 9),
    })
  }
  return out
}

// ── Цели и рекомендации ────────────────────────────────────────────────────
function makeGoals(): SeedGoal[] {
  return [
    {
      id: 'demo-goal-sleep', user_id: DEMO_USER, metric: 'sleep_hours',
      title: 'Длительность сна', baseline_value: 6.6, target_value: 7.5,
      direction: 'up', start_date: dateStr(10), end_date: dateStr(-4),
      status: 'active', recommendation_id: null, step_size: null,
      created_at: at(10, 9),
    },
    {
      id: 'demo-goal-steps', user_id: DEMO_USER, metric: 'steps',
      title: 'Шаги', baseline_value: 7200, target_value: 9000,
      direction: 'up', start_date: dateStr(45), end_date: dateStr(17),
      status: 'achieved', recommendation_id: null, step_size: null,
      created_at: at(45, 9),
    },
  ]
}

function makeRecommendations(): SeedRecommendation[] {
  return [
    {
      id: 'demo-rec-hrv', user_id: DEMO_USER, metric: 'hrv',
      text: 'Ложись до 23:00 хотя бы пять дней в неделю',
      rationale: 'В твоих данных ранний отбой предшествует более высокому HRV наутро.',
      suggested_target: 45, suggested_target_label: '45 мс',
      status: 'new', created_at: at(2, 8),
    },
    {
      id: 'demo-rec-rhr', user_id: DEMO_USER, metric: 'resting_heart_rate',
      text: 'Сдвинь последний кофе на два часа раньше',
      rationale: 'В дни с кофе после 16:00 пульс покоя ночью выше на 3 удара.',
      suggested_target: 54, suggested_target_label: '54 уд/мин',
      status: 'new', created_at: at(2, 8),
    },
  ]
}

// ── Алерты стража и заметки самочувствия ───────────────────────────────────
// Формат — 1:1 как в бою (buildAlertMessage, _shared/anomaly.ts): заголовок в
// <b>, строки метрик, «Совет: …», дисклеймер. Демо-колокольчик показывает те же
// компактные карточки с разворотом совета, что и у реального пользователя.
function makeHealthAlerts(): SeedHealthAlert[] {
  return [
    {
      id: 'demo-alert-1', user_id: DEMO_USER, level: 'yellow', type: 'guard',
      message: '🟡 <b>Присмотрись к самочувствию</b>\n\n↑ Пульс покоя: 64 уд/мин при твоей норме 55 уд/мин (2.3σ)\n\nСовет: полегче сегодня, понаблюдай за собой.\n<i>Это наблюдение по данным часов, не диагноз.</i>',
      created_at: at(1, 7), acknowledged_at: null,
    },
    {
      id: 'demo-alert-2', user_id: DEMO_USER, level: 'red', type: 'anomaly',
      message: '🔴 <b>Организм с чем-то борется</b>\n\n↓ HRV: 39 мс при твоей норме 52 мс (1.8σ)\n↑ Частота дыхания: 18.4/мин при твоей норме 15.2/мин (2.6σ)\n\nСовет: день без нагрузок, больше воды и сна. Если появятся симптомы — не геройствуй.\n<i>Это наблюдение по данным часов, не диагноз.</i>',
      created_at: at(0, 7), acknowledged_at: null,
    },
  ]
}

const NOTES = [
  'Чувствую себя бодро, тренировка далась легко',
  'Тяжёлый день, много кофе и мало сна',
  'Спал хорошо, но к вечеру разболелась голова',
  'Отличное самочувствие, много гулял',
  'Устал, лёг поздно из-за дедлайна',
]

function makeContextNotes(): SeedContextNote[] {
  const out: SeedContextNote[] = []
  let n = 0
  for (let i = 27; i >= 0; i -= 3) {
    const k = Math.floor(rnd(i * 13) * NOTES.length)
    out.push({
      id: `demo-note-${n++}`, user_id: DEMO_USER, date: dateStr(i),
      note: NOTES[k], wellbeing: 2 + Math.round(rnd(i * 17) * 3),
    })
  }
  return out
}

// Свежий набор фикстур. demoDb сидится этим при первом обращении.
export function makeDemoSeed(): DemoSeed {
  return {
    intake_events: makeIntakeEvents(),
    supplements: makeSupplements(),
    supplement_logs: makeSupplementLogs(),
    treatments: makeTreatments(),
    lab_files: makeLabFiles(),
    lab_results: makeLabResults(),
    health_concerns: makeConcerns(),
    concern_logs: makeConcernLogs(),
    hair_entries: makeHairEntries(),
    goals: makeGoals(),
    recommendations: makeRecommendations(),
    health_alerts: makeHealthAlerts(),
    context_notes: makeContextNotes(),
    research_runs: [],
  }
}

// Строки фикстур, которые уходят в UI как данные (проверяются на переводы).
export function demoSeedStrings(): string[] {
  const seed = makeDemoSeed()
  const strings = new Set<string>()
  for (const e of seed.intake_events) if (e.note) strings.add(e.note)
  for (const m of MEALS) strings.add(m.note)
  for (const s of seed.supplements) strings.add(s.name)
  for (const t of seed.treatments) { strings.add(t.name); if (t.notes) strings.add(t.notes) }
  for (const f of seed.lab_files) strings.add(f.file_name)
  for (const r of seed.lab_results) { strings.add(r.marker); if (r.unit) strings.add(r.unit) }
  for (const c of seed.health_concerns) { strings.add(c.name); if (c.notes) strings.add(c.notes) }
  for (const l of seed.concern_logs) if (l.note) strings.add(l.note)
  for (const h of seed.hair_entries) if (h.notes) strings.add(h.notes)
  for (const g of seed.goals) strings.add(g.title)
  for (const r of seed.recommendations) { strings.add(r.text); if (r.rationale) strings.add(r.rationale) }
  // Алерты локализуются построчно (localizeAlertText), не целой строкой:
  // проверяем только строки, обязанные быть ключами словаря.
  for (const a of seed.health_alerts) for (const l of alertTranslatableLines(a.message)) strings.add(l)
  for (const n of seed.context_notes) strings.add(n.note)
  return [...strings]
}
