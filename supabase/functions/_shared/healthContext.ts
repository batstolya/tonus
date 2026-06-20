// Канонический слой сборки контекста здоровья для всех ИИ-функций.
// Один источник правды: бот, коуч, отчёты используют его, чтобы логика
// контекста не разъезжалась между функциями (см. new-speca-refactoring #1).

export interface HealthContextOptions {
  periodDays?: number          // окно агрегации (по умолчанию 14)
  includeCoachProfile?: boolean // подмешивать память коуча сверху
}

export interface HealthContext {
  periodDays: number
  coachProfile: { summary: string; facts: string[] } | null
  scores: Record<string, any> | null
  metrics: Record<string, any>[]
  sleep: Record<string, any>[]
  labs: Record<string, any>[]
  supplements: string[]
  intake: Record<string, any>[]
  supplementLogs: Record<string, any>[]
  notes: Record<string, any>[]
  calendar: Record<string, any>[]
}

const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
const num = (r: any[], k: string) => r.map(x => x[k]).filter((v: any) => v != null && !isNaN(v))

// Собирает структурированный контекст из БД (service-role или RLS-клиент).
export async function buildHealthContext(
  supabase: any,
  userId: string,
  opts: HealthContextOptions = {},
): Promise<HealthContext> {
  const periodDays = opts.periodDays ?? 14
  const since = new Date(); since.setDate(since.getDate() - periodDays)
  const sinceStr = since.toISOString().slice(0, 10)

  const [profRes, scoreRes, mRes, sRes, labRes, supRes, intakeRes, logRes, notesRes, calRes] = await Promise.all([
    opts.includeCoachProfile
      ? supabase.from('coach_profile').select('summary, facts').eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('daily_scores').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('daily_metrics')
      .select('date, resting_heart_rate, hrv, sleep_hours, steps, active_energy, oxygen_saturation')
      .eq('user_id', userId).gte('date', sinceStr).order('date', { ascending: true }),
    supabase.from('sleep_sessions')
      .select('date, duration_hours, deep_hours, rem_hours, core_hours')
      .eq('user_id', userId).gte('date', sinceStr).order('date', { ascending: false }),
    supabase.from('lab_results')
      .select('marker, value, unit, ref_range, flag, date')
      .eq('user_id', userId).order('date', { ascending: false }).limit(200),
    supabase.from('supplements').select('name').eq('user_id', userId),
    supabase.from('intake_events')
      .select('ts, type, amount, unit, note, calories, protein_g, carbs_g, fat_g')
      .eq('user_id', userId).gte('ts', `${sinceStr}T00:00:00Z`)
      .neq('type', 'water') // вода низкоинформативна, экономим токены
      .order('ts', { ascending: false }).limit(40),
    supabase.from('supplement_logs')
      .select('date, taken, supplements(name)')
      .eq('user_id', userId).gte('date', sinceStr).eq('taken', true).order('date', { ascending: false }).limit(40),
    supabase.from('context_notes')
      .select('date, note')
      .eq('user_id', userId).gte('date', sinceStr).order('date', { ascending: false }),
    supabase.from('calendar_events')
      .select('start_ts')
      .eq('user_id', userId).gte('start_ts', `${sinceStr}T00:00:00Z`).order('start_ts', { ascending: false }),
  ])

  const prof = profRes.data
  return {
    periodDays,
    coachProfile: prof?.summary ? { summary: prof.summary, facts: Array.isArray(prof.facts) ? prof.facts : [] } : null,
    scores: scoreRes.data ?? null,
    metrics: mRes.data ?? [],
    sleep: sRes.data ?? [],
    labs: labRes.data ?? [],
    supplements: (supRes.data ?? []).map((s: any) => s.name),
    intake: intakeRes.data ?? [],
    supplementLogs: logRes.data ?? [],
    notes: notesRes.data ?? [],
    calendar: calRes.data ?? [],
  }
}

