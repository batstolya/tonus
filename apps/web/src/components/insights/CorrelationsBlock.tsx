import { useEffect, useState } from 'react'
import type { DailyMetrics } from '../../types'
import { computeLagCorrelations, type CorrFactor, type CorrOutcome, type EnvDay } from '../../lib/correlations'
import { computeDailyScores } from '../../lib/scores'
import { getEnvironmentDays } from '../../lib/api/insights'
import { isDemoActive } from '../../lib/demo'
import { useT } from '../../lib/i18n'
import { Icon, type IconName } from '../../lib/icons'

// «Связи в твоих данных» (F3 smart-tonus): детерминированные лаг-корреляции,
// движок — src/lib/correlations.ts. Работает и в демо (фикстурные 90 дней).

interface Props {
  daily: DailyMetrics[]
  intakeEvents: { ts: string; type: string }[]
}

const FACTOR_LABELS: Record<CorrFactor, { icon: IconName; label: string }> = {
  coffee: { icon: 'coffee', label: 'Кофе' },
  alcohol: { icon: 'alcohol', label: 'Алкоголь' },
  exerciseMinutes: { icon: 'exercise', label: 'Тренировки' },
  steps: { icon: 'shoes', label: 'Шаги' },
  bedtime: { icon: 'moon', label: 'Поздний отбой' },
  pressure: { icon: 'compass', label: 'Давление' },
  pressureDelta: { icon: 'weather', label: 'Перепад давления' },
  temp: { icon: 'temperature', label: 'Температура за окном' },
  daylight: { icon: 'sun', label: 'Световой день' },
  magneticStorm: { icon: 'magnet', label: 'Магнитные бури' },
}

const OUTCOME_LABELS: Record<CorrOutcome, string> = {
  sleepHours: 'Сон',
  hrv: 'HRV',
  restingHeartRate: 'Пульс покоя',
  readiness: 'Готовность',
}

export function CorrelationsBlock({ daily, intakeEvents }: Props) {
  const { t } = useT()
  // Погода/среда: в демо — фикстура, иначе environment_daily (RLS отдаёт свои строки)
  const [env, setEnv] = useState<EnvDay[]>([])
  useEffect(() => {
    let cancelled = false
    if (isDemoActive()) {
      import('../../lib/demoFixture').then(m => { if (!cancelled) setEnv(m.makeDemoEnvironment()) })
      return () => { cancelled = true }
    }
    const since = new Date(Date.now() - 48 * 86400000).toISOString().slice(0, 10)
    getEnvironmentDays(since).then(days => { if (!cancelled) setEnv(days) })
    return () => { cancelled = true }
  }, [])

  const scores = computeDailyScores(daily).map(s => ({ date: s.date, readiness: s.readiness }))
  const res = computeLagCorrelations({ daily, scores, intake: intakeEvents, environment: env })

  if ('needMoreDays' in res) {
    return (
      <div className="ins-block">
        <h3 className="ins-title"><Icon name="link" size={16} /> {t('Связи в твоих данных')}</h3>
        <p className="settings-muted">
          {t('Нужно ещё {n} дней данных, чтобы искать связи.').replace('{n}', String(res.needMoreDays))}
        </p>
      </div>
    )
  }

  if (!res.correlations.length) return null

  return (
    <div className="ins-block">
      <h3 className="ins-title"><Icon name="link" size={16} /> {t('Связи в твоих данных')}</h3>
      <div className="corr-list">
        {res.correlations.map(c => {
          const f = FACTOR_LABELS[c.factor]
          return (
            <div key={`${c.factor}-${c.outcome}-${c.lag}`} className={`corr-card ${c.strength}`}>
              <span className="corr-pair">
                <Icon name={f.icon} size={14} /> {t(f.label)} → <Icon name={c.direction === 'up' ? 'trendUp' : 'trendDown'} size={14} /> {t(OUTCOME_LABELS[c.outcome])}
              </span>
              <span className="corr-meta">
                {t(c.lag === 1 ? 'на следующий день' : 'в тот же день')}
                {' · '}
                {t(c.strength === 'strong' ? 'сильная связь' : 'заметная связь')}
                {' · '}
                {c.n} {t('дн.')}
              </span>
            </div>
          )
        })}
      </div>
      <p className="settings-muted corr-note">{t('Корреляция — не причинность: связь стоит проверить экспериментом.')}</p>
    </div>
  )
}
