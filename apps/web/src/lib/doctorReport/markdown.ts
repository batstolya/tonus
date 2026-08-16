import { translations } from '../translations'
import { METRIC_DEFS, type MetricSummary } from './metrics'
import { BAND_TEXT, POSITION_TEXT } from './reliability'
import {
  LAB_STATUS_TEXT, LAB_FLAG_SUFFIX, LAB_UNIT_CAVEAT, LAB_DATE_CAVEAT,
  LAB_ORDER_UNKNOWN, LAB_UNIDENTIFIED, labDateCell, type LabLine,
} from './labs'
import { INTAKE_LABELS } from './intake'
import type { NutritionSection } from './nutrition'
import type { DoctorReportModel, ScoreSummary } from './model'

/** Report language, independent of the interface language. */
export type ReportLang = 'ru' | 'uk' | 'en'

const STATUS_TEXT: Record<string, string> = {
  active: 'активна', improving: 'улучшается', resolved: 'разрешилась',
}

const DIGITS = new Map(METRIC_DEFS.map(m => [m.key, m.digits]))
const LABELS = new Map(METRIC_DEFS.map(m => [m.key, m.label]))

const signed = (n: number, digits = 0): string => `${n > 0 ? '+' : ''}${n.toFixed(digits)}`

/**
 * Same cell in both renderers: markdown.ts and DoctorReport.tsx print this
 * exact string for the "personal baseline" column, given the model's own
 * translate function (t for markdown's ru/en switch, rt for the printed page).
 */
export const baselineCell = (m: MetricSummary, t: (key: string) => string): string =>
  m.baseline
    ? `${t('медиана')} ${m.baseline.median.toFixed(m.digits)} · ${m.baseline.lo.toFixed(m.digits)}–${m.baseline.hi.toFixed(m.digits)} · ${t(POSITION_TEXT[m.baseline.position])}`
    : t('данных недостаточно')

/**
 * Same cell in both renderers: the score table's trend column. When the
 * model refused the trend (see model.ts — not enough coverage at one end of
 * the period) there is no delta to print, so this says so instead of
 * guessing. Below one point the arrow would dramatise rounding noise.
 */
export const scoreTrendText = (s: ScoreSummary, t: (key: string) => string): string => {
  if (!s.trend || s.first == null || s.last == null) return t('не рассчитан')
  const delta = s.last - s.first
  return Math.abs(delta) < 1 ? t('без изменений') : `${delta > 0 ? '↑' : '↓'} ${signed(delta)}`
}

/**
 * Same cell in both renderers: the labs status column. `l.status` already
 * refuses to guess when there is no reference range or lab flag (see
 * labs.ts); this only names where a real verdict came from, so a value read
 * off the lab's own flag is never presented as if a range confirmed it.
 */
export const labStatusCell = (l: Pick<LabLine, 'status' | 'statusSource'>, t: (key: string) => string): string =>
  `${t(LAB_STATUS_TEXT[l.status])}${l.statusSource === 'lab-flag' ? ` (${t(LAB_FLAG_SUFFIX)})` : ''}`

/**
 * Same rows in both renderers: the nutrition medians. A macro the patient
 * never entered is dropped rather than printed as a dash, so the table stays
 * a list of what is actually known.
 */
export const nutritionMacroRows = (
  s: NutritionSection,
  t: (key: string) => string,
): [string, string][] => ([
  ['Калории, ккал', s.medianCalories],
  ['Белки, г', s.medianProtein],
  ['Жиры, г', s.medianFat],
  ['Углеводы, г', s.medianCarbs],
] as [string, number | null][])
  .filter((row): row is [string, number] => row[1] != null)
  .map(([label, value]) => [t(label), String(value)])

/**
 * The nutrition caveat, worded like the intake one: these are ticks in an
 * app, and the macros are whatever the patient or their food tracker typed.
 */
export const NUTRITION_CAVEAT = 'Это отметки пациента в приложении, а не измерения. Отсутствие отметки не означает, что приёма пищи не было, а калории и макронутриенты — введённые пациентом значения, а не измеренный состав еды. Вес порций и микронутриенты не учитываются.'

