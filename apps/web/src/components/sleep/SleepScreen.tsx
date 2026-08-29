import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts'
import type { DailyMetrics } from '../../types'
import { useT } from '../../lib/i18n'
import { hoursToHM, effectiveWake, averageTimeOfDay } from '../../lib/sleepFormat'
import { sleepEfficiencyPct } from '../../lib/sleepQuality'

interface Props {
  daily: DailyMetrics[]
}

type Preset = '14d' | '30d' | '90d'

// Convert bedtime to comparable number for chart (hours from noon)
function bedtimeToChartVal(iso: string | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  let h = d.getHours() + d.getMinutes() / 60
  // Shift so that e.g. 22:00 = 10, 23:00 = 11, 00:00 = 12, 01:00 = 13, 02:00 = 14
  if (h < 12) h += 24
  return Math.round((h - 12) * 10) / 10
}

function chartValToTime(val: number): string {
  const h = (val + 12) % 24
  const { hrs: rawH, mins } = hoursToHM(h)
  const hrs = rawH % 24 // перенос 23:60 → 00:00
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

// На уровне модуля (recharts вливает active/payload/label): определение внутри
// компонента ремаунтило бы тултип каждый рендер (react-hooks/static-components).
function CustomBedtimeTooltip({ active, payload, label }: {
  active?: boolean
  label?: string | number
  payload?: { name: string; value: number; color?: string }[]
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="custom-tooltip">
      <p className="tooltip-date">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {chartValToTime(p.value)}
        </p>
      ))}
    </div>
  )
}

