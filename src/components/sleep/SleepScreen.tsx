import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts'
import type { DailyMetrics } from '../../types'
import { useT } from '../../lib/i18n'

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
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
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
    const hrs = Math.floor(h)
    const mins = Math.round((h - hrs) * 60)
    return t('{h}ч {m}м', { h: hrs, m: mins })
  }

  const days = preset === '14d' ? 14 : preset === '30d' ? 30 : 90
  const slice = useMemo(() => daily.filter(d => d.sleepHours).slice(-days), [daily, days])

  const data = useMemo(() => slice.map(d => ({
    date: d.date.slice(5),
    total: d.sleepHours ? Math.round(d.sleepHours * 10) / 10 : null,
    deep: d.sleepDeep ? Math.round(d.sleepDeep * 10) / 10 : null,
    rem: d.sleepREM ? Math.round(d.sleepREM * 10) / 10 : null,
    core: d.sleepCore ? Math.round(d.sleepCore * 10) / 10 : null,
    bedtime: bedtimeToChartVal(d.sleepBedtime),
    wake: bedtimeToChartVal(d.sleepWakeTime),
  })), [slice])

  const hasPhases = slice.some(d => d.sleepDeep || d.sleepREM)

  const avgSleep = slice.length
    ? slice.reduce((a, d) => a + (d.sleepHours ?? 0), 0) / slice.length
    : null

  const avgBed = slice.filter(d => d.sleepBedtime).length
    ? slice.filter(d => d.sleepBedtime).reduce((a, d) => a + (bedtimeToChartVal(d.sleepBedtime) ?? 0), 0) / slice.filter(d => d.sleepBedtime).length
    : null

  const avgWake = slice.filter(d => d.sleepWakeTime).length
    ? slice.filter(d => d.sleepWakeTime).reduce((a, d) => a + (bedtimeToChartVal(d.sleepWakeTime) ?? 0), 0) / slice.filter(d => d.sleepWakeTime).length
    : null

  // Before-midnight compliance: bedtimeToChartVal < 12 means before midnight
  const bedtimeDays = slice.filter(d => d.sleepBedtime)
  const onTime = bedtimeDays.filter(d => (bedtimeToChartVal(d.sleepBedtime) ?? 99) < 12).length
  const notOnTime = bedtimeDays.length - onTime


  const CustomBedtimeTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="custom-tooltip">
        <p className="tooltip-date">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} style={{ color: p.color }}>
            {p.name}: {chartValToTime(p.value)}
          </p>
        ))}
      </div>
    )
  }

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
        {avgSleep && <div className="stat"><span>{fmtHours(avgSleep)}</span> {t('средняя длительность')}</div>}
        {avgBed !== null && <div className="stat"><span>{chartValToTime(avgBed)}</span> {t('среднее засыпание')}</div>}
        {avgWake !== null && <div className="stat"><span>{chartValToTime(avgWake)}</span> {t('среднее пробуждение')}</div>}
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} unit={t('ч')} />
              <Tooltip formatter={(v) => v != null ? fmtHours(Number(v)) : '—'} />
              <Legend />
              <Bar dataKey="deep" name={t('Глубокий')} stackId="a" fill="#6c8fff" />
              <Bar dataKey="rem" name="REM" stackId="a" fill="#5bc896" />
              <Bar dataKey="core" name={t('Основной')} stackId="a" fill="#8888a0" />
            </BarChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} unit={t('ч')} />
              <Tooltip formatter={(v) => v != null ? fmtHours(Number(v)) : '—'} />
              <Bar dataKey="total" name={t('Сон')} fill="var(--accent)" radius={[3, 3, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Bedtime / Wake time chart */}
      <div className="chart-section">
        <h3>{t('Время засыпания и пробуждения')}</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={chartValToTime}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomBedtimeTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="bedtime" name={t('Засыпание')} stroke="var(--accent)" dot={false} connectNulls />
            <Line type="monotone" dataKey="wake" name={t('Пробуждение')} stroke="var(--green)" dot={false} connectNulls />
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
            </tr>
          </thead>
          <tbody>
            {slice.slice().reverse().map(d => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{fmtTime(d.sleepBedtime)}</td>
                <td>{fmtTime(d.sleepWakeTime)}</td>
                <td><strong>{fmtHours(d.sleepHours)}</strong></td>
                {hasPhases && (
                  <>
                    <td>{d.sleepDeep ? fmtHours(d.sleepDeep) : '—'}</td>
                    <td>{d.sleepREM ? fmtHours(d.sleepREM) : '—'}</td>
                    <td>{d.sleepCore ? fmtHours(d.sleepCore) : '—'}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
