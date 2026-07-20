import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { getMeals, type Meal } from '../../lib/api/intake'
import { isDemoActive } from '../../lib/demo'
import { demoList } from '../../lib/demoDb'
import { useT } from '../../lib/i18n'
import { MealLogger } from './MealLogger'
import { LoadError } from '../ui/LoadError'
import { startEffect } from '../../lib/startEffect'

interface DayAgg { date: string; calories: number; protein: number; carbs: number; fat: number; meals: Meal[] }

const GOAL_KEY = 'tonus_calorie_goal'

const demoMeals = (): Meal[] => {
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  return demoList('intake_events')
    .filter(e => e.type === 'meal' && e.ts >= since)
    .sort((a, b) => b.ts.localeCompare(a.ts)) as Meal[]
}

export function NutritionScreen({ user }: { user: User }) {
  const { t, locale } = useT()
  // Демо-приёмы пищи — ленивым инициализатором (эффект их уже не ставит).
  const [meals, setMeals] = useState<Meal[]>(() => isDemoActive() ? demoMeals() : [])
  const [loading, setLoading] = useState(() => !isDemoActive())
  const [loadError, setLoadError] = useState(false)
  const [goal, setGoal] = useState<number>(() => Number(localStorage.getItem(GOAL_KEY)) || 2000)
  const [editGoal, setEditGoal] = useState(false)

  // Перечитать приёмы пищи после добавления/ретрая. В демо это синхронный
  // setState, поэтому эффект её не зовёт — там стейт уже засеян инициализатором.
  function reloadMeals() {
    if (isDemoActive()) {
      setMeals(demoMeals())
      setLoadError(false)
      setLoading(false)
      return
    }
    loadMeals()
  }

  const loadMeals = useCallback(async () => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString()
    const data = await getMeals(user.id, since)
    if (data === null) setLoadError(true)
    else { setMeals(data); setLoadError(false) }
    setLoading(false)
  }, [user.id])

  useEffect(() => { if (!isDemoActive()) startEffect(loadMeals) }, [loadMeals])

  const days = useMemo<DayAgg[]>(() => {
    const map = new Map<string, DayAgg>()
    for (const m of meals) {
      const date = m.ts.slice(0, 10)
      const a = map.get(date) ?? { date, calories: 0, protein: 0, carbs: 0, fat: 0, meals: [] }
      a.calories += m.calories ?? 0
      a.protein += m.protein_g ?? 0
      a.carbs += m.carbs_g ?? 0
      a.fat += m.fat_g ?? 0
      a.meals.push(m)
      map.set(date, a)
    }
    return [...map.values()].sort((x, y) => y.date.localeCompare(x.date))
  }, [meals])

  const todayStr = new Date().toISOString().slice(0, 10)
  const today = days.find(d => d.date === todayStr)
  const withCal = days.filter(d => d.calories > 0)
  const avg = withCal.length ? Math.round(withCal.reduce((s, d) => s + d.calories, 0) / withCal.length) : 0

  const chartData = [...days].reverse().map(d => ({
    date: d.date.slice(5),
    calories: Math.round(d.calories),
  }))

  function saveGoal(v: number) {
    setGoal(v); localStorage.setItem(GOAL_KEY, String(v)); setEditGoal(false)
  }
  function fmtTime(ts: string) {
    return new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }
  function fmtDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
  }

  if (loading) return <div className="screen"><h2>{t('Питание')}</h2><p className="settings-muted">{t('Загрузка…')}</p></div>

  if (!meals.length) return (
    <div className="screen">
      <h2>{t('Питание')}</h2>
      {loadError && <LoadError onRetry={reloadMeals} />}
      <MealLogger user={user} onSaved={reloadMeals} />
    </div>
  )

  const todayCal = Math.round(today?.calories ?? 0)
  const pct = Math.min(100, Math.round((todayCal / goal) * 100))
  const barColor = todayCal > goal ? 'var(--red)' : 'var(--green)'

  return (
    <div className="screen">
      <h2>{t('Питание')}</h2>

      <MealLogger user={user} onSaved={reloadMeals} />

      {/* Сегодня */}
      <div className="nutr-today">
        <div className="nutr-today-head">
          <span>{t('Сегодня')}</span>
          {editGoal ? (
            <span className="nutr-goal-edit">
              {t('Цель')} <input type="number" defaultValue={goal} onBlur={e => saveGoal(Number(e.target.value) || goal)} autoFocus /> {t('ккал')}
            </span>
          ) : (
            <button className="nutr-goal-btn" onClick={() => setEditGoal(true)}>{t('Цель')}: {goal} {t('ккал')} ✎</button>
          )}
        </div>
        <div className="nutr-today-cal" style={{ color: barColor }}>{todayCal} <span>/ {goal} {t('ккал')}</span></div>
        <div className="nutr-bar-track"><div className="nutr-bar-fill" style={{ width: `${pct}%`, background: barColor }} /></div>
        {today && (
          <div className="nutr-macros">
            <span>{t('Белки')}: <b>{Math.round(today.protein)} {t('г')}</b></span>
            <span>{t('Углеводы')}: <b>{Math.round(today.carbs)} {t('г')}</b></span>
            <span>{t('Жиры')}: <b>{Math.round(today.fat)} {t('г')}</b></span>
          </div>
        )}
        <div className="nutr-avg settings-muted">{t('Среднее за период')}: {avg} {t('ккал/день')}</div>
      </div>

      {/* График по дням */}
      <h3 className="nutr-subtitle">{t('Калории по дням')}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <ReferenceLine y={goal} stroke="var(--text-muted)" strokeDasharray="4 3" />
          <Bar dataKey="calories" name={t('ккал')} fill="#6c8fff" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Список приёмов по дням */}
      <h3 className="nutr-subtitle">{t('История')}</h3>
      <div className="nutr-history">
        {days.map(d => (
          <div key={d.date} className="nutr-day">
            <div className="nutr-day-head">
              <span>{fmtDate(d.date)}</span>
              <b>{Math.round(d.calories)} {t('ккал')}</b>
            </div>
            {d.meals.map((m, i) => (
              <div key={i} className="nutr-meal">
                <span className="nutr-meal-name">🍽 {m.note || t('Еда')}</span>
                <span className="nutr-meal-info">{fmtTime(m.ts)}{m.calories ? ` · ${m.calories} ${t('ккал')}` : ''}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