/**
 * Same list in both renderers: the closing "what this data does not
 * contain" block. It exists so an external model reading this report never
 * mistakes silence for a normal reading — each line names data the app
 * either never collects or collects but excludes from this report.
 */
export const MISSING_LINES = [
  'Артериального давления, веса, роста, температуры тела',
  'Диагнозов, назначений врача и рецептурных препаратов (учитываются только добавки, отмеченные пациентом)',
  'ЭКГ, аритмий и любых клинических измерений',
  'Время и длительность эпизодов низкого или высокого пульса: в отчёте есть только суточные минимум, максимум и среднее',
  'Тип тренировки и пульс во время неё: есть только минуты упражнений и активные калории',
  'Время в постели, засыпание, ночные пробуждения и эффективность сна',
  'События (болезнь, стресс, поездки) пациент отмечает в приложении, но в этот отчёт они не включены; кофе, алкоголь и лекарства — включены отдельной секцией, еда и вода — своей',
  'Всё перечисленное отсутствует, а не равно нулю: не делай выводов о том, чего здесь нет.',
]

/**
 * The markdown twin of the printed page: same model, same sections, same
 * order. Russian keys pass through the dictionary for the uk and en reports.
 */
export function toMarkdown(model: DoctorReportModel, lang: ReportLang): string {
  const t = (key: string) => (lang === 'ru' ? key : translations[key]?.[lang] ?? key)
  const L: string[] = []
  const p = (s = '') => L.push(s)
  const table = (header: string[], rows: string[][]) => {
    p(`| ${header.join(' | ')} |`)
    p(`|${'---|'.repeat(header.length)}`)
    for (const r of rows) p(`| ${r.join(' | ')} |`)
    p()
  }
  const dash = '—'

  p(`# ${t('Сводка данных здоровья')}`)
  p()
  p(`- **${t('Период')}:** ${model.period.effectiveStart} — ${model.period.end} (${model.period.calendarDays} ${t('дней')})`)
  p(`- **${t('Качество данных')}:** ${t('календарных дней')} ${model.period.calendarDays} · ${t('дней хотя бы с одной записью')} ${model.period.daysWithAnyRecord} · ${t('полностью пустых дней')} ${model.period.emptyDays}`)
  if (model.period.clamped) {
    p(`- **${t('Запрошенный период')}:** ${model.period.nominalDays} ${t('дней')}, ${t('но данные начинаются')} ${model.period.effectiveStart} — ${t('знаменатель считается от этой даты')}`)
  }
  p(`- **${t('Сформировано')}:** ${model.period.end}`)
  p(`- **${t('Источник')}:** ${t('приложение Tonus, данные носимых устройств')}`)
  p(`- ${t('Из Apple Health импортируются 14 показателей: шаги, дистанция, активные калории, минуты упражнений, этажи, пульс (средний, покоя, при ходьбе), HRV, SpO₂, частота дыхания, температура запястья, VO₂max и сон. Тренировки, события пульса, ЭКГ и метрики походки не импортируются.')}`)
  // The "Пациент" label belongs to the blank line the doctor fills in by hand;
  // once the age is known the line names what it actually carries.
  p(model.patient.age != null
    ? `- **${t('Возраст (по году рождения)')}:** ${model.patient.age}${model.patient.sex ? ` · ${t('Пол')}: ${t(model.patient.sex === 'male' ? 'мужской' : 'женский')}` : ''}`
    : `- **${t('Пациент')}:** ________________`)
  p()
  p(`> ${t('Это не медицинские измерения. Значения собраны бытовым носимым устройством, точность ниже клинической, часть дней может отсутствовать. Отчёт содержит только измеренные значения и не содержит диагнозов.')}`)
  p()

  if (model.scores.length) {
    p(`## ${t('Оценки Tonus (0–100, расчёт приложения)')}`)
    p()
    table(
      [t('Оценка'), t('Среднее за период'), t('Начало периода'), t('Конец периода'), t('Тренд'), t('Дней с данными')],
      model.scores.map(s => [
        t(s.label),
        String(s.avg),
        s.first != null ? String(s.first) : dash,
        s.last != null ? String(s.last) : dash,
        scoreTrendText(s, t),
        `${s.days} ${t('из')} ${model.period.calendarDays}`,
      ]),
    )
    p(t('Сон: часы сна к 8 ч; 8 ч и больше — 100.'))
    p(t('Восстановление: HRV к личной базе (вес 60%) и пульс покоя к личной базе (вес 40%). База — скользящее среднее за 30 дней.'))
    p(t('Если одного из показателей не хватает, вес пересчитывается на оставшиеся: день с одним лишь пульсом покоя (без HRV) всё равно даёт оценку восстановления.'))
    p()
  }

  if (model.metrics.length) {
    p(`## ${t('Метрики за период')}`)
    p()
    const rows = model.metrics.map(m => [
      t(m.label), m.avg.toFixed(m.digits), m.min.toFixed(m.digits), m.max.toFixed(m.digits),
      baselineCell(m, t),
      `${m.daysWithData} ${t('из')} ${m.daysInPeriod}`,
      `${t(BAND_TEXT[m.reliability.band])}${m.reliability.maxGap > 1 ? `, ${t('макс. пробел')} ${m.reliability.maxGap} ${t('дн.')}` : ''}`,
    ])
    if (model.sleep?.bedtime) {
      const b = model.sleep.bedtime
      rows.push([t('Время отбоя (медиана)'), b.median, `${t('половина ночей')} ${b.q1}–${b.q3}`, dash, dash,
        `${b.count} ${t('из')} ${model.period.calendarDays}`, dash])
    }
    if (model.sleep?.wake) {
      const w = model.sleep.wake
      rows.push([t('Время подъёма (медиана)'), w.median, `${t('половина ночей')} ${w.q1}–${w.q3}`, dash, dash,
        `${w.count} ${t('из')} ${model.period.calendarDays}`, dash])
    }
    table([t('Метрика'), t('Среднее'), t('Мин'), t('Макс'), t('Личная норма (медиана и обычный диапазон)'), t('Дней с данными'), t('Надёжность')], rows)
    p(t('«Личная норма» — медиана за 28 дней до начала периода и её межквартильный диапазон. Считается только при покрытии от 60% и минимум 14 днях в этом окне. Оценки Tonus выше используют другую базу — скользящее среднее за 30 дней.'))
    p()
  }

  if (model.weekly.rows.length > 1) {
    p(`## ${t('Динамика по неделям')}`)
    p()
    table(
      [t('Неделя с'), ...model.weekly.keys.map(k => t(LABELS.get(k) ?? k))],
      model.weekly.rows.map(r => [
        r.weekStart,
        ...model.weekly.keys.map(k => {
          const v = r.values[k]
          return v == null ? dash : `${v.toFixed(DIGITS.get(k) ?? 1)} (${r.counts[k]})`
        }),
      ]),
    )
    p()
    p(t('В скобках — сколько дней этой метрики стоит за средним: недели различаются по покрытию, и одно число на всю строку вводило бы в заблуждение. Пустая ячейка — данных меньше трёх дней.'))
  }

  if (model.sleep) {
    const s = model.sleep
    p(`## ${t('Сон по дням')}`)
    p()
    p(t('Все ночи периода без агрегации. В таблице только измеренные значения: доли фаз считаются от общего сна за ночь; время, не отнесённое ни к одной фазе, показано отдельной колонкой.'))
    p()
    table(
      [t('Дата'), t('День'), t('Отбой'), t('Подъём'), t('Сон, ч'), t('Глубокий, ч'),
        t('REM, ч'), t('Лёгкий, ч'), t('Не классифицировано, ч'), t('Глубокий, %'), t('REM, %'), t('Тип')],
      s.nights.map(n => [
        n.date, t(n.weekday),
        n.bedtime ? n.bedtime + (n.bedtimeDate ? ` (${n.bedtimeDate})` : '') + (n.suspicious ? ' ⚠' : '') : dash,
        n.wakeTime ? n.wakeTime + (n.wakeDate ? ` (${n.wakeDate})` : '') + (n.suspicious ? ' ⚠' : '') : dash,
        n.hours.toFixed(1),
        n.deep?.toFixed(1) ?? dash, n.rem?.toFixed(1) ?? dash, n.core?.toFixed(1) ?? dash,
        n.unclassified != null ? n.unclassified.toFixed(1) : dash,
        n.deepPct != null ? `${n.deepPct}%` : dash,
        n.remPct != null ? `${n.remPct}%` : dash,
        n.daytime ? t('дневной эпизод') : '',
      ]),
    )
    p(`${t('Ночей в периоде')}: ${s.total}. ${t('Короче 6 ч')}: ${s.under6}. ${t('От 8 ч')}: ${s.over8}. ${t('Без записи ночного сна')}: ${s.missing}. ${t('Дневных эпизодов')}: ${s.daytimeCount}.`)
    p()
    if (s.daytimeCount > 0) {
      p(t('Дневные эпизоды (короче 3 ч, начались между 08:00 и 20:00) показаны в таблице, но не входят в подсчёт ночей, в средние времена и в оценку сна.'))
      p()
    }
    if (s.suspiciousNights) {
      p(`${t('Ночей, где промежуток между отбоем и подъёмом не может вместить записанный сон')} (⚠): ${s.suspiciousNights}. ${t('Такой промежуток длиннее 16 часов, равен нулю или короче самого сна — источник склеил или разорвал сессию. Длительность сна в этих строках остаётся измеренной, а отбой и подъём доверия не заслуживают и в средние времена не входят.')}`)
      p()
    }
    if (s.phasesOverTotal > 0) {
      p(`${t('Ночей, где сумма фаз больше общего сна')}: ${s.phasesOverTotal}. ${t('Источник записал фазы и общий сон независимо; значения показаны как есть, без правки.')}`)
      p()
    }
    if (s.phaseCoveragePct != null) {
      p(`${t('Разложено по фазам')}: ${s.phaseCoveragePct}% ${t('измеренного ночного сна. Остальное время источник записал как сон, но не отнёс ни к одной фазе.')}`)
      p()
    }
  }

  p(`## ${t('Покрытие данных и пробелы')}`)
  p()
  if (model.coverage.gaps.length) {
    p(`${t('Метрики с существенными пропусками')}:`)
    p()
    for (const g of model.coverage.gaps) {
      p(`- ${t(g.label)}: ${g.daysWithData} ${t('из')} ${g.daysInPeriod} ${t('дней')} (${t('пропущено')} ${g.missingPct}%)`)
    }
    p()
  } else {
    p(t('Существенных пропусков по метрикам нет: каждая метрика покрывает не менее 90% дней периода.'))
    p()
  }
  if (model.coverage.missingDates.length) {
    p(`${t('Дней без единой записи')}: ${model.coverage.missingDates.length} (${model.coverage.missingDates.join(', ')}).`)
  } else {
    p(t('Дней без единой записи нет — период покрыт полностью.'))
  }
  p()

  if (model.deviations.length) {
    p(`## ${t('Отклонения, замеченные в периоде')}`)
    p()
    p(t('Полные недели (от 5 дней с данными), где среднее ушло от медианы недель дальше 2 MAD и дальше порога, своего для каждой метрики. Только факт отклонения, без интерпретации.'))
    p()
    for (const w of model.deviations) {
      p(`**${t('Неделя с')} ${w.weekStart}** (${w.days} ${t('дн. с данными')}):`)
      for (const d of w.items) {
        const dir = d.relPct > 0 ? t('выше') : t('ниже')
        p(`- ${t(d.label)} — ${d.weekMean.toFixed(d.digits)} ${t('против')} ${d.median.toFixed(d.digits)} ${t('по медиане недель')} (${dir} ${t('на')} ${Math.abs(d.relPct)}%)`)
      }
      p()
    }
  }

  if (model.labs.lines.length) {
    p(`## ${t('Анализы')}`)
    p()
    table(
      [t('Показатель'), t('Значение'), t('Реф. диапазон'), t('Статус'), t('Предыдущее'), t('Динамика'), t('Дата')],
      model.labs.lines.map(l => [
        l.marker,
        `${l.value}${l.unit ? ` ${l.unit}` : ''}`,
        l.refRange ?? dash,
        labStatusCell(l, t),
        l.prevValue != null ? `${l.prevValue} (${labDateCell(l.prevDate, l.prevPrecision ?? 'unknown', t)})` : dash,
        l.delta != null
          ? `${signed(l.delta, Number.isInteger(l.delta) ? 0 : 1)} ${t('к')} ${labDateCell(l.prevDate, l.prevPrecision ?? 'unknown', t)}`
          : l.prevValue != null ? t(LAB_ORDER_UNKNOWN) : dash,
        labDateCell(l.date, l.datePrecision, t),
      ]),
    )
    if (model.labs.outOfPeriod.length) {
      p(`${t('Последнее измерение раньше периода отчёта')}: ${model.labs.outOfPeriod.join(', ')}.`)
    } else {
      p(t('Все показатели сданы внутри периода отчёта.'))
    }
    p()
    p(t(LAB_UNIT_CAVEAT))
    p(t(LAB_DATE_CAVEAT))
    if (model.labs.unidentifiedMarkers > 0) {
      p(`${t(LAB_UNIDENTIFIED)}: ${model.labs.unidentifiedMarkers}. ${t('Они показаны под собственными названиями и ни с чем не объединяются.')}`)
    }
    p()

    if (model.labs.series.length) {
      p(`### ${t('Все измерения по показателям')}`)
      p()
      table(
        [t('Показатель'), t('Все значения по датам (от старых к новым)'), t('Реф. диапазон')],
        model.labs.series.map(s => [
          s.marker,
          `${s.points.map(pt => `${labDateCell(pt.date, pt.precision, t)}: ${pt.value}`).join(' → ')}${s.unit ? ` ${s.unit}` : ''}`,
          s.refRange ?? dash,
        ]),
      )
    }
    p(`${t('Всего измерений в базе')}: ${model.labs.totalMeasurements} ${t('по')} ${model.labs.markerCount} ${t('показателям')}.`)
    p()
  }

  if (model.supplements.length) {
    p(`## ${t('Добавки и приём')}`)
    p()
    table(
      [t('Название'), t('Доза'), t('Статус'), t('Приём с'), t('Доля дней с отметкой')],
      model.supplements.map(s => [
        s.name,
        s.dose ? `${s.dose}${s.unit ? ` ${s.unit}` : ''}` : dash,
        s.active ? t('принимает') : t('не принимает'),
        s.firstIntake ?? dash,
        s.pct != null ? `${s.pct}% (${s.taken} ${t('из')} ${s.windowDays} ${t('дней')})` : dash,
      ]),
    )
    p(t('Показана доля дней с отметкой о приёме, считая от первого отмеченного приёма внутри периода. Отсутствие отметки не означает, что приём не состоялся.'))
    p()
  }

  if (model.intake.length) {
    p(`## ${t('Отмеченный приём (со слов пациента)')}`)
    p()
    table(
      [t('Тип'), t('Дней с отметками'), t('Всего отметок'), t('Медиана за день с отметкой'), t('Типичное время')],
      model.intake.map(l => [
        t(INTAKE_LABELS[l.type]),
        `${l.days} ${t('из')} ${l.calendarDays}`,
        String(l.events),
        l.medianPerDay != null ? `${l.medianPerDay}${l.unit ? ` ${l.unit}` : ''}` : dash,
        l.time ? `${l.time.median} · ${t('половина')} ${l.time.q1}–${l.time.q3}` : dash,
      ]),
    )
    p()
    for (const l of model.intake) {
      if (!l.names.length) continue
      const named = l.names.map(n => `${n.name ?? t('без названия')} — ${n.count}`).join(', ')
      p(`${t(INTAKE_LABELS[l.type])}: ${named}.`)
    }
    p(t('Это отметки пациента в приложении, а не измерения. Отсутствие отметки не означает, что приёма не было, а доза — введённое пациентом значение, а не измеренный объём. Постоянный приём добавок — в предыдущей секции.'))
    p()
  }

  if (model.nutrition) {
    const n = model.nutrition
    p(`## ${t('Питание и вода')}`)
    p()
    p(`${t('Приёмы пищи отмечены в')} ${n.days} ${t('из')} ${n.calendarDays} ${t('дней периода')}, ${t('всего отметок')}: ${n.meals}.`)
    const macros = nutritionMacroRows(n, t)
    if (macros.length) {
      p()
      p(`${t('Калории заполнены в')} ${n.macroDays} ${t('из')} ${n.days} ${t('дней с отметками о еде')}.`)
      p()
      table([t('Показатель'), t('Медиана за день с отметкой')], macros)
    } else {
      p()
      p(t('Калории и макронутриенты не заполнены ни в одной записи — ниже только сами приёмы пищи.'))
      p()
    }
    if (n.mealTime) {
      p(`${t('Типичное время приёма пищи')}: ${n.mealTime.median} · ${t('половина')} ${n.mealTime.q1}–${n.mealTime.q3}.`)
      p()
    }
    if (n.water) {
      p(`${t('Вода')}: ${t('отмечена в')} ${n.water.days} ${t('из')} ${n.calendarDays} ${t('дней')}${n.water.medianMl != null ? `, ${t('медиана за день с отметкой')} ${n.water.medianMl} ${t('мл')}` : ''}.`)
      p()
    }
    if (n.list.length) {
      p(`### ${t('Записи о приёмах пищи')}`)
      p()
      table(
        [t('Дата'), t('Время'), t('Что'), t('Ккал'), t('Белки, г'), t('Жиры, г'), t('Углеводы, г')],
        n.list.map(m => [
          m.date, m.time, m.note ?? dash,
          m.calories != null ? String(m.calories) : dash,
          m.protein_g != null ? String(m.protein_g) : dash,
          m.fat_g != null ? String(m.fat_g) : dash,
          m.carbs_g != null ? String(m.carbs_g) : dash,
        ]),
      )
    }
    p(t(NUTRITION_CAVEAT))
    p()
  }

  if (model.concerns.length) {
    p(`## ${t('Проблемы и жалобы')}`)
    p()
    for (const c of model.concerns) {
      p(`### ${c.name}`)
      p()
      const head = [`${t('Категория')}: ${c.category}`]
      if (c.startedAt) head.push(`${t('с')} ${c.startedAt}`)
      head.push(`${t('статус')}: ${t(STATUS_TEXT[c.status] ?? c.status)}`)
      p(`- ${head.join(' · ')}`)
      if (c.note) p(`- ${t('Заметка')}: ${c.note}`)
      if (c.severity) {
        p(`- ${t('Тяжесть (шкала 1–5, самооценка)')}: ${c.severity.count} ${t('записей')}, ${t('среднее')} ${c.severity.avg}; ${t('первая половина периода')} ${c.severity.firstHalf} → ${t('вторая')} ${c.severity.secondHalf}`)
      }
      if (c.recentLogs.length) {
        p(`- ${t('Последние записи')}:`)
        for (const l of c.recentLogs) {
          const sev = l.severity != null ? ` (${t('тяжесть')} ${l.severity}/5)` : ''
          p(`  - ${l.date}${sev}: ${l.note}`)
        }
      }
      p()
    }
  }

  if (model.journal.wellbeingCount || model.journal.notes.length) {
    p(`## ${t('Самочувствие и дневник')}`)
    p()
    if (model.journal.wellbeingAvg != null) {
      p(`${t('Самооценка самочувствия (1–5)')}: ${model.journal.wellbeingCount} ${t('записей')}, ${t('среднее')} ${model.journal.wellbeingAvg}.`)
      p()
    }
    if (model.journal.weeks.length) {
      table(
        [t('Неделя с'), t('Самочувствие'), t('Записей')],
        model.journal.weeks.map(w => [w.weekStart, String(w.avg), String(w.count)]),
      )
    }
    if (model.journal.notes.length) {
      p(`${t('Записи пациента (последние 12)')}:`)
      p()
      for (const n of model.journal.notes) {
        const wb = n.wellbeing != null ? ` [${t('самочувствие')} ${n.wellbeing}/5]` : ''
        p(`- ${n.date}${wb}: ${n.note}`)
      }
      p()
    }
  }

  p(`## ${t('Чего в этих данных нет')}`)
  p()
  for (const line of MISSING_LINES) p(`- ${t(line)}`)
  p()

  return L.join('\n')
}