export function SleepScreen({ daily }: Props) {
  const { t, locale } = useT()
  const [preset, setPreset] = useState<Preset>('30d')

  const fmtTime = (iso: string | undefined): string => {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }

  const fmtHours = (h: number | undefined): string => {
    if (h === undefined) return '—'
    const { hrs, mins } = hoursToHM(h)
    return t('{h}ч {m}м', { h: hrs, m: mins })
  }

  const days = preset === '14d' ? 14 : preset === '30d' ? 30 : 90
  const slice = useMemo(() => daily.filter(d => d.sleepHours).slice(-days), [daily, days])

  // Битый wake_time (Apple Health, напр. 13.06) чиним производным «отбой + сон»
  const wakeOf = (d: DailyMetrics) => effectiveWake(d.sleepBedtime, d.sleepWakeTime, d.sleepHours)

  const data = useMemo(() => slice.map(d => ({
    date: d.date.slice(5),
    total: d.sleepHours ? Math.round(d.sleepHours * 10) / 10 : null,
    deep: d.sleepDeep ? Math.round(d.sleepDeep * 10) / 10 : null,
    rem: d.sleepREM ? Math.round(d.sleepREM * 10) / 10 : null,
    core: d.sleepCore ? Math.round(d.sleepCore * 10) / 10 : null,
    bedtime: bedtimeToChartVal(d.sleepBedtime),
    wake: bedtimeToChartVal(wakeOf(d)),
  })), [slice])

  const hasPhases = slice.some(d => d.sleepDeep || d.sleepREM)

  const withAwake = slice.filter(d => d.sleepAwake != null)
  const hasAwake = withAwake.length > 0

  // Average efficiency is computed only over nights where both sleepHours and
  // awake time are measured: a night missing either is not "0%", it is
  // unknown, and must be dropped from the average rather than folded in as 0.
  const efficiencies = withAwake
    .map(d => sleepEfficiencyPct(d.sleepHours, d.sleepAwake))
    .filter((v): v is number => v != null)
  const avgEfficiency = efficiencies.length
    ? Math.round(efficiencies.reduce((a, v) => a + v, 0) / efficiencies.length)
    : null

  const avgSleep = slice.length
    ? slice.reduce((a, d) => a + (d.sleepHours ?? 0), 0) / slice.length
    : null

  // Clock times are circular: averaging them linearly on the "hours from noon"
  // scale let a single midday wake-up drag the average backwards by hours
  // (the seam sits at 12:00). averageTimeOfDay has no seam and drops the
  // nights where the time is missing instead of counting them as noon.
  const hoursToChartVal = (h: number) => Math.round(((h < 12 ? h + 24 : h) - 12) * 10) / 10
  const avgBedHours = averageTimeOfDay(slice.map(d => d.sleepBedtime))
  const avgBed = avgBedHours === null ? null : hoursToChartVal(avgBedHours)

  const avgWakeHours = averageTimeOfDay(slice.map(d => wakeOf(d)))
  const avgWake = avgWakeHours === null ? null : hoursToChartVal(avgWakeHours)

  // Before-midnight compliance: bedtimeToChartVal < 12 means before midnight
  const bedtimeDays = slice.filter(d => d.sleepBedtime)
  const onTime = bedtimeDays.filter(d => (bedtimeToChartVal(d.sleepBedtime) ?? 99) < 12).length
  const notOnTime = bedtimeDays.length - onTime

  // Цветовая оценка «хорошо / средне / плохо» для средних метрик сна.
  // avgBed/avgWake — в единицах графика (часы от полудня, см. bedtimeToChartVal):
  // 23:30 → 11.5, 00:00 → 12, 00:30 → 12.5; 05:00 → 17, 06:00 → 18, 08:00 → 20, 09:30 → 21.5.
  const durColor = (h: number) => (h >= 7 ? 'var(--green)' : h >= 6 ? 'var(--yellow)' : 'var(--red)')
  const bedColor = (v: number) => (v < 11.5 ? 'var(--green)' : v <= 12.5 ? 'var(--yellow)' : 'var(--red)')
  const wakeColor = (v: number) =>
    v >= 18 && v <= 20 ? 'var(--green)'
    : (v >= 17 && v < 18) || (v > 20 && v <= 21.5) ? 'var(--yellow)'
    : 'var(--red)'

  return (
    <div className="screen">
      <h2>{t('Сон')}</h2>

      <div className="presets">
        {(['14d', '30d', '90d'] as Preset[]).map(p => (
          <button key={p} className={preset === p ? 'preset active' : 'preset'} onClick={() => setPreset(p)}>
            {p.replace('d', ` ${t('дн')}`)}
          </button>
        ))}
      </div>

      <div className="stat-row">
        {avgSleep && <div className="stat"><span style={{ color: durColor(avgSleep) }}>{fmtHours(avgSleep)}</span> {t('средняя длительность')}</div>}
        {avgBed !== null && <div className="stat"><span style={{ color: bedColor(avgBed) }}>{chartValToTime(avgBed)}</span> {t('среднее засыпание')}</div>}
        {avgWake !== null && <div className="stat"><span style={{ color: wakeColor(avgWake) }}>{chartValToTime(avgWake)}</span> {t('среднее пробуждение')}</div>}
        {avgEfficiency !== null && (
          <div className="stat">
            <span style={{ color: avgEfficiency >= 90 ? 'var(--green)' : avgEfficiency >= 85 ? 'var(--yellow)' : 'var(--red)' }}>
              {avgEfficiency}%
            </span>
            {t('эффективность сна')}
          </div>
        )}
        {bedtimeDays.length > 0 && (
          <div className="stat">
            <span>
              <span style={{ color: 'var(--green)' }}>{onTime}</span>
              {' / '}
              <span style={{ color: notOnTime > 0 ? 'var(--red)' : undefined }}>{notOnTime}</span>
            </span>
            {t('до/после полуночи')}
          </div>
        )}
      </div>

      {/* Duration chart */}
      <div className="chart-section">
        <h3>{t('Длительность сна')}</h3>
        <ResponsiveContainer width="100%" height={220}>
          {hasPhases ? (
            <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} unit={t('ч')} />
              <Tooltip formatter={(v) => v != null ? fmtHours(Number(v)) : '—'} />
              <Legend />
              <Bar dataKey="deep" name={t('Глубокий')} stackId="a" fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={1} />
              <Bar dataKey="rem" name="REM" stackId="a" fill="var(--chart-2)" stroke="var(--surface)" strokeWidth={1} />
              <Bar dataKey="core" name={t('Основной')} stackId="a" fill="var(--chart-neutral)" stroke="var(--surface)" strokeWidth={1} />
            </BarChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} unit={t('ч')} />
              <Tooltip formatter={(v) => v != null ? fmtHours(Number(v)) : '—'} />
              <Bar dataKey="total" name={t('Сон')} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Bedtime / Wake time chart */}
      <div className="chart-section">
        <h3>{t('Время засыпания и пробуждения')}</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={chartValToTime}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomBedtimeTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="bedtime" name={t('Засыпание')} stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="wake" name={t('Пробуждение')} stroke="var(--chart-2)" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
        <p className="chart-hint">{t('Ось Y — время суток')}</p>
      </div>

      {/* Table */}
      <div className="metrics-table-wrap">
        <table className="metrics-table">
          <thead>
            <tr>
              <th>{t('Дата')}</th>
              <th>{t('Засыпание')}</th>
              <th>{t('Пробуждение')}</th>
              <th>{t('Итого')}</th>
              {hasPhases && <><th>{t('Глубокий')}</th><th>REM</th><th>{t('Основной')}</th></>}
              {hasAwake && <th>{t('Бодрствование')}</th>}
            </tr>
          </thead>
          <tbody>
            {slice.slice().reverse().map(d => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{fmtTime(d.sleepBedtime)}</td>
                <td>{fmtTime(wakeOf(d))}</td>
                <td><strong>{fmtHours(d.sleepHours)}</strong></td>
                {hasPhases && (
                  <>
                    <td>{d.sleepDeep ? fmtHours(d.sleepDeep) : '—'}</td>
                    <td>{d.sleepREM ? fmtHours(d.sleepREM) : '—'}</td>
                    <td>{d.sleepCore ? fmtHours(d.sleepCore) : '—'}</td>
                  </>
                )}
                {hasAwake && <td>{d.sleepAwake != null ? fmtHours(d.sleepAwake) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
