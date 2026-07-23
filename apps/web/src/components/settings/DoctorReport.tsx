import type { User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import type { DailyMetrics } from '../../types'
import { summarizeMetrics, weeklyRows, latestLabs, type LabLine } from '../../lib/doctorReport'
import { loadLabResults } from '../../lib/labs'
import { loadSupplements, type Supplement } from '../../lib/supplements'
import { loadConcerns, STATUS_LABELS, type HealthConcern } from '../../lib/concerns'
import { computeAdherence } from '../../lib/adherence'
import { isUnlocked } from '../../lib/privacy'
import { getSupplementLogsSince, type SupplementAdherenceLog } from '../../lib/api/settings'
import { callFunction } from '../../lib/edgeFunctions'
import { isDemoActive } from '../../lib/demo'
import { demoList } from '../../lib/demoDb'
import { localDate, addDays } from '../../lib/experiments'
import { translations } from '../../lib/translations'
import { useT } from '../../lib/i18n'

// «Отчёт для врача» (SPEC-DOCTOR-REPORT): экран подготовки + печатное
// представление. Тело отчёта — только факты; ИИ-блок вопросов опционален
// и визуально отделён. Язык отчёта (ru/en) не зависит от языка интерфейса.

type SectionKey = 'metrics' | 'labs' | 'supplements' | 'concerns' | 'ai'

interface Props {
  user?: User
  daily: DailyMetrics[]
  onClose: () => void
}

const METRIC_NAMES: Record<string, string> = {
  restingHeartRate: 'Пульс покоя',
  hrv: 'HRV',
  sleepHours: 'Сон, ч',
  steps: 'Шаги',
}

export function DoctorReport({ user, daily, onClose }: Props) {
  const { t } = useT()
  const [stage, setStage] = useState<'setup' | 'preview'>('setup')
  const [period, setPeriod] = useState<30 | 90 | 365>(90)
  const [lang, setLang] = useState<'ru' | 'en'>('ru')
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({
    metrics: true, labs: true, supplements: true, concerns: true, ai: false,
  })
  const [labs, setLabs] = useState<LabLine[]>([])
  const [supplements, setSupplements] = useState<Supplement[]>([])
  // Демо: логи приёма ленивым инициализатором (эффект в демо в БД не ходит).
  const [adhLogs, setAdhLogs] = useState<SupplementAdherenceLog[]>(
    () => isDemoActive()
      ? demoList('supplement_logs').filter(l => l.date >= addDays(localDate(), -365)) as SupplementAdherenceLog[]
      : [])
  const [concerns, setConcerns] = useState<HealthConcern[]>([])
  const [pickedConcerns, setPickedConcerns] = useState<Set<string>>(new Set())
  const [aiQuestions, setAiQuestions] = useState<string[] | null>(null)
  const [building, setBuilding] = useState(false)
  const [aiError, setAiError] = useState(false)

  // Язык отчёта: ru — исходные ключи, en — словарь переводов.
  const rt = (key: string) => (lang === 'ru' ? key : translations[key]?.en ?? key)

  useEffect(() => {
    if (!user) return
    // Каждый источник — независимо и терпимо к сбоям (в демо запросы падают → секции пустые).
    loadLabResults(user.id).then(rs => setLabs(latestLabs(rs))).catch(() => {})
    loadSupplements(user.id).then(setSupplements).catch(() => {})
    if (!isDemoActive()) {
      getSupplementLogsSince(user.id, addDays(localDate(), -365)).then(setAdhLogs)
    }
    loadConcerns(user.id).then(cs => {
      setConcerns(cs)
      // приватные — вне отчёта по умолчанию (и вне списка выбора без PIN)
      setPickedConcerns(new Set(cs.filter(c => !c.is_private).map(c => c.id)))
    }).catch(() => {})
  }, [user])

  const visibleConcerns = concerns.filter(c => !c.is_private || isUnlocked())

  async function build() {
    setBuilding(true)
    setAiError(false)
    if (sections.ai) {
      try {
        const digestLines = [
          ...summarizeMetrics(daily, period)
            .filter(m => m.avg != null)
            .map(m => `${METRIC_NAMES[m.key]}: среднее ${m.avg}, мин ${m.min}, макс ${m.max}${m.baselinePct != null ? `, к базлайну ${m.baselinePct}%` : ''}`),
          ...labs.map(l => `${l.marker}: ${l.value} ${l.unit ?? ''} (реф. ${l.refRange ?? '—'})${l.flag ? ` ${l.flag}` : ''} от ${l.date}`),
        ]
        const res = await callFunction<{ questions: string[] }>('analyze-health', {
          digest: digestLines.join('\n'),
          periodStart: addDays(localDate(), -period),
          periodEnd: localDate(),
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
            ['labs', t('Анализы')],
            ['supplements', t('Добавки и приём')],
            ['concerns', t('Проблемы')],
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
            {concerns.some(c => c.is_private) && !isUnlocked() && (
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
  const metrics = summarizeMetrics(daily, period).filter(m => m.avg != null)
  const weeks = weeklyRows(daily, period)
  const adherence = computeAdherence(
    supplements.map(s => ({ id: s.id, name: s.name })),
    adhLogs, period,
  )
  const reportConcerns = visibleConcerns.filter(c => pickedConcerns.has(c.id))

  return (
    <div className="dr-print-root">
      <div className="dr-toolbar">
        <button className="dr-btn" onClick={() => setStage('setup')}>{t('Назад')}</button>
        <button className="dr-btn dr-btn-primary" onClick={() => window.print()}>{t('Печать')}</button>
      </div>
      {aiError && <p className="dr-ai-error">{t('Не удалось получить ИИ-вопросы — отчёт сформирован без них')}</p>}

      <div className="dr-doc">
        <h1>{rt('Сводка данных здоровья')}</h1>
        <p className="dr-meta">
          {rt('Период')}: {addDays(localDate(), -period)} — {localDate()} · {rt('Сформировано')}: {localDate()}
        </p>
        <p className="dr-disclaimer">{rt('Источник: приложение Tonus, данные носимых устройств. Не является медицинскими измерениями и не заменяет обследование.')}</p>

        {sections.metrics && metrics.length > 0 && (
          <section>
            <h2>{rt('Метрики за период')}</h2>
            <table>
              <thead><tr>
                <th>{rt('Метрика')}</th><th>{rt('Среднее')}</th><th>{rt('Мин')}</th><th>{rt('Макс')}</th><th>{rt('К базлайну')}</th>
              </tr></thead>
              <tbody>
                {metrics.map(m => (
                  <tr key={m.key}>
                    <td>{rt(METRIC_NAMES[m.key])}</td>
                    <td>{m.avg}</td><td>{m.min}</td><td>{m.max}</td>
                    <td>{m.baselinePct != null ? `${m.baselinePct > 0 ? '+' : ''}${m.baselinePct}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {weeks.length > 1 && (
              <>
                <h3>{rt('Динамика по неделям')}</h3>
                <table>
                  <thead><tr>
                    <th>{rt('Неделя с')}</th><th>{rt('Пульс покоя')}</th><th>HRV</th><th>{rt('Сон, ч')}</th><th>{rt('Шаги')}</th>
                  </tr></thead>
                  <tbody>
                    {weeks.map(w => (
                      <tr key={w.weekStart}>
                        <td>{w.weekStart}</td>
                        <td>{w.rhr ?? '—'}</td><td>{w.hrv ?? '—'}</td><td>{w.sleep ?? '—'}</td><td>{w.steps ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        )}

        {sections.labs && (
          <section>
            <h2>{rt('Анализы (последние значения)')}</h2>
            {labs.length === 0 ? <p>{rt('Нет данных за период')}</p> : (
              <table>
                <thead><tr>
                  <th>{rt('Показатель')}</th><th>{rt('Значение')}</th><th>{rt('Реф. диапазон')}</th><th>{rt('Пред.')}</th><th>{rt('Дата')}</th>
                </tr></thead>
                <tbody>
                  {labs.map(l => (
                    <tr key={l.marker} className={l.flag ? 'dr-flagged' : undefined}>
                      <td>{l.marker}</td>
                      <td>{l.value} {l.unit ?? ''} {l.flag ?? ''}</td>
                      <td>{l.refRange ?? '—'}</td>
                      <td>{l.prevValue ?? '—'}</td>
                      <td>{l.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {sections.supplements && (
          <section>
            <h2>{rt('Добавки и приём')}</h2>
            {supplements.length === 0 ? <p>{rt('Нет данных за период')}</p> : (
              <table>
                <thead><tr>
                  <th>{rt('Название')}</th><th>{rt('Доза')}</th><th>{rt('Соблюдение за период')}</th>
                </tr></thead>
                <tbody>
                  {supplements.map(s => {
                    const a = adherence.items.find(i => i.id === s.id)
                    return (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.default_dose ? `${s.default_dose} ${s.unit ?? ''}` : '—'}</td>
                        <td>{a ? `${a.pct}% (${a.taken}/${a.days})` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        )}

        {sections.concerns && reportConcerns.length > 0 && (
          <section>
            <h2>{rt('Проблемы')}</h2>
            <table>
              <thead><tr><th>{rt('Название')}</th><th>{rt('С')}</th><th>{rt('Статус')}</th></tr></thead>
              <tbody>
                {reportConcerns.map(c => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.started_at ?? '—'}</td>
                    <td>{rt(STATUS_LABELS[c.status]?.label ?? c.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

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
