// ВРЕМЕННЫЙ файл для локального просмотра UI (VITE_DEMO=1). Не коммитить.
import type { DailyMetrics, HeartRateSample } from '../types'

function rnd(seed: number) {
  // детерминированный псевдорандом, чтобы картинка была стабильной
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export function makeDemoDaily(days = 90): DailyMetrics[] {
  const out: DailyMetrics[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    const r = (k: number) => rnd(i * 7 + k)
    const weekend = d.getDay() === 0 || d.getDay() === 6
    const sleepHours = 6.2 + r(1) * 2.2 + (weekend ? 0.5 : 0)
    const bed = new Date(d); bed.setDate(bed.getDate() - 1); bed.setHours(23, Math.floor(r(2) * 59), 0, 0)
    const wake = new Date(d); wake.setHours(7, Math.floor(r(3) * 59), 0, 0)
    out.push({
      date,
      heartRate: { avg: 68 + r(4) * 10, min: 48 + r(5) * 6, max: 120 + r(6) * 40 },
      restingHeartRate: 54 + r(7) * 8,
      hrv: 35 + r(8) * 40,
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
      steps: Math.floor(4000 + r(16) * 9000),
      distance: 3 + r(17) * 7,
      activeEnergy: 300 + r(18) * 500,
      exerciseMinutes: Math.floor(r(19) * 70),
      flightsClimbed: Math.floor(r(20) * 15),
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
