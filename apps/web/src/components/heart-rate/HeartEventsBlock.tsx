import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import { useT } from '../../lib/i18n'
import { isDemoActive } from '../../lib/demo'
import { loadHeartEvents } from '../../lib/doctorReport/load'
import type { HeartEvent, HeartEventKind } from '../../lib/doctorReport/heartEvents'
import { summarizeHeartEvents } from './heartEventsSummary'

// Apple Watch heart events over the whole history (spec
// 2026-11-25-heart-events-on-pulse-screen). Facts only, no verdicts.

const PREVIEW = 10

/** Russian i18n keys. */
const KIND_LABEL: Record<HeartEventKind, string> = {
  low_hr: 'Низкий пульс',
  high_hr: 'Высокий пульс',
  irregular_rhythm: 'Нерегулярный ритм',
  ecg: 'ЭКГ',
  other: 'Другое уведомление',
}

/** Apple's ECG classes → Russian i18n keys; unknown classes print as sent. */
const ECG_CLASS: Record<string, string> = {
  'Sinus Rhythm': 'Синусовый ритм',
  'Atrial Fibrillation': 'Фибрилляция предсердий',
  'Inconclusive Poor Recording': 'Плохая запись',
  'Inconclusive Low Heart Rate': 'Не определено: низкий пульс',
  'Inconclusive High Heart Rate': 'Не определено: высокий пульс',
  'Inconclusive': 'Не определено',
}

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (iso: string) => {
  const d = new Date(iso)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function HeartEventsBlock({ userId }: { userId: string | null }) {
  const { t } = useT()
  const [events, setEvents] = useState<HeartEvent[] | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (isDemoActive()) {
      import('../../lib/demoFixture').then(m => { if (!cancelled) setEvents(m.makeDemoHeartEvents()) })
      return () => { cancelled = true }
    }
    if (!userId) return
    // Whole history, not the screen's preset: events are sparse and the
    // multi-year trend is the point.
    loadHeartEvents(userId, '2000-01-01')
      .then(rows => { if (!cancelled) setEvents(rows) })
      .catch(() => { if (!cancelled) setEvents([]) })
    return () => { cancelled = true }
  }, [userId])

  const s = useMemo(() => summarizeHeartEvents(events ?? []), [events])
  if (!events || (!s.notifications.length && !s.ecgs.length)) return null

  const bpm = t('уд/мин')
  const shown = showAll ? s.notifications : s.notifications.slice(0, PREVIEW)

  return (
    <div className="he-block">
      <h3>{t('Сердечные события (Apple Watch)')}</h3>

      <div className="stat-row">
        <div className="stat"><span>{s.lowCount}</span>{t('уведомлений о низком пульсе')}</div>
        {s.lowestHr != null && <div className="stat"><span>{s.lowestHr} {bpm}</span>{t('самый низкий пульс')}</div>}
        {s.nightShare != null && <div className="stat"><span>{Math.round(s.nightShare * 100)}%</span>{t('ночью (00–07)')}</div>}
        <div className="stat"><span>{s.ecgCount}</span>{t('ЭКГ')}</div>
      </div>

      {s.monthly.length > 1 && (
        <div className="chart-section">
          <h4>{t('Уведомления по месяцам')}</h4>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={s.monthly} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              {/* recharts v3 + React 19: bars do not render with animation on. */}
              <Bar dataKey="count" name={t('Уведомления')} fill="var(--chart-1)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {s.notifications.length > 0 && (
        <>
          <h4>{t('Уведомления о пульсе')}</h4>
          <ul className="he-list">
            {shown.map(e => (
              <li key={`${e.kind}-${e.start_ts}`} className="he-list-item">
                <span className="he-when">{stamp(e.start_ts)}</span>{' '}
                {t(KIND_LABEL[e.kind])}
                {e.hr_min != null && e.hr_max != null && <> · {e.hr_min}–{e.hr_max} {bpm}</>}
                {e.threshold != null && <> ({t('порог')} {e.threshold})</>}
              </li>
            ))}
          </ul>
          {!showAll && s.notifications.length > PREVIEW && (
            <button className="preset" onClick={() => setShowAll(true)}>
              {t('Показать все ({n})').replace('{n}', String(s.notifications.length))}
            </button>
          )}
        </>
      )}

      {s.ecgs.length > 0 && (
        <>
          <h4>{t('ЭКГ')}</h4>
          <ul className="he-list">
            {s.ecgs.map(e => (
              <li key={e.start_ts} className="he-ecg-item">
                <span className="he-when">{stamp(e.start_ts)}</span>{' '}
                {e.classification ? t(ECG_CLASS[e.classification] ?? e.classification) : t('классификация не указана')}
                {e.hr_avg != null && <> · {Math.round(e.hr_avg)} {bpm}</>}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="settings-muted">{t('Записи Apple Watch как есть, без оценки. Классификацию ЭКГ даёт приложение Apple.')}</p>
    </div>
  )
}
