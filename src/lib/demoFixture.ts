// Фикстурные данные демо-режима и живой панели лендинга (VITE_DEMO / кнопка «Посмотреть демо»).
import type { DailyMetrics, HeartRateSample } from '../types'
import { localDate, addDays, computeBaselineStart, type ExperimentRow } from './experiments'

function rnd(seed: number) {
  // детерминированный псевдорандом, чтобы картинка была стабильной
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export function makeDemoDaily(days = 90): DailyMetrics[] {
  const out: DailyMetrics[] = []
  const today = new Date()
  let prevSleep = 7.5 // для лаг-связи «сон → HRV назавтра»
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    const r = (k: number) => rnd(i * 7 + k)
    const weekend = d.getDay() === 0 || d.getDay() === 6
    // Причинные паттерны для «Связей в твоих данных» (F3):
    // активный день → сон лучше; поздний отбой → недосып; сон → HRV назавтра.
    const steps = Math.floor(4000 + r(16) * 9000)
    const lateNight = r(2) > 0.65
    const hotDay = r(21) > 0.7 // жаркий день → сон хуже (пара к makeDemoEnvironment)
    const sleepHours = Math.min(9.5,
      6.1 + r(1) * 0.9 + (steps > 9000 ? 1.1 : 0) + (lateNight ? -1.2 : 0) + (hotDay ? -1.1 : 0) + (weekend ? 0.4 : 0))
    const bed = new Date(d); bed.setDate(bed.getDate() - 1)
    bed.setHours(lateNight ? 24 : 23, Math.floor(r(2) * 59), 0, 0) // 00:xx при позднем отбое
    const wake = new Date(d); wake.setHours(7, Math.floor(r(3) * 59), 0, 0)
    const hrv = 32 + r(8) * 22 + (prevSleep - 6.5) * 6 // вчерашний сон двигает HRV
    prevSleep = sleepHours
    out.push({
      date,
      heartRate: { avg: 68 + r(4) * 10, min: 48 + r(5) * 6, max: 120 + r(6) * 40 },
      restingHeartRate: 54 + r(7) * 8,
      hrv,
      walkingHeartRate: 90 + r(9) * 15,
      oxygenSaturation: (96 + r(10) * 3) / 100,
      respiratoryRate: 14 + r(11) * 3,
      wristTemperature: 36.2 + r(12) * 0.8,
      vo2max: 42 + r(13) * 4,
      sleepHours,
      sleepBedtime: bed.toISOString(),
      sleepWakeTime: wake.toISOString(),
      sleepDeep: sleepHours * (0.15 + r(14) * 0.1),
      sleepREM: sleepHours * (0.2 + r(15) * 0.08),
      sleepCore: sleepHours * 0.55,
      steps,
      distance: 3 + r(17) * 7,
      activeEnergy: 300 + r(18) * 500,
      exerciseMinutes: Math.floor(r(19) * 70),
      flightsClimbed: Math.floor(r(20) * 15),
    })
  }
  return out
}

// Эксперименты для демо: все состояния карточки — идёт, запланирован,
// завершён с результатом (числа считаются вживую из makeDemoDaily),
// завершён с готовым разбором ИИ и завершён с нехваткой данных.
export function makeDemoExperiments(): ExperimentRow[] {
  const td = localDate()
  const mk = (over: Partial<ExperimentRow> & Pick<ExperimentRow, 'id' | 'hypothesis' | 'change_rule' | 'target_metric' | 'start_date' | 'end_date' | 'status'>): ExperimentRow => ({
    baseline_days: 14,
    baseline_start: computeBaselineStart(over.start_date, over.baseline_days ?? 14),
    result: null,
    ai_explanation: null,
    created_at: `${over.start_date}T09:00:00Z`,
    ...over,
  })
  return [
    mk({
      id: 'demo-exp-active',
      hypothesis: 'Прогулка 30 минут после ужина улучшит глубокий сон',
      change_rule: 'Гуляю 21:00–21:30 каждый день',
      target_metric: 'sleepDeep',
      start_date: addDays(td, -6),
      end_date: addDays(td, 8),
      status: 'active',
    }),
    mk({
      id: 'demo-exp-planned',
      hypothesis: 'Магний за час до сна увеличит REM-фазу',
      change_rule: 'Принимаю магний в 22:00',
      target_metric: 'sleepREM',
      start_date: addDays(td, 4),
      end_date: addDays(td, 18),
      status: 'active',
    }),
    mk({
      id: 'demo-exp-done-1',
      hypothesis: 'Отказ от кофе после 16:00 улучшит качество сна',
      change_rule: 'Последняя чашка кофе до 16:00',
      target_metric: 'sleepDeep',
      start_date: addDays(td, -30),
      end_date: addDays(td, -16),
      status: 'completed',
    }),
    mk({
      id: 'demo-exp-done-2',
      hypothesis: 'Ранний отбой поднимет HRV на следующий день',
      change_rule: 'Ложусь до 23:00',
      target_metric: 'hrv',
      start_date: addDays(td, -50),
      end_date: addDays(td, -36),
      status: 'completed',
      ai_explanation: 'Средний HRV во время эксперимента вырос относительно базового периода. Это согласуется с известной связью раннего отбоя и восстановления, но двухнедельное окно короткое: часть эффекта могут объяснять тренировки и стресс. Продолжай привычку ещё 2–3 недели, чтобы подтвердить тренд.',
    }),
    mk({
      id: 'demo-exp-done-3',
      hypothesis: 'Дыхательные практики поднимут SpO₂ во сне',
      change_rule: 'Дыхательная гимнастика перед сном',
      target_metric: 'oxygenSaturation',
      start_date: addDays(td, -110),
      end_date: addDays(td, -96),
      status: 'completed',
    }),
  ]
}

// Погода/среда для демо (environment_daily). Жара синхронизирована с
// makeDemoDaily тем же сидом r(21) — «Жара → сон хуже» видна в корреляциях.
export function makeDemoEnvironment(days = 90) {
  const out: { date: string; temp_c: number; pressure_hpa: number; daylight_minutes: number; precipitation_mm: number }[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const r = (k: number) => rnd(i * 7 + k)
    const hotDay = r(21) > 0.7
    out.push({
      date: d.toISOString().slice(0, 10),
      temp_c: hotDay ? 28 + r(22) * 5 : 15 + r(22) * 8,
      pressure_hpa: 1013 + Math.sin(i / 4) * 9 + r(23) * 5,
      daylight_minutes: 880 + Math.round(r(24) * 120),
      precipitation_mm: r(25) > 0.75 ? r(26) * 12 : 0,
    })
  }
  return out
}

export function makeDemoHRSamples(days = 7): HeartRateSample[] {
  const out: HeartRateSample[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 10) {
        const t = new Date(now)
        t.setDate(t.getDate() - i); t.setHours(h, m, 0, 0)
        const base = h < 7 ? 52 : h < 9 ? 70 : h < 19 ? 75 : 62
        out.push({ time: t, value: base + rnd(i * 1440 + h * 60 + m) * 25, sourceName: 'Demo Watch' })
      }
    }
  }
  return out
}
