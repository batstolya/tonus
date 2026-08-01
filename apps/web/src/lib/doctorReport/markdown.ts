import { translations } from '../translations'
import { METRIC_DEFS, type MetricSummary } from './metrics'
import { BAND_TEXT, POSITION_TEXT } from './reliability'
import type { DoctorReportModel } from './model'

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
 * The markdown twin of the printed page: same model, same sections, same
 * order. Russian keys pass through the dictionary for the en report.
 */
export function toMarkdown(model: DoctorReportModel, lang: 'ru' | 'en'): string {
  const t = (key: string) => (lang === 'ru' ? key : translations[key]?.en ?? key)
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
  p(model.patient.age != null
    ? `- **${t('Пациент')}:** ${t('Возраст (по году рождения)')}: ${model.patient.age}${model.patient.sex ? ` · ${t('Пол')}: ${t(model.patient.sex === 'male' ? 'Мужской' : 'Женский')}` : ''}`
    : `- **${t('Пациент')}:** ________________`)
  p()
  p(`> ${t('Это не медицинские измерения. Значения собраны бытовым носимым устройством, точность ниже клинической, часть дней может отсутствовать. Отчёт содержит только измеренные значения и не содержит диагнозов.')}`)
  p()

  if (model.scores.length) {
    p(`## ${t('Оценки Tonus (0–100, расчёт приложения)')}`)
    p()
    table(
      [t('Оценка'), t('Среднее за период'), t('Начало периода'), t('Конец периода'), t('Тренд')],
      model.scores.map(s => {
        const delta = s.last - s.first
        // Below one point the arrow would dramatise rounding noise.
        const trend = Math.abs(delta) < 1
          ? t('без изменений')
          : `${delta > 0 ? '↑' : '↓'} ${signed(delta)}`
        return [t(s.label), String(s.avg), String(s.first), String(s.last), trend]
      }),
    )
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
    if (model.avgBedtime) rows.push([t('Время отбоя (среднее)'), model.avgBedtime, dash, dash, dash, dash, dash])
    if (model.avgWakeTime) rows.push([t('Время подъёма (среднее)'), model.avgWakeTime, dash, dash, dash, dash, dash])
    table([t('Метрика'), t('Среднее'), t('Мин'), t('Макс'), t('Личная норма (медиана и обычный диапазон)'), t('Дней с данными'), t('Надёжность')], rows)
    p(t('«Личная норма» — медиана за 28 дней до начала периода и её межквартильный диапазон. Считается только при покрытии от 60% и минимум 14 днях в этом окне. Оценки Tonus выше используют другую базу — скользящее среднее за 30 дней.'))
    p()
  }

  if (model.weekly.rows.length) {
    p(`## ${t('Динамика по неделям')}`)
    p()
    table(
      [t('Неделя с'), ...model.weekly.keys.map(k => t(LABELS.get(k) ?? k)), t('Дней')],
      model.weekly.rows.map(r => [
        r.weekStart,
        ...model.weekly.keys.map(k => {
          const v = r.values[k]
          return v == null ? dash : v.toFixed(DIGITS.get(k) ?? 1)
        }),
        String(r.days),
      ]),
    )
  }

  if (model.sleep) {
    const s = model.sleep
    p(`## ${t('Сон по дням')}`)
    p()
    p(t('Все ночи периода без агрегации. В таблице только измеренные значения: доли фаз — арифметика от них же, производных показателей нет.'))
    p()
    table(
      [t('Дата'), t('День'), t('Отбой'), t('Подъём'), t('Сон, ч'), t('Глубокий, ч'),
        t('REM, ч'), t('Лёгкий, ч'), t('Глубокий, %'), t('REM, %')],
      s.nights.map(n => [
        n.date, t(n.weekday), n.bedtime ?? dash, n.wakeTime ?? dash, n.hours.toFixed(1),
        n.deep?.toFixed(1) ?? dash, n.rem?.toFixed(1) ?? dash, n.core?.toFixed(1) ?? dash,
        n.deepPct != null ? `${n.deepPct}%` : dash,
        n.remPct != null ? `${n.remPct}%` : dash,
      ]),
    )
    p(`${t('Ночей в периоде')}: ${s.total}. ${t('Короче 6 ч')}: ${s.under6}. ${t('От 8 ч')}: ${s.over8}. ${t('Без записи сна')}: ${s.missing}.`)
    p()
    if (s.implausible) {
      p(`${t('Ночей, где между отбоем и подъёмом прошло меньше времени, чем длился сон')}: ${s.implausible}. ${t('Время пробуждения в этих строках записано источником неверно; значения показаны как есть, без правки.')}`)
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
      [t('Показатель'), t('Значение'), t('Реф. диапазон'), t('Вне нормы'), t('Предыдущее'), t('Динамика'), t('Дата')],
      model.labs.lines.map(l => [
        l.marker,
        `${l.value}${l.unit ? ` ${l.unit}` : ''}`,
        l.refRange ?? dash,
        l.flag === '↑' ? t('выше нормы') : l.flag === '↓' ? t('ниже нормы') : t('в норме'),
        l.prevValue != null ? `${l.prevValue} (${l.prevDate})` : dash,
        l.delta != null ? `${signed(l.delta, Number.isInteger(l.delta) ? 0 : 1)} ${t('к')} ${l.prevDate}` : dash,
        l.date,
      ]),
    )
    if (model.labs.outOfPeriod.length) {
      p(`${t('Последнее измерение раньше периода отчёта')}: ${model.labs.outOfPeriod.join(', ')}.`)
    } else {
      p(t('Все показатели сданы внутри периода отчёта.'))
    }
    p()

    if (model.labs.series.length) {
      p(`### ${t('Все измерения по показателям')}`)
      p()
      table(
        [t('Показатель'), t('Все значения по датам (от старых к новым)'), t('Реф. диапазон')],
        model.labs.series.map(s => [
          s.marker,
          `${s.points.map(pt => `${pt.date}: ${pt.value}`).join(' → ')}${s.unit ? ` ${s.unit}` : ''}`,
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
      [t('Название'), t('Доза'), t('Статус'), t('Приём с'), t('Соблюдение в периоде')],
      model.supplements.map(s => [
        s.name,
        s.dose ? `${s.dose}${s.unit ? ` ${s.unit}` : ''}` : dash,
        s.active ? t('принимает') : t('не принимает'),
        s.firstIntake ?? dash,
        s.pct != null ? `${s.pct}% (${s.taken} ${t('из')} ${s.windowDays} ${t('дней')})` : dash,
      ]),
    )
    p(t('Соблюдение считается от первого отмеченного приёма внутри периода, а не от всей длины периода.'))
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
  for (const line of [
    'Артериального давления, веса, роста, температуры тела',
    'Диагнозов, назначений врача и рецептурных препаратов (учитываются только добавки, отмеченные пациентом)',
    'Питания и алкоголя',
    'ЭКГ, аритмий и любых клинических измерений',
    'Всё перечисленное отсутствует, а не равно нулю: не делай выводов о том, чего здесь нет.',
  ]) p(`- ${t(line)}`)
  p()

  return L.join('\n')
}