// Рендерит контекст в текст для промпта (формат совместим с прежним ботом).
export function healthContextToText(ctx: HealthContext): string {
  const parts: string[] = []

  if (ctx.coachProfile) {
    const facts = ctx.coachProfile.facts.length ? `\nФакты: ${ctx.coachProfile.facts.join('; ')}` : ''
    parts.push(`=== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ (помни это) ===\n${ctx.coachProfile.summary}${facts}\n`)
  }

  if (ctx.scores) {
    const s = ctx.scores
    const sc: string[] = []
    if (s.readiness != null) sc.push(`готовность ${s.readiness}/100`)
    if (s.recovery_score != null) sc.push(`восстановление ${s.recovery_score}/100`)
    if (s.sleep_score != null) sc.push(`сон ${s.sleep_score}/100`)
    if (s.stress_score != null) sc.push(`нагрузка ${s.stress_score}/100`)
    if (sc.length) parts.push(`=== ОЦЕНКИ (${s.date}) ===\n${sc.join(', ')}`)
    // персональная норма (базовая линия)
    const base: string[] = []
    if (s.hrv_baseline != null) base.push(`HRV ~${Math.round(s.hrv_baseline)}мс`)
    if (s.rhr_baseline != null) base.push(`пульс покоя ~${Math.round(s.rhr_baseline)}`)
    if (s.sleep_baseline != null) base.push(`сон ~${s.sleep_baseline.toFixed(1)}ч`)
    if (base.length) parts.push(`Персональная норма (30 дней): ${base.join(', ')}. Сравнивай текущие значения с этой нормой, а не с абсолютной.`)
  }

  const rows = ctx.metrics
  parts.push(`=== ДАННЫЕ ЗА ${ctx.periodDays} ДНЕЙ (${rows.length} дн.) ===`)
  if (rows.length) {
    const rhr = num(rows, 'resting_heart_rate'), hrv = num(rows, 'hrv')
    const sleep = num(rows, 'sleep_hours'), steps = num(rows, 'steps')
    const energy = num(rows, 'active_energy'), spo2 = num(rows, 'oxygen_saturation')
    if (rhr.length) parts.push(`ЧСС покоя: средн ${avg(rhr)!.toFixed(0)} уд/мин (от ${Math.min(...rhr)} до ${Math.max(...rhr)})`)
    if (hrv.length) parts.push(`HRV: средн ${avg(hrv)!.toFixed(0)} мс (от ${Math.min(...hrv)} до ${Math.max(...hrv)})`)
    if (sleep.length) parts.push(`Сон: средн ${avg(sleep)!.toFixed(1)} ч/ночь (от ${Math.min(...sleep).toFixed(1)} до ${Math.max(...sleep).toFixed(1)})`)
    if (steps.length) parts.push(`Шаги: средн ${Math.round(avg(steps)!).toLocaleString('ru-RU')}/день`)
    if (energy.length) parts.push(`Активные ккал: средн ${Math.round(avg(energy)!)}/день`)
    if (spo2.length) parts.push(`SpO2: средн ${(avg(spo2)! * 100).toFixed(0)}%`)
    const daily = rows.slice(-5).map((r: any) =>
      `${r.date}: сон ${r.sleep_hours?.toFixed?.(1) ?? '—'}ч, ЧССп ${r.resting_heart_rate ?? '—'}, шаги ${r.steps ?? '—'}`
    ).join('\n')
    parts.push(`\nПоследние дни:\n${daily}`)
  } else {
    parts.push('Нет данных за период.')
  }

  if (ctx.sleep.length) {
    const dh = num(ctx.sleep, 'deep_hours'), rh = num(ctx.sleep, 'rem_hours'), ch = num(ctx.sleep, 'core_hours')
    parts.push(`\nФазы сна (${ctx.periodDays} дней):`)
    if (dh.length) parts.push(`Глубокий: средн ${avg(dh)!.toFixed(1)} ч/ночь`)
    if (rh.length) parts.push(`REM: средн ${avg(rh)!.toFixed(1)} ч/ночь`)
    if (ch.length) parts.push(`Лёгкий/ядро: средн ${avg(ch)!.toFixed(1)} ч/ночь`)
    const recent = ctx.sleep.slice(0, 7).map((s: any) =>
      `${s.date}: всего ${s.duration_hours?.toFixed?.(1) ?? '—'}ч (глуб ${s.deep_hours?.toFixed?.(1) ?? '—'}, REM ${s.rem_hours?.toFixed?.(1) ?? '—'})`
    ).join('\n')
    parts.push(`Последние ночи:\n${recent}`)
  }

  if (ctx.labs.length) {
    const byMarker: Record<string, any[]> = {}
    for (const r of ctx.labs) (byMarker[r.marker] ??= []).push(r)
    parts.push('\nАнализы (последние значения; ⚠️ = вне нормы):')
    const flagTxt = (f: string | null) => f === 'high' ? ' ⚠️ВЫШЕ' : f === 'low' ? ' ⚠️НИЖЕ' : ''
    for (const [marker, entries] of Object.entries(byMarker)) {
      const latest = entries[0]
      const unit = latest.unit ? ` ${latest.unit}` : ''
      const ref = latest.ref_range ? ` [норма ${latest.ref_range}]` : ''
      const fl = flagTxt(latest.flag)
      if (entries.length >= 2) {
        const d = latest.value - entries[1].value
        parts.push(`${marker}: ${latest.value}${unit}${fl}${ref} (${latest.date}, ${d > 0 ? '+' : ''}${d.toFixed(1)} к ${entries[1].date})`)
      } else {
        parts.push(`${marker}: ${latest.value}${unit}${fl}${ref} (${latest.date})`)
      }
    }
  }

  if (ctx.supplements.length) parts.push(`\nПрепараты: ${ctx.supplements.join(', ')}`)

  if (ctx.intake.length) {
    const tLabels: Record<string, string> = { coffee: 'кофе', alcohol: 'алкоголь', meal: 'еда', water: 'вода', meds: 'лекарство', custom: 'заметка' }
    parts.push('\nСобытия (кофе/алкоголь/еда):')
    for (const e of ctx.intake) {
      const d = new Date(e.ts).toISOString().slice(0, 16).replace('T', ' ')
      const amt = e.amount ? ` ${e.amount}${e.unit ?? ''}` : ''
      const kcal = e.calories ? ` ≈${e.calories} ккал` : ''
      parts.push(`${d} ${tLabels[e.type] ?? e.type}${amt}${e.note ? ` (${e.note})` : ''}${kcal}`)
    }
    // суточные калории по дням, где есть оценки
    const kcalByDay: Record<string, number> = {}
    for (const e of ctx.intake) if (e.calories) kcalByDay[e.ts.slice(0, 10)] = (kcalByDay[e.ts.slice(0, 10)] ?? 0) + e.calories
    const days = Object.keys(kcalByDay).sort().reverse()
    if (days.length) {
      parts.push('Калории по дням (оценка):')
      for (const day of days) parts.push(`${day}: ~${kcalByDay[day]} ккал`)
    }
  }

  if (ctx.supplementLogs.length) {
    // Сжимаем: считаем сколько дней принял каждый препарат, не перечисляем каждый день
    const countByName: Record<string, number> = {}
    for (const l of ctx.supplementLogs) {
      const name = (l.supplements as any)?.name
      if (name) countByName[name] = (countByName[name] ?? 0) + 1
    }
    const total = ctx.periodDays
    const summary = Object.entries(countByName).map(([n, c]) => `${n}: ${c}/${total} дн`).join(', ')
    parts.push(`\nПриём препаратов: ${summary}`)
  }

  if (ctx.notes.length) {
    parts.push('\nЗаметки дня (со слов пользователя):')
    for (const n of ctx.notes) parts.push(`${n.date}: ${n.note}`)
  }

  if (ctx.calendar.length) {
    const byDay: Record<string, number> = {}
    for (const e of ctx.calendar) { const d = (e.start_ts as string).slice(0, 10); byDay[d] = (byDay[d] ?? 0) + 1 }
    const perDay = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).map(([d, c]) => `${d.slice(5)}—${c}`).join(', ')
    parts.push(`\nКалендарь (встречи — нагрузка дня): всего ${ctx.calendar.length}. По дням: ${perDay}`)
  }

  return parts.join('\n')
}
