import { useEffect, useState } from 'react'
import type { DailyMetrics } from '../../types'
import { computeLagCorrelations, type CorrFactor, type CorrOutcome, type EnvDay } from '../../lib/correlations'
import { computeDailyScores } from '../../lib/scores'
import { supabase } from '../../lib/supabase'
import { isDemoActive } from '../../lib/demo'
import { useT } from '../../lib/i18n'

// «Связи в твоих данных» (F3 smart-tonus): детерминированные лаг-корреляции,
// движок — src/lib/correlations.ts. Работает и в демо (фикстурные 90 дней).

interface Props {
  daily: DailyMetrics[]
  intakeEvents: { ts: string; type: string }[]
}

const FACTOR_LABELS: Record<CorrFactor, { emoji: string; label: string }> = {
  coffee: { emoji: '☕', label: 'Кофе' },
  alcohol: { emoji: '🍷', label: 'Алкоголь' },
  exerciseMinutes: { emoji: '🏃', label: 'Тренировки' },
  steps: { emoji: '👟', label: 'Шаги' },
  bedtime: { emoji: '🌙', label: 'Поздний отбой' },
  pressure: { emoji: '🧭', label: 'Давление' },
  pressureDelta: { emoji: '🌦️', label: 'Перепад давления' },
  temp: { emoji: '🌡️', label: 'Температура за окном' },
  daylight: { emoji: '☀️', label: 'Световой день' },
  magneticStorm: { emoji: '🧲', label: 'Магнитные бури' },
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
    supabase
      .from('environment_daily')
      .select('date, temp_c, pressure_hpa, daylight_minutes, precipitation_mm, kp_index')
      .gte('date', since).order('date')
      .then(({ data }) => { if (!cancelled) setEnv((data as EnvDay[]) ?? []) })
    return () => { cancelled = true }
  }, [])

  const scores = computeDailyScores(daily).map(s => ({ date: s.date, readiness: s.readiness }))
  const res = computeLagCorrelations({ daily, scores, intake: intakeEvents, environment: env })

  if ('needMoreDays' in res) {
    return (
      <div className="ins-block">
        <h3 className="ins-title">🔗 {t('Связи в твоих данных')}</h3>
        <p className="settings-muted">
          {t('Нужно ещё {n} дней данных, чтобы искать связи.').replace('{n}', String(res.needMoreDays))}
        </p>
      </div>
    )
  }

  if (!res.correlations.length) return null

  return (
    <div className="ins-block">
      <h3 className="ins-title">🔗 {t('Связи в твоих данных')}</h3>
      <div className="corr-list">
        {res.correlations.map(c => {
          const f = FACTOR_LABELS[c.factor]
          return (
            <div key={`${c.factor}-${c.outcome}-${c.lag}`} className={`corr-card ${c.strength}`}>
              <span className="corr-pair">
                {f.emoji} {t(f.label)} → {c.direction === 'up' ? '📈' : '📉'} {t(OUTCOME_LABELS[c.outcome])}
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
