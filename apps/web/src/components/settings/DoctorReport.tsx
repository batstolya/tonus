import type { User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import type { DailyMetrics } from '../../types'
import {
  METRIC_DEFS, buildReportModel, loadReportSources, periodStart, localDate, toMarkdown, baselineCell,
  scoreTrendText, BAND_TEXT, labStatusCell, LAB_UNIT_CAVEAT, LAB_DATE_CAVEAT,
  type DoctorReportModel, type ReportSources,
} from '../../lib/doctorReport'
import { isUnlocked } from '../../lib/privacy'
import { callFunction } from '../../lib/edgeFunctions'
import { translations } from '../../lib/translations'
import { useT } from '../../lib/i18n'

// «Отчёт для врача» (SPEC-DOCTOR-REPORT, ревизия v2): экран подготовки +
// печатное представление. Тело отчёта — только измеренные значения; ИИ-блок
// вопросов опционален и визуально отделён. Язык отчёта (ru/en) не зависит от
// языка интерфейса. Печать и markdown рендерятся из одной модели.

type SectionKey = 'metrics' | 'sleep' | 'labs' | 'supplements' | 'concerns' | 'journal' | 'ai'

interface Props {
  user?: User
  daily: DailyMetrics[]
  onClose: () => void
}

const EMPTY_SOURCES: ReportSources = {
  labs: [], supplements: [], supplementLogs: [], concerns: [], concernLogs: [], notes: [],
  profile: null,
}

const STATUS_TEXT: Record<string, string> = {
  active: 'активна', improving: 'улучшается', resolved: 'разрешилась',
}

const MISSING_LINES = [
  'Артериального давления, веса, роста, температуры тела',
  'Диагнозов, назначений врача и рецептурных препаратов (учитываются только добавки, отмеченные пациентом)',
  'Питания и алкоголя',
  'ЭКГ, аритмий и любых клинических измерений',
  'Всё перечисленное отсутствует, а не равно нулю: не делай выводов о том, чего здесь нет.',
]

const dash = '—'
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`
const METRIC_LABELS = new Map(METRIC_DEFS.map(m => [m.key, m.label]))

export function DoctorReport({ user, daily, onClose }: Props) {
  const { t } = useT()
  const [stage, setStage] = useState<'setup' | 'preview'>('setup')
  const [period, setPeriod] = useState<30 | 90 | 365>(90)
  const [lang, setLang] = useState<'ru' | 'en'>('ru')
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({
    metrics: true, sleep: true, labs: true, supplements: true, concerns: true, journal: true, ai: false,
  })
  const [sources, setSources] = useState<ReportSources>(EMPTY_SOURCES)
  const [pickedConcerns, setPickedConcerns] = useState<Set<string>>(new Set())
  const [aiQuestions, setAiQuestions] = useState<string[] | null>(null)
  const [building, setBuilding] = useState(false)
  const [aiError, setAiError] = useState(false)
  const [copied, setCopied] = useState(false)

  // Язык отчёта: ru — исходные ключи, en — словарь переводов.
  const rt = (key: string) => (lang === 'ru' ? key : translations[key]?.en ?? key)

  // Источники грузятся один раз на самый широкий период, поэтому переключение
  // 30/90/365 пересобирает модель без повторного запроса.
  useEffect(() => {
    loadReportSources(user?.id ?? '', periodStart(365))
      .then(s => {
        setSources(s)
        // приватные — вне отчёта по умолчанию (и вне списка выбора без PIN)
        setPickedConcerns(new Set(s.concerns.filter(c => !c.is_private).map(c => c.id)))
      })
      .catch(() => setSources(EMPTY_SOURCES))
  }, [user])

  const visibleConcerns = sources.concerns.filter(c => !c.is_private || isUnlocked())

  const model: DoctorReportModel = buildReportModel({
    daily, sources, periodDays: period, today: localDate(), pickedConcernIds: pickedConcerns,
  })

  async function copyForAi() {
    await navigator.clipboard.writeText(toMarkdown(model, lang))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function build() {
    setBuilding(true)
    setAiError(false)
    if (sections.ai) {
      try {
        const res = await callFunction<{ questions: string[] }>('analyze-health', {
          digest: toMarkdown(model, lang),
          periodStart: model.period.start,
          periodEnd: model.period.end,
          mode: 'doctor-questions',
          lang,
        })
        setAiQuestions(res.questions ?? [])
      } catch {
        setAiQuestions(null)
        setAiError(true)
      }
    } else {
      setAiQuestions(null)
    }
    setBuilding(false)
    setStage('preview')
  }

  if (stage === 'setup') {
    return (
      <div className="dr-setup">
        <h2>{t('Отчёт для врача')}</h2>
        <p className="dr-setup-hint">{t('Печатная сводка данных для приёма: метрики, анализы, добавки. Факты без интерпретаций.')}</p>

        <div className="dr-setup-row">
          <span>{t('Период, дней')}</span>
          {([30, 90, 365] as const).map(p => (
            <button key={p} className={period === p ? 'dr-chip dr-chip-on' : 'dr-chip'} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>

        <div className="dr-setup-row">
          <span>{t('Язык отчёта')}</span>
          {(['ru', 'en'] as const).map(l => (
            <button key={l} className={lang === l ? 'dr-chip dr-chip-on' : 'dr-chip'} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>

        <div className="dr-setup-sections">
          <span>{t('Секции отчёта')}</span>
          {([
            ['metrics', t('Метрики за период')],
            ['sleep', t('Сон по дням')],
            ['labs', t('Анализы')],
            ['supplements', t('Добавки и приём')],
            ['concerns', t('Проблемы')],
            ['journal', t('Самочувствие и дневник')],
            ['ai', t('Вопросы для обсуждения (ИИ)')],
          ] as [SectionKey, string][]).map(([key, label]) => (
            <label key={key} className="dr-check">
              <input type="checkbox" checked={sections[key]}
                onChange={e => setSections(s => ({ ...s, [key]: e.target.checked }))} />
              {label}
            </label>
          ))}
        </div>

        {sections.concerns && visibleConcerns.length > 0 && (
          <div className="dr-setup-sections">
            <span>{t('Какие проблемы включить')}</span>
            {visibleConcerns.map(c => (
              <label key={c.id} className="dr-check">
                <input type="checkbox" checked={pickedConcerns.has(c.id)}
                  onChange={e => setPickedConcerns(prev => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(c.id); else next.delete(c.id)
                    return next
                  })} />
                {c.name}
              </label>
            ))}
            {sources.concerns.some(c => c.is_private) && !isUnlocked() && (
              <p className="dr-setup-hint">{t('Приватные проблемы скрыты — разблокируй их PIN-кодом на экране «Проблемы», если нужно включить')}</p>
            )}
          </div>
        )}

        <div className="dr-setup-actions">
          <button className="dr-btn" onClick={onClose}>{t('Назад')}</button>
          <button className="dr-btn dr-btn-primary" onClick={build} disabled={building}>
            {building ? t('Формирую…') : t('Сформировать')}
          </button>
        </div>
      </div>
    )
  }

  // ── Печатное представление ──────────────────────────────────────────────────
  const { scores, metrics, weekly, sleep, coverage, deviations, labs, supplements, concerns, journal } = model

  return (
    <div className="dr-print-root">
      <div className="dr-toolbar">
        <button className="dr-btn" onClick={() => setStage('setup')}>{t('Назад')}</button>
        <button className="dr-btn" onClick={copyForAi}>
          {copied ? t('Скопировано') : t('Скопировать для ИИ')}
        </button>
        <button className="dr-btn dr-btn-primary" onClick={() => window.print()}>{t('Печать')}</button>
      </div>
      {aiError && <p className="dr-ai-error">{t('Не удалось получить ИИ-вопросы — отчёт сформирован без них')}</p>}

      <div className="dr-doc">
        <h1>{rt('Сводка данных здоровья')}</h1>
        <p className="dr-meta">
          {rt('Период')}: {model.period.effectiveStart} — {model.period.end} · {rt('Сформировано')}: {model.period.end}
        </p>
        <p className="dr-meta">
          {rt('Качество данных')}: {rt('календарных дней')} {model.period.calendarDays} · {rt('дней хотя бы с одной записью')} {model.period.daysWithAnyRecord} · {rt('полностью пустых дней')} {model.period.emptyDays}
        </p>
        {model.period.clamped && (
          <p className="dr-meta">
            {rt('Запрошенный период')}: {model.period.nominalDays} {rt('дней')}, {rt('но данные начинаются')} {model.period.effectiveStart} — {rt('знаменатель считается от этой даты')}
          </p>
        )}
        <p className="dr-meta">
          {model.patient.age != null
            ? `${rt('Пациент')}: ${rt('Возраст (по году рождения)')}: ${model.patient.age}${model.patient.sex ? ` · ${rt('Пол')}: ${rt(model.patient.sex === 'male' ? 'Мужской' : 'Женский')}` : ''}`
            : `${rt('Пациент')}: ________________`}
        </p>
        <p className="dr-disclaimer">{rt('Это не медицинские измерения. Значения собраны бытовым носимым устройством, точность ниже клинической, часть дней может отсутствовать. Отчёт содержит только измеренные значения и не содержит диагнозов.')}</p>

        {sections.metrics && scores.length > 0 && (
          <section>
            <h2>{rt('Оценки Tonus (0–100, расчёт приложения)')}</h2>
            <table>
              <thead><tr>
                <th>{rt('Оценка')}</th><th>{rt('Среднее за период')}</th>
                <th>{rt('Начало периода')}</th><th>{rt('Конец периода')}</th>
                <th>{rt('Тренд')}</th><th>{rt('Дней с данными')}</th>
              </tr></thead>
              <tbody>
                {scores.map(s => (
                  <tr key={s.key}>
                    <td>{rt(s.label)}</td><td>{s.avg}</td>
                    <td>{s.first ?? dash}</td><td>{s.last ?? dash}</td>
                    <td>{scoreTrendText(s, rt)}</td><td>{s.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="dr-note">{rt('Сон: часы сна к 8 ч; 8 ч и больше — 100.')}</p>
            <p className="dr-note">{rt('Восстановление: HRV к личной базе (вес 60%) и пульс покоя к личной базе (вес 40%). База — скользящее среднее за 30 дней.')}</p>
            <p className="dr-note">{rt('Оценки считаются только по дням, где есть исходные данные: день без HRV не занижает восстановление, он в него не входит.')}</p>
          </section>
        )}

        {sections.metrics && metrics.length > 0 && (
          <section>
            <h2>{rt('Метрики за период')}</h2>
            <table>
              <thead><tr>
                <th>{rt('Метрика')}</th><th>{rt('Среднее')}</th><th>{rt('Мин')}</th>
                <th>{rt('Макс')}</th><th>{rt('Личная норма (медиана и обычный диапазон)')}</th><th>{rt('Дней с данными')}</th>
                <th>{rt('Надёжность')}</th>
              </tr></thead>
              <tbody>
                {metrics.map(m => (
                  <tr key={m.key}>
                    <td>{rt(m.label)}</td>
                    <td>{m.avg.toFixed(m.digits)}</td>
                    <td>{m.min.toFixed(m.digits)}</td>
                    <td>{m.max.toFixed(m.digits)}</td>
                    <td>{baselineCell(m, rt)}</td>
                    <td>{m.daysWithData} {rt('из')} {m.daysInPeriod}</td>
                    <td>
                      {rt(BAND_TEXT[m.reliability.band])}
                      {m.reliability.maxGap > 1 ? `, ${rt('макс. пробел')} ${m.reliability.maxGap} ${rt('дн.')}` : ''}
                    </td>
                  </tr>
                ))}
                {sleep?.bedtime && (
                  <tr><td>{rt('Время отбоя (медиана)')}</td><td>{sleep.bedtime.median}</td>
                    <td>{rt('половина ночей')} {sleep.bedtime.q1}–{sleep.bedtime.q3}</td>
                    <td>{dash}</td><td>{dash}</td><td>{dash}</td><td>{dash}</td></tr>
                )}
                {sleep?.wake && (
                  <tr><td>{rt('Время подъёма (медиана)')}</td><td>{sleep.wake.median}</td>
                    <td>{rt('половина ночей')} {sleep.wake.q1}–{sleep.wake.q3}</td>
                    <td>{dash}</td><td>{dash}</td><td>{dash}</td><td>{dash}</td></tr>
                )}
              </tbody>
            </table>
            <p className="dr-note">{rt('«Личная норма» — медиана за 28 дней до начала периода и её межквартильный диапазон. Считается только при покрытии от 60% и минимум 14 днях в этом окне. Оценки Tonus выше используют другую базу — скользящее среднее за 30 дней.')}</p>

            {weekly.rows.length > 1 && (
              <>
                <h3>{rt('Динамика по неделям')}</h3>
                <table>
                  <thead><tr>
                    <th>{rt('Неделя с')}</th>
                    {weekly.keys.map(k => <th key={k}>{rt(METRIC_LABELS.get(k) ?? k)}</th>)}
                    <th>{rt('Дней')}</th>
                  </tr></thead>
                  <tbody>
                    {weekly.rows.map(w => (
                      <tr key={w.weekStart}>
                        <td>{w.weekStart}</td>
                        {weekly.keys.map(k => <td key={k}>{w.values[k] ?? dash}</td>)}
                        <td>{w.days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        )}

        {sections.sleep && sleep && (
          <section>
            <h2>{rt('Сон по дням')}</h2>
            <p className="dr-note">{rt('Все ночи периода без агрегации. В таблице только измеренные значения: доли фаз — арифметика от них же, производных показателей нет.')}</p>
            <table className="dr-sleep-table">
              <thead><tr>
                <th>{rt('Дата')}</th><th>{rt('День')}</th><th>{rt('Отбой')}</th><th>{rt('Подъём')}</th>
                <th>{rt('Сон, ч')}</th><th>{rt('Глубокий, ч')}</th><th>{rt('REM, ч')}</th>
                <th>{rt('Лёгкий, ч')}</th><th>{rt('Глубокий, %')}</th><th>{rt('REM, %')}</th><th>{rt('Тип')}</th>
              </tr></thead>
              <tbody>
                {sleep.nights.map(n => (
                  <tr key={n.date}>
                    <td>{n.date}</td><td>{rt(n.weekday)}</td>
                    <td>{n.bedtime ? n.bedtime + (n.bedtimeDate ? ` (${n.bedtimeDate})` : '') : dash}</td>
                    <td>{n.wakeTime ? n.wakeTime + (n.wakeDate ? ` (${n.wakeDate})` : '') : dash}</td>
                    <td>{n.hours.toFixed(1)}</td>
                    <td>{n.deep?.toFixed(1) ?? dash}</td>
                    <td>{n.rem?.toFixed(1) ?? dash}</td>
                    <td>{n.core?.toFixed(1) ?? dash}</td>
                    <td>{n.deepPct != null ? `${n.deepPct}%` : dash}</td>
                    <td>{n.remPct != null ? `${n.remPct}%` : dash}</td>
                    <td>{n.daytime ? rt('дневной эпизод') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="dr-note">
              {rt('Ночей в периоде')}: {sleep.total}. {rt('Короче 6 ч')}: {sleep.under6}. {rt('От 8 ч')}: {sleep.over8}. {rt('Без записи ночного сна')}: {sleep.missing}. {rt('Дневных эпизодов')}: {sleep.daytimeCount}.
            </p>
            {sleep.daytimeCount > 0 && (
              <p className="dr-note">
                {rt('Дневные эпизоды (короче 3 ч, начались между 08:00 и 20:00) показаны в таблице, но не входят в подсчёт ночей, в средние времена и в оценку сна.')}
              </p>
            )}
            {sleep.implausible > 0 && (
              <p className="dr-note">
                {rt('Ночей, где между отбоем и подъёмом прошло меньше времени, чем длился сон')}: {sleep.implausible}. {rt('Время пробуждения в этих строках записано источником неверно; значения показаны как есть, без правки.')}
              </p>
            )}
          </section>
        )}

        {sections.metrics && (
          <section>
            <h2>{rt('Покрытие данных и пробелы')}</h2>
            {coverage.gaps.length > 0 ? (
              <>
                <p>{rt('Метрики с существенными пропусками')}:</p>
                <ul>
                  {coverage.gaps.map(g => (
                    <li key={g.key}>
                      {rt(g.label)}: {g.daysWithData} {rt('из')} {g.daysInPeriod} {rt('дней')} ({rt('пропущено')} {g.missingPct}%)
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{rt('Существенных пропусков по метрикам нет: каждая метрика покрывает не менее 90% дней периода.')}</p>
            )}
            <p>
              {coverage.missingDates.length > 0
                ? `${rt('Дней без единой записи')}: ${coverage.missingDates.length} (${coverage.missingDates.join(', ')}).`
                : rt('Дней без единой записи нет — период покрыт полностью.')}
            </p>
          </section>
        )}

        {sections.metrics && deviations.length > 0 && (
          <section>
            <h2>{rt('Отклонения, замеченные в периоде')}</h2>
            <p className="dr-note">{rt('Полные недели (от 5 дней с данными), где среднее ушло от медианы недель дальше 2 MAD и дальше порога, своего для каждой метрики. Только факт отклонения, без интерпретации.')}</p>
            {deviations.map(w => (
              <div key={w.weekStart} className="dr-deviation">
                <h3>{rt('Неделя с')} {w.weekStart} ({w.days} {rt('дн. с данными')})</h3>
                <ul>
                  {w.items.map(d => (
                    <li key={d.key}>
                      {rt(d.label)} — {d.weekMean.toFixed(d.digits)} {rt('против')} {d.median.toFixed(d.digits)} {rt('по медиане недель')} ({d.relPct > 0 ? rt('выше') : rt('ниже')} {rt('на')} {Math.abs(d.relPct)}%)
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {sections.labs && (
          <section>
            <h2>{rt('Анализы')}</h2>
            {labs.lines.length === 0 ? <p>{rt('Нет данных за период')}</p> : (
              <>
                <table>
                  <thead><tr>
                    <th>{rt('Показатель')}</th><th>{rt('Значение')}</th><th>{rt('Реф. диапазон')}</th>
                    <th>{rt('Статус')}</th><th>{rt('Предыдущее')}</th><th>{rt('Динамика')}</th><th>{rt('Дата')}</th>
                  </tr></thead>
                  <tbody>
                    {labs.lines.map(l => (
                      <tr key={`${l.marker} ${l.unit ?? ''}`}
                        className={l.status === 'above' || l.status === 'below' ? 'dr-flagged' : undefined}>
                        <td>{l.marker}</td>
                        <td>{l.value} {l.unit ?? ''}</td>
                        <td>{l.refRange ?? dash}</td>
                        <td>{labStatusCell(l, rt)}</td>
                        <td>{l.prevValue != null ? `${l.prevValue} (${l.prevDate})` : dash}</td>
                        <td>{l.delta != null ? `${signed(l.delta)} ${rt('к')} ${l.prevDate}` : dash}</td>
                        <td>{l.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="dr-note">
                  {labs.outOfPeriod.length > 0
                    ? `${rt('Последнее измерение раньше периода отчёта')}: ${labs.outOfPeriod.join(', ')}.`
                    : rt('Все показатели сданы внутри периода отчёта.')}
                </p>
                <p className="dr-note">{rt(LAB_UNIT_CAVEAT)}</p>
                <p className="dr-note">{rt(LAB_DATE_CAVEAT)}</p>
                {labs.series.length > 0 && (
                  <>
                    <h3>{rt('Все измерения по показателям')}</h3>
                    <table>
                      <thead><tr>
                        <th>{rt('Показатель')}</th>
                        <th>{rt('Все значения по датам (от старых к новым)')}</th>
                        <th>{rt('Реф. диапазон')}</th>
                      </tr></thead>
                      <tbody>
                        {labs.series.map(s => (
                          <tr key={`${s.marker} ${s.unit ?? ''}`}>
                            <td>{s.marker}</td>
                            <td>{s.points.map(pt => `${pt.date}: ${pt.value}`).join(' → ')} {s.unit ?? ''}</td>
                            <td>{s.refRange ?? dash}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                <p className="dr-note">
                  {rt('Всего измерений в базе')}: {labs.totalMeasurements} {rt('по')} {labs.markerCount} {rt('показателям')}.
                </p>
              </>
            )}
          </section>
        )}

        {sections.supplements && (
          <section>
            <h2>{rt('Добавки и приём')}</h2>
            {supplements.length === 0 ? <p>{rt('Нет данных за период')}</p> : (
              <>
                <table>
                  <thead><tr>
                    <th>{rt('Название')}</th><th>{rt('Доза')}</th><th>{rt('Статус')}</th>
                    <th>{rt('Приём с')}</th><th>{rt('Соблюдение в периоде')}</th>
                  </tr></thead>
                  <tbody>
                    {supplements.map(s => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.dose ? `${s.dose} ${s.unit ?? ''}` : dash}</td>
                        <td>{s.active ? rt('принимает') : rt('не принимает')}</td>
                        <td>{s.firstIntake ?? dash}</td>
                        <td>{s.pct != null ? `${s.pct}% (${s.taken} ${rt('из')} ${s.windowDays} ${rt('дней')})` : dash}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="dr-note">{rt('Соблюдение считается от первого отмеченного приёма внутри периода, а не от всей длины периода.')}</p>
              </>
            )}
          </section>
        )}

        {sections.concerns && concerns.length > 0 && (
          <section>
            <h2>{rt('Проблемы и жалобы')}</h2>
            {concerns.map(c => (
              <div key={c.id} className="dr-concern">
                <h3>{c.name}</h3>
                <p className="dr-note">
                  {rt('Категория')}: {c.category}
                  {c.startedAt ? ` · ${rt('с')} ${c.startedAt}` : ''}
                  {` · ${rt('статус')}: ${rt(STATUS_TEXT[c.status] ?? c.status)}`}
                </p>
                {c.note && <p>{rt('Заметка')}: {c.note}</p>}
                {c.severity && (
                  <p>
                    {rt('Тяжесть (шкала 1–5, самооценка)')}: {c.severity.count} {rt('записей')}, {rt('среднее')} {c.severity.avg}; {rt('первая половина периода')} {c.severity.firstHalf} → {rt('вторая')} {c.severity.secondHalf}
                  </p>
                )}
                {c.recentLogs.length > 0 && (
                  <>
                    <p>{rt('Последние записи')}:</p>
                    <ul>
                      {c.recentLogs.map(l => (
                        <li key={l.date}>
                          {l.date}{l.severity != null ? ` (${rt('тяжесть')} ${l.severity}/5)` : ''}: {l.note}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </section>
        )}

        {sections.journal && (journal.wellbeingCount > 0 || journal.notes.length > 0) && (
          <section>
            <h2>{rt('Самочувствие и дневник')}</h2>
            {journal.wellbeingAvg != null && (
              <p>{rt('Самооценка самочувствия (1–5)')}: {journal.wellbeingCount} {rt('записей')}, {rt('среднее')} {journal.wellbeingAvg}.</p>
            )}
            {journal.weeks.length > 0 && (
              <table>
                <thead><tr>
                  <th>{rt('Неделя с')}</th><th>{rt('Самочувствие')}</th><th>{rt('Записей')}</th>
                </tr></thead>
                <tbody>
                  {journal.weeks.map(w => (
                    <tr key={w.weekStart}><td>{w.weekStart}</td><td>{w.avg}</td><td>{w.count}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {journal.notes.length > 0 && (
              <>
                <p>{rt('Записи пациента (последние 12)')}:</p>
                <ul>
                  {journal.notes.map(n => (
                    <li key={n.date}>
                      {n.date}{n.wellbeing != null ? ` [${rt('самочувствие')} ${n.wellbeing}/5]` : ''}: {n.note}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <section>
          <h2>{rt('Чего в этих данных нет')}</h2>
          <ul>
            {MISSING_LINES.map(line => <li key={line}>{rt(line)}</li>)}
          </ul>
        </section>

        {sections.ai && aiQuestions && aiQuestions.length > 0 && (
          <section className="dr-ai-block">
            <h2>{rt('Вопросы для обсуждения с врачом')}</h2>
            <ol>
              {aiQuestions.map((q, i) => <li key={i}>{q}</li>)}
            </ol>
            <p className="dr-ai-note">{rt('Сгенерировано ИИ-ассистентом, не является медицинской рекомендацией')}</p>
          </section>
        )}
      </div>
    </div>
  )
}
